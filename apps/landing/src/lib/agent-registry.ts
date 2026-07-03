/**
 * Verified-agent registry: the KV-backed store behind the self-serve "verify
 * your agent" product (`/identity`, `/agent/[id]`, `/api/agents`).
 *
 * # Why this exists
 *
 * `/registro` is a hand-curated array of 5 entries that can only grow by PR.
 * That never seeds a network. This registry grows itself: every agent that
 * proves control of a signed identity doc (via `@ar-agents/identity-attest/
 * key-binding`) is auto-listed in our RFC-002 discovery format. That is the
 * land-grab — we populate the registry BEFORE the sociedad-IA regime exists,
 * with agents that are NOT contingent on it (crypto-native, foreign, or ours).
 *
 * # Honesty line
 *
 * Only two things about an entry are cryptographically true: the key/address
 * controls the doc, and the doc hash is intact. Everything else (name,
 * operator, evidence links) is SELF-ASSERTED and must be labeled as such by
 * every surface that renders it. There is no score or rating here by design.
 *
 * # KV posture
 *
 * Same as `constancia.ts`: all writes are best-effort behind `isKvWired()` and
 * try/catch, so a KV outage degrades to a no-op and NEVER throws on the request
 * path. When KV is unwired (local dev, PR previews without secrets),
 * verification still works and returns the profile inline; only persistence +
 * the public directory are empty. Timestamps are passed IN by the caller, never
 * read from wall-clock here, so this module stays deterministic + testable.
 */

