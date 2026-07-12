/**
 * Local, KV-backed signed audit log for THIS deploy's own agent loop
 * (ROADMAP.md M3-4 / M3-5).
 *
 * Distinct from ar-agents.ar's administrative signed audit log
 * (apps/landing/src/lib/audit.ts, read via `GET /api/play/audit/{sessionId}`):
 * that one only ever receives entries from the incorporate/suspend/approve
 * routes studio calls on the human's behalf. It never sees what THIS
 * society's agent actually does at runtime -- every `POST /api/agent` tool
 * call was, until now, invisible to any audit trail. This module closes
 * that gap by giving the deployed app its own append-only log, owned
 * entirely by this Vercel project.
 *
 * Storage: same decision as apps/landing -- Vercel KV (Upstash REST,
 * Edge-safe) when provisioned (`KV_REST_API_URL`/`KV_REST_API_TOKEN`),
 * else an in-memory array that resets on cold start (fine for local dev
 * and PR previews without secrets).
 *
 * ROADMAP.md M3-6: handing every society the SAME KV credentials so it
 * "just has storage" would let any society read the whole KV store,
 * studio's own account records included -- acceptable ONLY for the
 * platform-owned dogfood society, forbidden for a real tenant. So this
 * module's KV path stays best-effort/optional, and `./audit-middleware`
 * additionally dual-writes every entry to ar-agents.ar's per-society
 * durable sink (`./audit-sink`, isolated per society by its own
 * `SOCIETY_GATE_TOKEN`), which is the actual fix for "survives recycling
 * without in-memory data loss" for a society with no KV of its own.
 *
 * Signing: HMAC-SHA256 over canonical JSON, keyed by `AUDIT_HMAC_SECRET`.
 * Studio mints + sets this on the society's own Vercel project the same
 * way it mints `STUDIO_STATUS_TOKEN` (see apps/studio's deploy + activity
 * routes) -- but unlike the status token, studio never needs the value
 * back: nothing studio calls is authenticated with it, it only ever
 * signs entries inside THIS process. Entries are still recorded (with
 * `hmac: null`) when the secret isn't configured, same graceful-degrade
 * posture as every other optional credential in this app.
 *
 * NEVER stores raw tool arguments or output here -- either could carry a
 * secret (an access token echoed back by an error message) or PII (a
 * CUIT, a WhatsApp phone number, a payment amount + payee). Callers pass
 * a short, already-redacted `summary` string; see `withLocalAudit`, the
 * single wrapper in ./agent.ts that produces it for every tool call.
 */

import { kv } from "@vercel/kv";

const enc = new TextEncoder();

