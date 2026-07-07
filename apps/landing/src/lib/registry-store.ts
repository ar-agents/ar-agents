/**
 * Registry store: the KV-backed (with in-memory fallback) data model behind the
 * /registro + /en/registry page AND the public good-standing oracle.
 *
 * The hardcoded SEED array (the 5 live entries + the placeholder) is the source
 * of truth that ships in code and is NEVER deleted — it guarantees the registry
 * page renders even with KV down (Upstash outage, local dev with no KV wired),
 * so neither /registro nor /en/registry can ever 500 on a data-store failure.
 *
 * KV adds two things on top of the seed:
 *   - self-listed entries (POST /api/registry), and
 *   - mutable good-standing state per entry (the certifier verdict + history).
 *
 * On id collision KV WINS over the seed (so a seed entry's good-standing can be
 * refreshed in KV without editing code), but the seed entry is always the
 * fallback if KV is unreachable.
 *
 * This file copies the isKvWired() + in-memory-fallback pattern verbatim from
 * api/conformance-history/route.ts and lib/capability-token.ts so behaviour is
 * consistent with the rest of the app.
 */

import { kv } from "@vercel/kv";
import { withKvLock, KvLockError } from "./kv-lock";

// ─────────────────────────────────────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────────────────────────────────────

export type RegistryType =
  | "reference-implementation"
  | "demo"
  | "productive-sociedad-ia"
  | "library-only";

export type RegistryStatus =
  | "live"
  | "draft"
  | "deprecated"
  // ── NEW (additive) — the formation lifecycle the BIRTH wedge feeds ──
  // A "forming" entry was created by an incorporation but is NOT yet operative:
  // it is the registry stub minted at birth (the supply side of the loop). It is
  // NEVER good-standing/attesting until it actually goes live. The garbage
  // collector flips a long-stalled "forming" entry to "stale" (reversible). Both
  // are explicitly non-attesting in the oracle, so the corpus stays high-signal.
  | "forming"
  | "stale";

export type GoodStandingState =
  | "active"
  | "suspended"
  | "revoked"
  | "unverified";

export type Rating = "A" | "B" | "C" | "D" | "F" | "N/A";

export interface GoodStanding {
  state: GoodStandingState;
  /** ISO of the last certifier run that set this, or null if never checked. */
  lastCheckedAt: string | null;
  /** 0-100 from the last certifier run, or null. */
  lastScore: number | null;
  lastRating: Rating | null;
  /** Optional human-readable reason (e.g. why suspended/revoked). */
  reason?: string;
}

/** A formation-checklist step, addressable so a founder/agent can advance it. */
export type ChecklistState = "pending" | "in_progress" | "done" | "blocked";
export interface ChecklistItem {
  /** Stable slug id for the step (e.g. "constituir", "afip-alta"). */
  id: string;
  /** Human label (the prose generateChecklist() string is reused here). */
  label: string;
  state: ChecklistState;
  /** Optional free-form pointer to proof the step was done (url, hash, note). */
  evidence?: string;
  /** ISO of the last state change, if any. */
  advancedAt?: string;
}

/**
 * Formation sub-record carried by a `forming`/`stale` entry. ALL fields optional
 * so a record can carry a partial formation state, and so the seed array (which
 * has no formation block) casts in unchanged. `lastProgressAt` is the signal the
 * garbage collector reads to decide staleness.
 */
export interface FormationState {
  checklist?: ChecklistItem[];
  /** sha256 of the Formation Pack manifest, when one was generated. */
  packHash?: string;
  /**
   * The Formation Pack's machine-readable sidecar (the single source of truth for
   * the entity's legal params). Stored OPAQUE here (Record) so registry-store does
   * not depend on formation-pack; the formation route casts it back to render the
   * human drafts deterministically. Optional -> seed casts unchanged.
   */
  sidecar?: Record<string, unknown>;
  /** ISO of the last checklist advance or audit-log activity for this entry. */
  lastProgressAt?: string;
}

/**
 * RegistryRecord extends the page's original RegistryEntry shape ADDITIVELY:
 * every new field is optional OR has a seed-safe default so the seed array
 * literal below casts in unchanged.
 */