import { kv } from "@vercel/kv";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Acquisition attribution (self-contained; mirrors the constancia experiment's
// shape so the two k-factor instruments stay comparable, without coupling this
// feature to that module).
// ─────────────────────────────────────────────────────────────────────────────

/** Signals attached to each registry event to attribute the acquisition loop. */
export interface Attribution {
  /** utm_source query param (e.g. "twitter"). */
  utmSource?: string;
  /** utm_medium query param (e.g. "post"). */
  utmMedium?: string;
  /** generic `ref` query param. */
  ref?: string;
  /** Bare host of the Referer header (the embedding/linking domain). */
  refererHost?: string;
}

/** Bare host of a referer/URL. Never throws; "" when unparseable. */
function refererHost(referer: string | null | undefined): string {
  if (!referer) return "";
  try {
    return new URL(referer).host.toLowerCase();
  } catch {
    return "";
  }
}

/** Pull attribution from a request: UTM/ref query params + Referer header. */
export function extractAttribution(req: Request): Attribution {
  const out: Attribution = {};
  try {
    const sp = new URL(req.url).searchParams;
    const src = sp.get("utm_source")?.trim();
    const med = sp.get("utm_medium")?.trim();
    const ref = sp.get("ref")?.trim();
    if (src) out.utmSource = src.slice(0, 120);
    if (med) out.utmMedium = med.slice(0, 120);
    if (ref) out.ref = ref.slice(0, 120);
  } catch {
    // malformed URL → no query attribution
  }
  const host = refererHost(req.headers.get("referer"));
  if (host) out.refererHost = host.slice(0, 253);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────────────────────

/** A published identity doc, validated loosely (adopters may carry more). */
export const IdentityDocSchema = z
  .object({
    identity: z
      .object({
        scheme: z.enum(["evm-secp256k1", "ed25519"]),
        address: z.string().optional(),
        chainId: z.number().int().optional(),
        accountType: z.enum(["eoa", "erc1271"]).optional(),
        publicKey: z.string().optional(),
        keyId: z.string().optional(),
      })
      .passthrough(),
    binding: z
      .object({
        scheme: z.string(),
        statement: z.string().optional(),
        signature: z.string(),
        docHash: z.string().optional(),
      })
      .passthrough()
      .nullable(),
    issuedAt: z.string().min(1),
    agent: z
      .object({
        name: z.string().optional(),
        operator: z.string().optional(),
        homepage: z.string().optional(),
        jurisdiction: z.string().optional(),
      })
      .passthrough()
      .optional(),
    evidence: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type IdentityDoc = z.infer<typeof IdentityDocSchema>;

/** What we persist + serve for a verified agent. */
export interface AgentRecord {
  /** Stable handle: `0x…` (evm) or `ed-<hex>` (ed25519). URL-safe. */
  id: string;
  scheme: "evm-secp256k1" | "ed25519";
  /** The proven subject: lowercased address or lowercased pubkey hex. */
  subject: string;
  chainId?: number;
  accountType?: "eoa" | "erc1271";
  // self-asserted (from the doc) — always render as "self-declared"
  name?: string;
  operator?: string;
  homepage?: string;
  jurisdiction?: string;
  evidence?: Record<string, unknown>;
  /** The `/.well-known/agents.json` origin when hosted-mode, else null. */
  origin: string | null;
  // proof — lets any counterparty re-verify without trusting us
  docHash: string;
  binding: { scheme: string; signature: string; statement?: string };
  /** The full submitted doc, so a verifier can re-run key-binding offline. */
  doc: unknown;
  // metadata (NOT signed — server observations)
  firstVerifiedAt: string;
  lastVerifiedAt: string;
  reverifyCount: number;
}

/** Compact directory row for `/api/agents` + the profile list. */
export interface AgentSummary {
  id: string;
  scheme: AgentRecord["scheme"];
  subject: string;
  name?: string;
  operator?: string;
  jurisdiction?: string;
  homepage?: string;
  chainId?: number;
  origin: string | null;
  lastVerifiedAt: string;
  profileUrl: string;
  badgeUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// KV keys
// ─────────────────────────────────────────────────────────────────────────────

const REC_PREFIX = "agent:record:v1:";
const IDS_SET = "agent:ids:v1"; // set of all ids (count + dedupe)
const RECENT_LIST = "agent:recent:v1"; // capped list, newest first
const RECENT_CAP = 500;

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Id derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The stable public handle for a verified subject. EVM agents key on their
 * lowercased address (canonical, globally unique). Ed25519 agents key on
 * `ed-<pubkeyhex>` so the two namespaces never collide and both stay URL-safe.
 */
export function agentId(
  scheme: AgentRecord["scheme"],
  subject: string,
): string {
  const s = subject.toLowerCase();
  return scheme === "evm-secp256k1" ? s : `ed-${s.replace(/^0x/, "")}`;
}

/** True if `id` is a syntactically valid handle (defends the [id] routes). */
export function isValidAgentId(id: string): boolean {
  return /^0x[0-9a-f]{40}$/.test(id) || /^ed-[0-9a-f]{64}$/.test(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch a verified-agent record by id. `null` on miss / no KV. */
export async function getAgentRecord(id: string): Promise<AgentRecord | null> {
  if (!isKvWired()) return null;
  try {
    return (await kv.get<AgentRecord>(`${REC_PREFIX}${id}`)) ?? null;
  } catch {
    return null;
  }
}

/** Total verified agents. 0 when KV is unwired. */
export async function countAgents(): Promise<number> {
  if (!isKvWired()) return 0;
  try {
    return (await kv.scard(IDS_SET)) ?? 0;
  } catch {
    return 0;
  }
}

/** The most-recently-verified agents (newest first), deduped, capped. */
export async function listRecentAgents(limit = 100): Promise<AgentRecord[]> {
  if (!isKvWired()) return [];
  try {
    const ids = (await kv.lrange<string>(RECENT_LIST, 0, RECENT_CAP - 1)) ?? [];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
      if (ordered.length >= limit) break;
    }
    if (ordered.length === 0) return [];
    const records = await Promise.all(ordered.map((id) => getAgentRecord(id)));
    return records.filter((r): r is AgentRecord => r !== null);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a verified agent. Upsert: re-verifying the same id refreshes the
 * record and bumps `reverifyCount`, keeping `firstVerifiedAt`. `now` is passed
 * in (ISO-8601) so this stays deterministic. Best-effort; returns whether it
 * persisted (false when KV is unwired or the write failed).
 */
export async function saveAgentRecord(
  input: Omit<
    AgentRecord,
    "firstVerifiedAt" | "lastVerifiedAt" | "reverifyCount"
  >,
  now: string,
): Promise<boolean> {
  if (!isKvWired()) return false;
  try {
    const existing = await getAgentRecord(input.id);
    const record: AgentRecord = {
      ...input,
      firstVerifiedAt: existing?.firstVerifiedAt ?? now,
      lastVerifiedAt: now,
      reverifyCount: (existing?.reverifyCount ?? 0) + 1,
    };
    await kv.set(`${REC_PREFIX}${input.id}`, record);
    await kv.sadd(IDS_SET, input.id);
    await kv.lpush(RECENT_LIST, input.id);
    await kv.ltrim(RECENT_LIST, 0, RECENT_CAP - 1);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// k-factor instrumentation (shares the acquisition experiment with constancia)
// ─────────────────────────────────────────────────────────────────────────────

export type AgentEventKind = "verify" | "badge" | "profile_view";

/**
 * Record one registry event into KV: a rolling capped list per kind + the
 * k-factor counters (which external domains embed a badge, which channel drove
 * a verify). Best-effort; a metric failure NEVER breaks the request path.
 */
export async function recordAgentEvent(
  kind: AgentEventKind,
  id: string,
  attribution: Attribution,
  now: string,
): Promise<void> {
  if (!isKvWired()) return;
  try {
    const listKey = `agent:events:${kind}`;
    await kv.rpush(listKey, { kind, id, at: now, ...attribution });
    await kv.ltrim(listKey, -500, -1);
    if (attribution.refererHost) {
      await kv.hincrby("agent:k:referer", attribution.refererHost, 1);
    }
    if (attribution.utmSource) {
      await kv.hincrby("agent:k:utm_source", attribution.utmSource, 1);
    }
  } catch {
    // drop the metric, never fail the request
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping
// ─────────────────────────────────────────────────────────────────────────────

const SITE = "https://ar-agents.ar";

export function profileUrl(id: string): string {
  return `${SITE}/agent/${id}`;
}
export function badgeUrl(id: string): string {
  return `${SITE}/api/identity/badge/${id}`;
}

/** Project a full record to the compact directory row. */
export function toSummary(r: AgentRecord): AgentSummary {
  return {
    id: r.id,
    scheme: r.scheme,
    subject: r.subject,
    name: r.name,
    operator: r.operator,
    jurisdiction: r.jurisdiction,
    homepage: r.homepage,
    chainId: r.chainId,
    origin: r.origin,
    lastVerifiedAt: r.lastVerifiedAt,
    profileUrl: profileUrl(r.id),
    badgeUrl: badgeUrl(r.id),
  };
}
