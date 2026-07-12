/**
 * Per-society durable audit sink (ROADMAP.md M3-6): the platform-hosted
 * store a deployed society's local audit log (apps/sociedad-ia-starter's
 * `./audit-log` + `./audit-middleware`) dual-writes to, so its operating
 * history survives serverless recycling even when that project has no
 * `KV_REST_API_URL`/`KV_REST_API_TOKEN` of its own.
 *
 * Distinct from `./audit.ts` (the administrative signed audit log that
 * incorporate/suspend/approve write to, keyed by sessionId under
 * `play:audit:`): this module stores a DIFFERENT stream -- the society's own
 * tool-call history, which already arrives pre-redacted and, when the
 * society has `AUDIT_HMAC_SECRET` configured, pre-signed by a secret
 * ar-agents.ar never sees. So entries are stored VERBATIM (plus a
 * server-recorded `receivedAt`), never re-signed as the society.
 *
 * Isolation: the KV key is namespaced `society-audit:{societyId}`, but
 * namespacing alone is not the isolation boundary -- both API routes in
 * apps/landing/src/app/api/society-audit/* require the caller to present
 * that society's own gate token (`@/lib/gate-token`, minted write-once at
 * constitution, held only by that society's own deploy). A caller who only
 * knows another society's id (public: it appears in audit links) cannot
 * read or write that society's entries without also holding its token.
 *
 * Caps are enforced HERE, server-side, regardless of what the caller
 * claims already redacted client-side: a list length cap (matching the
 * starter's own `MAX_ENTRIES`) and a per-field size cap on every incoming
 * entry. Never trust the writer.
 */

import { kv } from "@vercel/kv";

function isKvWired(): boolean {
  return Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
}

const KEY_PREFIX = "society-audit:";
/** Bounds unbounded growth per society. Mirrors the starter's own
 *  `MAX_ENTRIES` (apps/sociedad-ia-starter/src/lib/audit-log.ts): a few
 *  hundred recent entries is far more than any cockpit tail ever reads. */
const MAX_ENTRIES = 200;

function key(societyId: string): string {
  return `${KEY_PREFIX}${societyId}`;
}

/** One entry as stored by the sink: the society-supplied fields, verbatim
 *  and re-capped, plus this platform's own receipt timestamp. */
export interface StoredSocietyAuditEntry {
  id: string;
  ts: string;
  tool: string;
  governance: string;
  errored: boolean;
  summary: string;
  /** `sha256:<hex>` signed by the society's OWN `AUDIT_HMAC_SECRET`
   *  (ar-agents.ar never sees that secret and never re-signs), or null when
   *  the society had no secret configured. Stored verbatim, not verified
   *  here -- verification (if ever needed) belongs to whoever holds that
   *  society's secret. */
  hmac: string | null;
  /** ISO 8601 UTC timestamp this platform received (and stored) the entry,
   *  independent of the society-asserted `ts`. */
  receivedAt: string;
}

// Per-field caps, enforced server-side regardless of what the caller
// already redacted. `summary` matches the starter's own MAX_SUMMARY_LEN
// (280) so a well-behaved caller never gets silently truncated further.
const MAX_LEN = {
  id: 128,
  ts: 64,
  tool: 200,
  governance: 64,
  summary: 280,
  hmac: 200,
} as const;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Validate + cap an incoming entry. Returns null (never throws) when the
 * shape is wrong, so the route can 400 instead of storing garbage. This is
 * the ONLY place that trusts field types; every string is re-capped here
 * even though the starter already redacts before sending.
 */
export function sanitizeSocietyAuditEntry(raw: unknown): StoredSocietyAuditEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.ts !== "string" || !r.ts) return null;
  if (typeof r.tool !== "string" || !r.tool) return null;
  if (typeof r.governance !== "string" || !r.governance) return null;
  if (typeof r.errored !== "boolean") return null;
  if (typeof r.summary !== "string") return null;
  if (r.hmac !== null && typeof r.hmac !== "string") return null;
  return {
    id: truncate(r.id, MAX_LEN.id),
    ts: truncate(r.ts, MAX_LEN.ts),
    tool: truncate(r.tool, MAX_LEN.tool),
    governance: truncate(r.governance, MAX_LEN.governance),
    errored: r.errored,
    summary: truncate(r.summary.trim().replace(/\s+/g, " "), MAX_LEN.summary),
    hmac: r.hmac === null ? null : truncate(r.hmac, MAX_LEN.hmac),
    receivedAt: new Date().toISOString(),
  };
}

// In-memory fallback, per-instance (no KV in local dev / a PR preview
// without secrets). Same caveat as every other fallback in this codebase:
// does not survive a cold start.
const memStore = new Map<string, StoredSocietyAuditEntry[]>();

/**
 * Append one entry for `societyId`. Validates + caps via
 * {@link sanitizeSocietyAuditEntry}; returns false (never throws) on
 * invalid input OR a storage failure, so the route can distinguish
 * "bad request" from "stored". Callers (the route) are expected to have
 * already authenticated `societyId` against its own gate token -- this
 * function does not re-check that; it only namespaces storage.
 */
export async function appendSocietyAuditEntry(societyId: string, raw: unknown): Promise<boolean> {
  const entry = sanitizeSocietyAuditEntry(raw);
  if (!entry) return false;
  if (isKvWired()) {
    try {
      await kv.rpush(key(societyId), entry);
      await kv.ltrim(key(societyId), -MAX_ENTRIES, -1);
      return true;
    } catch {
      return false;
    }
  }
  const arr = memStore.get(societyId) ?? [];
  arr.push(entry);
  if (arr.length > MAX_ENTRIES) arr.splice(0, arr.length - MAX_ENTRIES);
  memStore.set(societyId, arr);
  return true;
}

/** Read the most recent `limit` entries for `societyId`, newest first. */
export async function readSocietyAuditTail(
  societyId: string,
  limit = 20,
): Promise<StoredSocietyAuditEntry[]> {
  const capped = Math.max(1, Math.min(Math.floor(limit) || 20, MAX_ENTRIES));
  if (isKvWired()) {
    try {
      const raw = await kv.lrange<StoredSocietyAuditEntry>(key(societyId), -capped, -1);
      return Array.isArray(raw) ? raw.slice().reverse() : [];
    } catch {
      return [];
    }
  }
  return (memStore.get(societyId) ?? []).slice(-capped).reverse();
}

/** Test-only: reset in-memory state between tests. */
export function __resetSocietyAuditForTests(): void {
  memStore.clear();
}