export interface RegistryRecord {
  /** slug id, `^[a-z0-9][a-z0-9-]{1,62}$`. Stable key for KV + oracle lookup. */
  id: string;
  name: string;
  type: RegistryType;
  jurisdiction: string;
  operator: string;
  /**
   * The operator's CUIT. For a SELF-LISTED entry this is SELF-DECLARED and
   * UNPROVEN — anyone can type any CUIT, so it must NEVER be presented as an
   * authoritative identity claim in the signed good-standing answer, and the
   * ?cuit= oracle lookup must NOT resolve a self-declared CUIT. It is only
   * authoritative when source==="seed" OR `verifiedCuit === true` (which the
   * self-list path never sets — there is no AFIP/padron verification wired yet).
   */
  operatorCuit?: string;
  /** True only when operatorCuit has been independently verified (seed/admin). */
  verifiedCuit?: boolean;
  publicUrl: string;
  rfcConformance: string[];
  disclosure: { es: string; en: string };
  status: RegistryStatus;
  listedSince: string;
  // ── NEW (additive) ──
  goodStanding: GoodStanding;
  /** Set only on KV-created (self-listed) entries; the write-once owner cap-token hash. */
  ownerTokenHash?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * "formed" marks a stub minted by an incorporation (the BIRTH wedge). A
   * self-declared CUIT on a "formed" entry is NEVER authoritative — same posture
   * as "self-listed" (see hasAuthoritativeCuit). Additive: pre-existing call
   * sites that compare against "seed"/"self-listed" are unaffected.
   */
  source: "seed" | "self-listed" | "formed";
  /**
   * The incorporation sessionId that minted this stub — the audit-log id, and the
   * key the art. 102 kill-switch / suspension set (`society:suspended`) is keyed on.
   * Present only on `formed` entries. The slug `id` and the sessionId are otherwise
   * UNLINKED id-spaces, so the oracle needs this to reconcile a suspended society
   * with its registry record (see the good-standing route's isSuspended overlay).
   * NEVER surfaced in the signed answer (buildRecordSummary omits it). Optional →
   * seed + pre-existing self-listed entries cast in unchanged.
   */
  sessionId?: string;
  /** Present only on `forming`/`stale` entries (the formation lifecycle). Optional → seed casts unchanged. */
  formation?: FormationState;
  /**
   * PII-FREE USD-rail posture a counterparty reads: which USD rail the entity
   * settles in, OUSD enablement, yield opt-in. Additive/optional (seed casts
   * unchanged). NEVER carries amounts, balances, or addresses.
   */
  railPosture?: RailPosture;
  /**
   * PII-FREE key-control posture a counterparty reads: whether ar-agents is the
   * custodial signer or the UBO controls the root keys (BYOK). Additive/optional
   * (seed casts unchanged). NEVER carries key material, addresses, or secrets.
   */
  keyPosture?: KeyPosture;
}

/** The entity's declared USD-rail posture (PII-free). Absent = ARS-only. */
export interface RailPosture {
  /** The USD rail the entity settles in, if any. null/absent = ARS-only. */
  usdRail?: "ousd" | "usdc" | "other" | null;
  /** OUSD explicitly enabled for this entity. */
  ousdEnabled?: boolean;
  /** Entity opts into OUSD reserve yield (a partner/config choice). */
  yieldEnabled?: boolean;
  /** ISO of the last posture update. */
  asOf?: string;
}

/**
 * The entity's declared KEY-CONTROL posture (PII-free). Sovereignty tiering: an
 * entity is only self-sovereign if the UBO controls the root keys. Absent =
 * unspecified. NEVER carries key material.
 */
export interface KeyPosture {
  /**
   * custodial: ar-agents is the custodial signer (managed keys).
   * ubo_controlled: the UBO injects their own root key (BYOK); ar-agents operates
   * bounded, revocable sub-keys.
   */
  mode?: "custodial" | "ubo_controlled";
  /** ISO of the last posture update. */
  asOf?: string;
}

export const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

/**
 * Signals a by-url-index/origin hijack on upsert: a self-list tried to claim an
 * origin already bound to a different id, or an origin owned by a seed entry.
 * The caller (POST /api/registry) maps this to a 409 `url_taken`.
 */
export class UrlTakenError extends Error {
  constructor() {
    super("url_taken");
    this.name = "UrlTakenError";
  }
}

/**
 * Signals a self-list whose operatorCuit is already bound to ANOTHER entry
 * (CUIT dedup). The caller maps this to a 409 `cuit_taken`.
 */
export class CuitTakenError extends Error {
  constructor() {
    super("cuit_taken");
    this.name = "CuitTakenError";
  }
}

/**
 * Signals an attempt to move an entity OUT of the terminal `revoked` good-standing
 * state. `revoked` is the kill-switch terminal: once killed, an entity stays
 * killed. This is enforced at the storage seam (setGoodStanding) so NO write path
 * — the lifecycle wrappers, the PATCH /api/registry admin override, the oracle
 * re-certify — can silently re-activate a killed entity. Callers map it to 409.
 */