async function importHmac(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function secret(): string | null {
  return process.env.AUDIT_HMAC_SECRET?.trim() || null;
}

const cachedSigning: { key: CryptoKey | null; secret: string | null } = {
  key: null,
  secret: null,
};

async function signingKey(): Promise<CryptoKey | null> {
  const s = secret();
  if (!s) return null;
  if (cachedSigning.key && cachedSigning.secret === s) return cachedSigning.key;
  const key = await importHmac(s);
  cachedSigning.key = key;
  cachedSigning.secret = s;
  return key;
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Canonical-JSON-stringify (object-key sorted) for stable HMAC inputs.
 *  Mirrors apps/landing/src/lib/audit.ts's `canonical`, minus the
 *  depth-bound (entries here are a small, host-authored, fixed-shape
 *  object -- never hostile deep-nested input). */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

async function sign(entry: Omit<LocalAuditEntry, "hmac">): Promise<string | null> {
  const key = await signingKey();
  if (!key) return null;
  try {
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(canonical(entry)));
    return `sha256:${bytesToHex(sig)}`;
  } catch {
    return null;
  }
}

/** One entry in the local audit log. Public-safe by construction: every
 *  field is either structural (id/ts/tool/governance/errored) or the
 *  caller-supplied redacted `summary`, never raw args/output. */
export interface LocalAuditEntry {
  /** Stable, sortable: ISO timestamp + a short random suffix. */
  id: string;
  /** ISO 8601 UTC timestamp. */
  ts: string;
  /** Tool name that produced this entry. */
  tool: string;
  /** Risk-manifest classification (packages/core/src/risk-manifest.ts's
   *  RiskLevel: read/create/money/fiscal/legal/irreversible/unknown). */
  governance: string;
  /** True if the tool call threw (including a governance refusal: HITL
   *  denial or kill-switch halt both throw, so they audit too). */
  errored: boolean;
  /** Short, redacted, public-safe description. Never the raw args/output. */
  summary: string;
  /** HMAC-SHA256 over the canonical-JSON of the other fields, or null when
   *  AUDIT_HMAC_SECRET isn't configured (still recorded, just unsigned). */
  hmac: string | null;
}

const MAX_SUMMARY_LEN = 280;

/** Collapse whitespace and cap length. Applied to every summary before it
 *  is stored, so even a well-intentioned caller can't accidentally persist
 *  an oversized or formatting-laden string. */
export function redactSummary(s: string): string {
  const trimmed = s.trim().replace(/\s+/g, " ");
  return trimmed.length > MAX_SUMMARY_LEN ? `${trimmed.slice(0, MAX_SUMMARY_LEN)}…` : trimmed;
}

function isKvWired(): boolean {
  return Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
}

// Namespaced by SOCIETY_ID (studio injects it at provisioning): a KV
// instance shared by more than one society deploy must never mix their
// operating histories into one list. Falls back to a fixed suffix for a
// bare local checkout with no society identity.
const KV_KEY = `sociedad-ia-starter:audit-log:${process.env.SOCIETY_ID?.trim() || "default"}`;
/** Bounds unbounded growth. This deploy serves one society; a few hundred
 *  recent entries is far more than the cockpit ever renders (last ~20). */
const MAX_ENTRIES = 200;

// In-memory fallback + dropped-write counter live on globalThis: in dev
// each route module can get its own module instance (see apps/studio's
// account.ts for the same pattern), and per-module state would make a
// tool call in /api/agent invisible to /api/status.
const g = globalThis as typeof globalThis & {
  __starterAuditMem?: { entries: LocalAuditEntry[]; dropped: number };
};
g.__starterAuditMem ??= { entries: [], dropped: 0 };
const mem = g.__starterAuditMem;

export interface AppendLocalAuditInput {
  tool: string;
  governance: string;
  errored: boolean;
  summary: string;
}

/**
 * Append one entry. Best-effort: NEVER throws (a storage failure here must
 * never break the agent loop that is calling it). ALWAYS returns the
 * constructed, signed entry -- even when local storage failed -- so a
 * caller that needs the entry regardless of local storage outcome (the
 * platform-sink dual-write in `./audit-middleware`, ROADMAP.md M3-6) can
 * still forward the exact same `id`/`ts`/`hmac`. A local storage failure is
 * recorded via the dropped-writes counter (see
 * {@link localAuditDroppedWrites}), never signaled by returning null.
 */
export async function appendLocalAudit(input: AppendLocalAuditInput): Promise<LocalAuditEntry> {
  const id = `${new Date().toISOString()}-${crypto.randomUUID().slice(0, 8)}`;
  const base = {
    id,
    ts: new Date().toISOString(),
    tool: input.tool,
    governance: input.governance,
    errored: input.errored,
    summary: redactSummary(input.summary),
  };
  let hmac: string | null = null;
  try {
    hmac = await sign(base);
  } catch {
    hmac = null;
  }
  const entry: LocalAuditEntry = { ...base, hmac };

  try {
    if (isKvWired()) {
      await kv.rpush(KV_KEY, entry);
      await kv.ltrim(KV_KEY, -MAX_ENTRIES, -1);
    } else {
      mem.entries.push(entry);
      if (mem.entries.length > MAX_ENTRIES) mem.entries.splice(0, mem.entries.length - MAX_ENTRIES);
    }
  } catch {
    mem.dropped++;
  }
  return entry;
}

/** Read the most recent `limit` entries, newest first. */
export async function readLocalAudit(limit = 20): Promise<LocalAuditEntry[]> {
  try {
    if (isKvWired()) {
      const raw = await kv.lrange<LocalAuditEntry>(KV_KEY, -limit, -1);
      return Array.isArray(raw) ? raw.slice().reverse() : [];
    }
  } catch {
    // fall through to memory
  }
  return mem.entries.slice(-limit).reverse();
}

/** Count of writes lost to a storage failure since this isolate booted.
 *  Surfaced in `GET /api/status` so silent data loss is visible instead of
 *  hidden -- cheap (an in-process counter), best-effort (resets on cold
 *  start, same caveat as the in-memory fallback itself). */
export function localAuditDroppedWrites(): number {
  return mem.dropped;
}

/** Test-only: reset in-memory state between tests. */
export function __resetLocalAuditForTests(): void {
  mem.entries.length = 0;
  mem.dropped = 0;
}
