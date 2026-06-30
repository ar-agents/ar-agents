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

// ─────────────────────────────────────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────────────────────────────────────

export type RegistryType =
  | "reference-implementation"
  | "demo"
  | "productive-sociedad-ia"
  | "library-only";

export type RegistryStatus = "live" | "draft" | "deprecated";

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
  source: "seed" | "self-listed";
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
 * Create or replace a record. Maintains the id set + by-url index. Returns the
 * stored record, or null when the id set is at capacity (abuse bound) for a NEW
 * id. Updating an existing id is always allowed (it keeps its own origin/cuit).
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
export async function upsertRecord(rec: RegistryRecord): Promise<RegistryRecord | null> {
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
  memEntries.set(rec.id, rec);
  memIds.add(rec.id);
  if (origin) memByUrl.set(origin, rec.id);
  return rec;
}

/**
 * Patch the good-standing of an existing record (the certifier verdict, or an
 * admin/owner suspension/revocation). No-op-returns-null if the id is unknown
 * in BOTH KV and seed. For a seed-only id with no KV row yet, this MATERIALIZES
 * the seed entry into KV (so its good-standing becomes mutable) — KV-wins semantics.
 */
export async function setGoodStanding(
  id: string,
  patch: Partial<GoodStanding> & { state: GoodStandingState },
): Promise<RegistryRecord | null> {
  const current = await getRecord(id);
  if (!current) return null;
  const next: RegistryRecord = {
    ...current,
    goodStanding: { ...current.goodStanding, ...patch },
    updatedAt: new Date().toISOString(),
  };
  return upsertRecord(next);
}

/** Test-only: clear the in-memory fallback stores between cases. */
export function __resetMemoryForTests(): void {
  memEntries.clear();
  memIds.clear();
  memByUrl.clear();
}