export class RevokedTerminalError extends Error {
  constructor() {
    super("revoked_terminal");
    this.name = "RevokedTerminalError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed (NEVER deleted). The 5 live entries + the placeholder, ported verbatim
// from the old hardcoded REGISTRY in registro/content.tsx. Every entry gets an
// explicit stable `id`, a default goodStanding, and source:"seed".
// ─────────────────────────────────────────────────────────────────────────────

const SEED_DEFAULTS = {
  createdAt: "2026-05-05T00:00:00.000Z",
  updatedAt: "2026-05-05T00:00:00.000Z",
  source: "seed" as const,
};

/** A seed entry's default good-standing: live entries are active, the placeholder unverified. */
function seedGoodStanding(status: RegistryStatus): GoodStanding {
  return {
    state: status === "live" ? "active" : "unverified",
    lastCheckedAt: null,
    lastScore: null,
    lastRating: null,
  };
}

export const SEED: ReadonlyArray<RegistryRecord> = [
  {
    id: "ar-agents-reference",
    name: "ar-agents (this site, reference implementation)",
    type: "reference-implementation",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://ar-agents.ar",
    rfcConformance: ["rfc-001-v1", "rfc-002-v1", "rfc-003-draft", "rfc-004-draft"],
    disclosure: {
      es: "Implementación de referencia de la especificación. Aloja /play (demo interactivo), /verify (verificación HMAC), /api/play/audit/* (endpoints de auditoría), /test-vectors (vectores de conformidad). No es una sociedad productiva, no transacciona con clientes reales, no emite facturas, no cobra. Fuente de verdad del spec.",
      en: "Reference implementation of the spec. Hosts /play (interactive demo), /verify (HMAC verification), /api/play/audit/* (audit endpoints), /test-vectors (conformance vectors). Not a productive company, i.e. does not transact with real customers, does not emit invoices, does not collect. Source of truth for the spec.",
    },
    status: "live",
    listedSince: "2026-05-05",
    goodStanding: seedGoodStanding("live"),
    ...SEED_DEFAULTS,
  },
  {
    id: "mp-hello-demo",
    name: "mp-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://mp-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure: {
      es: "Demo de integración con Mercado Pago Subscriptions. Conectado a un MP sandbox real + producción app 178743372667921. Muestra la lib @ar-agents/mercadopago end-to-end. No es una sociedad productiva.",
      en: "Mercado Pago Subscriptions integration demo. Wired to a real MP sandbox + production app 178743372667921. Shows the @ar-agents/mercadopago lib end-to-end. Not a productive company.",
    },
    status: "live",
    listedSince: "2026-05-05",
    goodStanding: seedGoodStanding("live"),
    ...SEED_DEFAULTS,
  },
  {
    id: "cuit-hello-demo",
    name: "cuit-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://cuit-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure: {
      es: "Demo de consulta a padrón AFIP/ARCA + validación de CUIT. Usa un cert AFIP real (homo por seguridad; cert prod disponible). Muestra la lib @ar-agents/identity end-to-end. No es una sociedad productiva.",
      en: "AFIP/ARCA padron lookup + CUIT validation demo. Uses a real AFIP cert (homo for safety; prod cert available). Shows the @ar-agents/identity lib end-to-end. Not a productive company.",
    },
    status: "live",
    listedSince: "2026-05-05",
    goodStanding: seedGoodStanding("live"),
    ...SEED_DEFAULTS,
  },
  {
    id: "whatsapp-hello-demo",
    name: "whatsapp-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://whatsapp-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure: {
      es: "Demo de WhatsApp Business Cloud API combinando libs de identity + MP + WhatsApp. Handler de webhook + UI de chat. Limitado por el cap de 5 destinatarios en dev hasta que pase la verificación de negocio de Meta.",
      en: "WhatsApp Business Cloud API demo combining identity + MP + WhatsApp libs. Webhook handler + chat UI. Limited by Meta verification 5-recipient dev cap until business verification passes.",
    },
    status: "live",
    listedSince: "2026-05-05",
    goodStanding: seedGoodStanding("live"),
    ...SEED_DEFAULTS,
  },
  {
    id: "bridge-hello-demo",
    name: "bridge-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://bridge-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure: {
      es: "Demo de Agentic Commerce Bridge. Superficies AP2 + ACP + MCP conectadas a MP. Muestra cómo un agente extranjero (Wyoming DAO LLC) interactúa con una sociedad automatizada argentina según receta 21 del cookbook.",
      en: "Agentic Commerce Bridge demo. AP2 + ACP + MCP protocol surfaces wired to MP. Shows how a foreign agent (Wyoming DAO LLC) interacts with an AR automated company per cookbook recipe 21.",
    },
    status: "live",
    listedSince: "2026-05-05",
    goodStanding: seedGoodStanding("live"),
    ...SEED_DEFAULTS,
  },
  {
    id: "your-company-here",
    name: "(your automated company here)",
    type: "productive-sociedad-ia",
    jurisdiction: "AR",
    operator: "-",
    publicUrl: "-",
    rfcConformance: [],
    disclosure: {
      es: "Abrí un PR agregando los metadatos de tu sociedad automatizada a apps/landing/src/app/registro/page.tsx en github.com/ar-agents/ar-agents, o auto-listate vía POST /api/registry. Incluí: nombre, operador + CUIT, URL pública, RFCs conformados, disclosure en lenguaje claro. La entrada se publica cuando el certificador automático verifica los endpoints declarados (rating ≥ C).",
      en: "Open a PR adding your automated company's metadata to apps/landing/src/app/registro/page.tsx in github.com/ar-agents/ar-agents, or self-list via POST /api/registry. Provide: name, operator name + CUIT, public URL, RFCs you conform to, plain-English disclosure. The entry goes live once the automated certifier verifies the declared endpoints (rating ≥ C).",
    },
    status: "draft",
    listedSince: "-",
    goodStanding: seedGoodStanding("draft"),
    ...SEED_DEFAULTS,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// KV plumbing (copied from conformance-history + capability-token)
// ─────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

/**
 * base64url of a UTF-8 string, Web-standard (no Node Buffer). This module is
 * imported by an EDGE route (good-standing oracle), where `Buffer` is not a
 * global — mirrors the helper in lib/certificate.ts + the good-standing route.
 */
function b64url(s: string): string {
  const bytes = enc.encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const KEY_ENTRY = (id: string) => `registry:entry:${id}`;
const KEY_IDS = "registry:ids";
const KEY_BY_URL = (origin: string) => `registry:by-url:${b64url(origin)}`;

/** Bound the id set so a flood of self-lists can't grow KV unboundedly. */
export const MAX_IDS = 5000;

// Per-isolate fallback when KV isn't wired (local dev, KV outage).
const memEntries = new Map<string, RegistryRecord>();
const memIds = new Set<string>();
const memByUrl = new Map<string, string>();

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

/** Normalize a URL to its origin for the by-url index. Returns null if unparseable. */
export function urlOrigin(u: string): string | null {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

/** The set of origins owned by SEED entries (the placeholder's "-" is excluded).
 * A self-list can NEVER claim one of these — that would let an attacker hijack
 * the by-url index for ar-agents.ar itself and forge a signed "active" answer. */
const SEED_ORIGINS: ReadonlySet<string> = new Set(
  SEED.map((s) => urlOrigin(s.publicUrl)).filter(
    (o): o is string => o !== null,
  ),
);

/** Whether `origin` is owned by a seed entry. */
export function isSeedOrigin(origin: string): boolean {
  return SEED_ORIGINS.has(origin);
}

/**
 * Whether this record's operatorCuit is an AUTHORITATIVE identity claim (safe to
 * present in the signed good-standing answer / resolve by ?cuit=). A
 * self-declared CUIT on a self-listed entry is NOT authoritative — only a seed
 * entry's CUIT or an explicitly-verified one is.
 */
export function hasAuthoritativeCuit(rec: RegistryRecord): boolean {
  return Boolean(rec.operatorCuit) && (rec.source === "seed" || rec.verifiedCuit === true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads — always seed-safe: KV errors fall back to the seed, never throw.
// ─────────────────────────────────────────────────────────────────────────────

/** All KV record ids (empty on KV-down). */
async function kvIds(): Promise<string[]> {
  if (!isKvWired()) return Array.from(memIds);
  try {
    const ids = await kv.smembers<string[]>(KEY_IDS);
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

async function kvGet(id: string): Promise<RegistryRecord | null> {
  if (!isKvWired()) return memEntries.get(id) ?? null;
  try {
    const rec = await kv.get<RegistryRecord>(KEY_ENTRY(id));
    return rec ?? null;
  } catch {
    return null;
  }
}

/**
 * The full registry: seed entries merged with KV entries, KV winning on id
 * collision. NEVER throws — a KV outage degrades to the seed array so the page
 * renders. Returns a fresh array each call (callers may sort/filter freely).
 */
export async function listRecords(): Promise<RegistryRecord[]> {
  const byId = new Map<string, RegistryRecord>();
  // Seed first (baseline, always present).
  for (const s of SEED) byId.set(s.id, s);
  // KV overlays / adds.
  const ids = await kvIds();
  if (ids.length > 0) {
    const fetched = await Promise.all(ids.map((id) => kvGet(id)));
    for (const rec of fetched) {
      if (rec && ID_RE.test(rec.id)) byId.set(rec.id, rec); // KV wins on collision
    }
  }
  return Array.from(byId.values());
}

/** One record by id. Seed fallback applies. */
export async function getRecord(id: string): Promise<RegistryRecord | null> {
  if (!ID_RE.test(id)) return null;
  const fromKv = await kvGet(id);
  if (fromKv) return fromKv;
  return SEED.find((s) => s.id === id) ?? null;
}

/**
 * Lookup by public URL origin. Tries the KV by-url index first (O(1)), then
 * falls back to a scan over the merged list (covers seed + KV without an index).
 */
export async function getRecordByUrl(u: string): Promise<RegistryRecord | null> {
  const origin = urlOrigin(u);
  if (!origin) return null;
  // Fast path: KV index → id → record. HARDENED: a resolved record is only
  // returned if ITS OWN publicUrl origin equals the queried origin. A stale or
  // poisoned by-url index (origin bound to an id whose record no longer/never
  // had that origin) must NEVER return a mismatched record — that would let a
  // counterparty querying origin A receive a signed "active" answer about a
  // DIFFERENT operator B. On any mismatch, fall through to the seed-preferring
  // scan, which matches origins structurally.
  if (isKvWired()) {
    try {
      const id = await kv.get<string>(KEY_BY_URL(origin));
      if (id) {
        const rec = await kvGet(id);
        if (rec && urlOrigin(rec.publicUrl) === origin) return rec;
      }
    } catch {
      // fall through to scan
    }
  } else {
    const id = memByUrl.get(origin);
    if (id) {
      const rec = memEntries.get(id);
      if (rec && urlOrigin(rec.publicUrl) === origin) return rec;
    }
  }
  // Fallback scan over the merged list (matches seed + un-indexed KV entries).
  // Seed-preferring: a seed entry for the origin always wins over a self-listed
  // one (the seed is code-owned ground truth), defeating an index poisoning that
  // tried to shadow a seed origin.
  const all = await listRecords();
  const matches = all.filter((r) => urlOrigin(r.publicUrl) === origin);
  if (matches.length === 0) return null;
  return matches.find((r) => r.source === "seed") ?? matches[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes — KV-or-memory. Used only by the authenticated write API.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the id currently bound to `origin` in the by-url index, if any.
 * Used by upsert's claim-guard. Seed-safe (KV errors → null, scan covers seed).
 */
async function idBoundToOrigin(origin: string): Promise<string | null> {
  if (isKvWired()) {
    try {
      const id = await kv.get<string>(KEY_BY_URL(origin));
      if (id) return id;
    } catch {
      // fall through to scan
    }
  } else {
    const id = memByUrl.get(origin);
    if (id) return id;
  }
  // Scan covers seed entries + any un-indexed KV row for this origin.
  const all = await listRecords();
  return all.find((r) => urlOrigin(r.publicUrl) === origin)?.id ?? null;
}

/** Find an EXISTING entry (other than `selfId`) whose operatorCuit matches. */
async function entryWithCuit(
  cuitDigits: string,
  selfId: string,
): Promise<RegistryRecord | null> {
  if (!cuitDigits) return null;
  const all = await listRecords();
  return (
    all.find(
      (r) =>
        r.id !== selfId &&
        r.operatorCuit &&
        r.operatorCuit.replace(/\D/g, "") === cuitDigits,
    ) ?? null
  );
}

/**
 * Serialize a read-modify-write on ONE entity's record across isolates. The
 * caller performs its read + validate + write INSIDE `fn` using the UNLOCKED
 * `*Raw` writers, so the whole critical section is atomic — closing the lost-update
 * and the revoked→active resurrection races (two privileged writers each validating
 * against a pre-mutation snapshot, then blind-writing the whole record). No-op lock
 * in memory mode (single isolate). Do NOT nest two locks on the same id (see kv-lock).
 */
export async function withEntityLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  return withKvLock(`registry:entry:${id}`, fn);
}

/**
 * UNLOCKED create/replace (claim-guard + set). A caller that read-modify-writes a
 * record MUST hold `withEntityLock(rec.id)` around its read + this write. Standalone
 * callers use the locked {@link upsertRecord} wrapper instead.
 *
 * Maintains the id set + by-url index. Returns the stored record, or null when the
 * id set is at capacity (abuse bound) for a NEW id. Updating an existing id is
 * always allowed (it keeps its own origin/cuit).
 *
 * CLAIM-GUARD (only for a NEW id, i.e. self-listing a fresh entry):
 *  - REFUSE (throw UrlTakenError) if the entry's origin is a SEED origin, or is
 *    already bound to a DIFFERENT id. This stops a by-url index hijack where a
 *    self-list claims ar-agents.ar (or another operator's origin) and thereby
 *    poisons the oracle's url→id resolution.
 *  - REFUSE (throw CuitTakenError) if operatorCuit is already bound to another
 *    entry (CUIT impersonation / dedup).
 * On refusal NOTHING is written (no record, no index, no id-set membership).
 */
export async function upsertRecordRaw(rec: RegistryRecord): Promise<RegistryRecord | null> {
  if (!ID_RE.test(rec.id)) return null;
  const origin = urlOrigin(rec.publicUrl);

  const isNew = isKvWired()
    ? !(await kv.sismember(KEY_IDS, rec.id).catch(() => 0))
    : !memIds.has(rec.id);

  // Claim-guard runs only for genuinely-new SELF-LISTED ids. It is skipped for
  // seed records (materializing a code-owned seed entry into KV so its
  // good-standing becomes mutable is legitimate, even though its origin is a
  // seed origin) and for updates (which keep their own origin).
  const guarded = isNew && rec.source !== "seed";
  if (guarded && origin) {
    if (isSeedOrigin(origin)) throw new UrlTakenError();
    const boundId = await idBoundToOrigin(origin);
    if (boundId && boundId !== rec.id) throw new UrlTakenError();
  }
  if (guarded && rec.operatorCuit) {
    const cuitDigits = rec.operatorCuit.replace(/\D/g, "");
    if (cuitDigits) {
      const clash = await entryWithCuit(cuitDigits, rec.id);
      if (clash) throw new CuitTakenError();
    }
  }

  if (isKvWired()) {
    try {
      if (isNew) {
        const count = await kv.scard(KEY_IDS);
        if (typeof count === "number" && count >= MAX_IDS) return null;
      }
      await kv.set(KEY_ENTRY(rec.id), rec);
      await kv.sadd(KEY_IDS, rec.id);
      if (origin) await kv.set(KEY_BY_URL(origin), rec.id);
      return rec;
    } catch {
      return null;
    }
  }

  // In-memory fallback.
  if (isNew && memIds.size >= MAX_IDS) return null;
  // The async guard above yields between its read and this write, so two racing
  // in-memory upserts could both pass it. Re-run the claim guard in the same
  // synchronous block as the write (no await in between), so the second racer
  // always sees the first racer's index write and loses.
  if (guarded) {
    if (origin) {
      const boundId = memByUrl.get(origin);
      if (boundId && boundId !== rec.id) throw new UrlTakenError();
    }
    const cuitDigits = rec.operatorCuit?.replace(/\D/g, "") ?? "";
    if (cuitDigits) {
      for (const other of memEntries.values()) {
        if (
          other.id !== rec.id &&
          other.operatorCuit &&
          other.operatorCuit.replace(/\D/g, "") === cuitDigits
        ) {
          throw new CuitTakenError();
        }
      }
    }
  }
  memEntries.set(rec.id, rec);
  memIds.add(rec.id);
  if (origin) memByUrl.set(origin, rec.id);
  return rec;
}

/**
 * Serialize the claim guard on the RESOURCES being claimed (origin + CUIT), not
 * only on the entry id. Without this, two concurrent self-lists with the same
 * publicUrl but different names take disjoint per-entity locks and both pass the
 * uniqueness guard, defeating the origin-hijack protection. Lock keys are sorted
 * so any two callers acquire overlapping locks in the same order (no deadlock);
 * both namespaces are disjoint from the per-entity lock key, so nesting is safe.
 * Skipped for seed records (never guarded) and no-op when KV is not wired (the
 * in-memory path is protected by the synchronous re-check in upsertRecordRaw).
 */
async function withClaimLocks<T>(rec: RegistryRecord, fn: () => Promise<T>): Promise<T> {
  const lockKeys: string[] = [];
  if (rec.source !== "seed") {
    const origin = urlOrigin(rec.publicUrl);
    if (origin) lockKeys.push(`registry:claim:url:${b64url(origin)}`);
    const cuitDigits = rec.operatorCuit?.replace(/\D/g, "") ?? "";
    if (cuitDigits) lockKeys.push(`registry:claim:cuit:${cuitDigits}`);
  }
  lockKeys.sort();
  let run = fn;
  for (const key of lockKeys.reverse()) {
    const inner = run;
    run = () => withKvLock(key, inner);
  }
  return run();
}

/**
 * Public create/replace. Acquires the per-entity lock so a STANDALONE write (e.g.
 * a self-list POST) is serialized against concurrent good-standing writes — and so
 * the claim-guard's origin/cuit check + write is itself atomic. Also acquires the
 * claim locks on the origin and the CUIT being claimed (see withClaimLocks), so two
 * concurrent self-lists of the SAME origin or CUIT under DIFFERENT ids serialize
 * and the second one loses the claim guard. Callers that read BEFORE writing (the
 * lifecycle transitions) must instead take {@link withEntityLock} around their
 * read + {@link upsertRecordRaw} to keep the whole section atomic (they only
 * update existing ids, so the claim guard never applies to them).
 * UrlTakenError / CuitTakenError propagate; transient lock contention → null.
 */
export async function upsertRecord(rec: RegistryRecord): Promise<RegistryRecord | null> {
  try {
    return await withClaimLocks(rec, () =>
      withEntityLock(rec.id, () => upsertRecordRaw(rec)),
    );
  } catch (e) {
    if (e instanceof KvLockError) return null;
    throw e;
  }
}

/**
 * UNLOCKED good-standing patch: read current, terminal-guard, write via
 * upsertRecordRaw. A caller holding {@link withEntityLock}(id) uses this so its
 * read+guard+write is one atomic section. Standalone callers use {@link setGoodStanding}.
 */
export async function setGoodStandingRaw(
  id: string,
  patch: Partial<GoodStanding> & { state: GoodStandingState },
): Promise<RegistryRecord | null> {
  const current = await getRecord(id);
  if (!current) return null;
  // TERMINAL kill-state guard (system-wide, AT THE STORAGE CHOKEPOINT). Once an
  // entity is `revoked`, good-standing can ONLY stay revoked. Every good-standing
  // write goes through here — the lifecycle wrappers, the PATCH /api/registry
  // operator override, the oracle re-certify — so a killed entity cannot be
  // silently re-activated by any path. Updating other fields (e.g. a re-certify's
  // score) while STAYING revoked is allowed. Un-revoking is intentionally NOT a
  // quiet flag flip; it would be a separate, explicitly-audited operation.
  if (current.goodStanding.state === "revoked" && patch.state !== "revoked") {
    throw new RevokedTerminalError();
  }
  const next: RegistryRecord = {
    ...current,
    goodStanding: { ...current.goodStanding, ...patch },
    updatedAt: new Date().toISOString(),
  };
  return upsertRecordRaw(next);
}

/**
 * Patch the good-standing of an existing record (the certifier verdict, or an
 * admin/owner suspension/revocation). No-op-returns-null if the id is unknown
 * in BOTH KV and seed. For a seed-only id with no KV row yet, this MATERIALIZES
 * the seed entry into KV (so its good-standing becomes mutable) — KV-wins semantics.
 *
 * ATOMIC: the read + terminal-guard + write run under the per-entity lock, so two
 * concurrent writers can never lose one another's update or resurrect a revoked
 * entity. RevokedTerminalError propagates; transient lock contention → null.
 */
export async function setGoodStanding(
  id: string,
  patch: Partial<GoodStanding> & { state: GoodStandingState },
): Promise<RegistryRecord | null> {
  try {
    return await withEntityLock(id, () => setGoodStandingRaw(id, patch));
  } catch (e) {
    if (e instanceof RevokedTerminalError) throw e; // preserve the terminal contract
    if (e instanceof KvLockError) return null; // transient contention → no write
    throw e;
  }
}

/**
 * Set (merge) the entity's PII-free USD-rail posture. No-op-returns-null if the id
 * is unknown. Materializes a seed-only id into KV (like setGoodStanding). Atomic
 * read-modify-write under the per-entity lock (transient contention → null).
 */
export async function setRailPosture(
  id: string,
  posture: RailPosture,
): Promise<RegistryRecord | null> {
  try {
    return await withEntityLock(id, async () => {
      const current = await getRecord(id);
      if (!current) return null;
      const next: RegistryRecord = {
        ...current,
        railPosture: { ...current.railPosture, ...posture, asOf: new Date().toISOString() },
        updatedAt: new Date().toISOString(),
      };
      return upsertRecordRaw(next);
    });
  } catch (e) {
    if (e instanceof KvLockError) return null;
    throw e;
  }
}

/**
 * Set (merge) the entity's PII-free key-control posture. No-op-returns-null if the
 * id is unknown. Materializes a seed-only id into KV (like setRailPosture). Atomic
 * read-modify-write under the per-entity lock (transient contention → null).
 */
export async function setKeyPosture(
  id: string,
  posture: KeyPosture,
): Promise<RegistryRecord | null> {
  try {
    return await withEntityLock(id, async () => {
      const current = await getRecord(id);
      if (!current) return null;
      const next: RegistryRecord = {
        ...current,
        keyPosture: { ...current.keyPosture, ...posture, asOf: new Date().toISOString() },
        updatedAt: new Date().toISOString(),
      };
      return upsertRecordRaw(next);
    });
  } catch (e) {
    if (e instanceof KvLockError) return null;
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formation stub (the BIRTH wedge → the registry's supply side)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Slugify a denominacion into a registry id. Byte-identical to incorporate.ts's
 * slugFor (lowercase, collapse non-alnum to '-', trim dashes, cap 40, fallback).
 * INLINED here rather than imported so registry-store stays edge-safe and free of
 * the zod dependency incorporate.ts pulls in (this module is loaded by the EDGE
 * good-standing oracle route). The two MUST stay in sync; both are pure.
 */
function slugForDenominacion(s: string): string {
  const slug = String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 40);
  // ID_RE requires >= 2 chars; a 1-char (or empty) slug would be rejected by
  // upsertRecord and silently drop the entity. Fall back to the default.
  return slug.length >= 2 ? slug : "sociedad-ia";
}

/** The fields createFormingStub needs — a structural subset of IncorporateInput. */
export interface FormingStubInput {
  denominacion: string;
  tipo: string;
  /** The art.102 administrator's CUIT, if declared. SELF-DECLARED → never authoritative. */
  representante?: { nombre?: string; cuit?: string };
  publicUrl?: string;
}

/** The slug `createFormingStub` would write for this denominacion (without persisting). */
export function formingStubId(denominacion: string): string {
  return slugForDenominacion(denominacion);
}

/**
 * Pick a free id for a new forming stub: the base slug, else `${base}-2`, `-3`, …
 * (deduping against existing entries). Bounded so a denominacion collision storm
 * can't loop unboundedly. Seed-safe: listRecords() never throws.
 */
async function dedupedFormingId(base: string): Promise<string> {
  const existing = new Set((await listRecords()).map((r) => r.id));
  if (!existing.has(base)) return base;
  for (let n = 2; n <= 1000; n++) {
    // Keep within the ID_RE length bound (<=63) by trimming the base.
    const suffix = `-${n}`;
    const id = `${base.slice(0, 62 - suffix.length)}${suffix}`;
    if (!existing.has(id)) return id;
  }
  // Pathological collision: fall back to a random, still-valid id.
  return `${base.slice(0, 50)}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Create the REGISTRY STUB minted at an entity's BIRTH. This is the supply side
 * of the one loop: every real incorporation becomes a `forming` registry entity.
 *
 * Writes status:"forming", goodStanding.state:"unverified", source:"formed",
 * id = deduped slug(denominacion), keyed (continuity) by sessionId. A `forming`
 * entry is explicitly NON-ATTESTING in the oracle — it is NOT good-standing until
 * it goes live. The `checklist` becomes the addressable formation state.
 *
 * BEST-EFFORT by contract: NEVER throws. On KV-down it falls back to the same
 * in-memory store the rest of this module uses; on any error it returns null so
 * the caller (runIncorporation) is never blocked from completing the legal act.
 *
 * Idempotent per sessionId: if a stub already exists for this sessionId we return
 * it unchanged (a retried/idempotent incorporation does not mint a second entity
 * nor reset its formation progress).
 */
export async function createFormingStub(
  input: FormingStubInput,
  sessionId: string,
  opts?: {
    checklist?: ChecklistItem[];
    packHash?: string;
    sidecar?: Record<string, unknown>;
    now?: string;
  },
): Promise<RegistryRecord | null> {
  try {
    const now = opts?.now ?? new Date().toISOString();

    // Continuity: if this sessionId already minted a stub, return it (idempotent).
    const existingId = await formingStubIdForSession(sessionId);
    if (existingId) {
      const prior = await getRecord(existingId);
      if (prior) return prior;
    }

    const base = slugForDenominacion(input.denominacion);
    const id = await dedupedFormingId(base);

    const rec: RegistryRecord = {
      id,
      name: input.denominacion,
      type: "productive-sociedad-ia",
      jurisdiction: "AR",
      operator: input.representante?.nombre?.trim() || "-",
      // NO operatorCuit on a forming stub: the administrator's CUIT is SELF-DECLARED
      // at birth (never authoritative), and carrying it here would collide with
      // upsertRecord's CUIT-dedup guard — silently dropping legit entities (one
      // human running several sociedades) and enabling a CUIT-squat denial-of-
      // registry. The declared CUIT lives in the signed incorporation audit entry;
      // operatorCuit is set authoritatively only when the entity is verified.
      publicUrl: input.publicUrl?.trim() || "-",
      rfcConformance: [],
      disclosure: {
        es: "Sociedad en formación. Stub de registro creado en la constitución; todavía no operativa. No está en buen estado (good standing) hasta activarse.",
        en: "Company in formation. Registry stub created at incorporation; not yet operative. Not in good standing until it goes live.",
      },
      status: "forming",
      listedSince: now.slice(0, 10),
      goodStanding: {
        state: "unverified",
        lastCheckedAt: null,
        lastScore: null,
        lastRating: null,
      },
      createdAt: now,
      updatedAt: now,
      source: "formed",
      // Bind the audit/suspension id onto the record so the oracle can reconcile a
      // kill-switched society with its (differently-keyed) registry entry.
      sessionId,
      formation: {
        ...(opts?.checklist ? { checklist: opts.checklist } : {}),
        ...(opts?.packHash ? { packHash: opts.packHash } : {}),
        ...(opts?.sidecar ? { sidecar: opts.sidecar } : {}),
        lastProgressAt: now,
      },
    };

    // Bind sessionId → id for continuity/idempotency BEFORE the entry write, so a
    // retry resolves the same stub. Best-effort (errors swallowed below).
    await bindSessionToStub(sessionId, id);

    // upsertRecord is guarded only for source!=="seed" NEW ids on self-list; a
    // "formed" source has publicUrl "-" (no origin) and carries NO operatorCuit,
    // so neither the url-claim nor the cuit-dedup guard can fire. Returns null
    // only at capacity (MAX_IDS).
    return await upsertRecord(rec);
  } catch {
    return null; // best-effort: never block the constitution
  }
}

const KEY_STUB_BY_SESSION = (sessionId: string) => `registry:formed-by-session:${sessionId}`;
const memStubBySession = new Map<string, string>();

/** Resolve the stub id previously minted for a sessionId, if any. Seed-safe. */
export async function formingStubIdForSession(sessionId: string): Promise<string | null> {
  if (!sessionId) return null;
  if (isKvWired()) {
    try {
      const id = await kv.get<string>(KEY_STUB_BY_SESSION(sessionId));
      return id ?? null;
    } catch {
      return null;
    }
  }
  return memStubBySession.get(sessionId) ?? null;
}

async function bindSessionToStub(sessionId: string, id: string): Promise<void> {
  if (!sessionId) return;
  if (isKvWired()) {
    try {
      await kv.set(KEY_STUB_BY_SESSION(sessionId), id);
    } catch {
      // best-effort
    }
  } else {
    memStubBySession.set(sessionId, id);
  }
}

/** Test-only: clear the in-memory fallback stores between cases. */
export function __resetMemoryForTests(): void {
  memEntries.clear();
  memIds.clear();
  memByUrl.clear();
  memStubBySession.clear();
}
