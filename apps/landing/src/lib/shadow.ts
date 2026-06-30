/**
 * Shadow-onboarding metric (INTERNAL ONLY).
 *
 * Counts UNAUTHENTICATED / malformed hits on the public good-standing oracle as a
 * latent-demand signal: how many distinct sources tried to read a good-standing
 * profile (and how often, by request type, and how often for an entity we do NOT
 * yet list). It is the cheapest demand-side artifact — it measures interest the
 * registry has not yet captured.
 *
 * HARD PRIVACY + POSTURE RULES (do not relax without a privacy/legal call):
 *  - NO PII, NO raw payloads, NO secrets stored. We store ONLY aggregate counters.
 *  - The source is an UN-REVERSIBLE, MONTHLY-ROTATING-salt HMAC of the client IP,
 *    truncated to 12 hex chars. The monthly rotation gives a ~30-day distinct-
 *    source cardinality window while killing any long-term cross-month tracker.
 *  - Counters carry a ~70-day TTL (KV INCR + EXPIRE, copied from metering.ts).
 *  - This module + its admin stats endpoint are INTERNAL: they MUST NEVER appear
 *    in agents.json / /api/discovery / openapi / any public response body
 *    (PLAN.md public-posture hard rule). recordShadow writes nothing into any
 *    public answer; it only bumps private counters.
 *
 * Best-effort by contract: a metering failure must NEVER affect the public answer
 * (the oracle stays fully functional). Every function swallows KV errors.
 */

import { kv } from "@vercel/kv";

const enc = new TextEncoder();

const SHADOW_PREFIX = "shadow:";
// Daily aggregate counters retained ~70 days (covers the 30-day pitch window with
// headroom), mirroring metering.ts's DAY_TTL_SEC.
const DAY_TTL_SEC = 70 * 24 * 60 * 60;

/** The kinds of unauth/malformed oracle hit we count as latent demand. */
export type ShadowReqType =
  | "not_found" // a well-formed query for an entity we do NOT yet list (purest signal)
  | "malformed" // an invalid/badly-shaped query (bad url/cuit, etc.)
  | "missing_query" // no ?url=/?id=/?cuit= provided
  | "rate_limited"; // throttled — still demand, just shaped by abuse controls

const REQ_TYPES: readonly ShadowReqType[] = [
  "not_found",
  "malformed",
  "missing_query",
  "rate_limited",
];

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

/** UTC day bucket YYYYMMDD + month bucket YYYYMM (the salt-rotation period). */
function buckets(d: Date): { day: string; month: string } {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return { day: `${y}${m}${day}`, month: `${y}${m}` };
}

/**
 * The monthly-rotating salt: a server secret bound to the current UTC month, so
 * the same IP hashes to a DIFFERENT source id next month (no long-term tracking).
 * If no secret is configured we still salt with the month alone — the hash is
 * un-reversible-without-the-IP either way; the secret just hardens it against a
 * dictionary attack over the (small) IPv4 space.
 */
function monthlySalt(month: string): string {
  const secret =
    process.env.SHADOW_HASH_SECRET?.trim() ||
    process.env.AUDIT_HMAC_SECRET?.trim() ||
    "ar-agents-shadow";
  return `${secret}:${month}`;
}

const keyCache: { salt: string; key: CryptoKey | null } = { salt: "", key: null };

async function hmacKey(salt: string): Promise<CryptoKey | null> {
  if (keyCache.key && keyCache.salt === salt) return keyCache.key;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(salt),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    keyCache.key = key;
    keyCache.salt = salt;
    return key;
  } catch {
    return null;
  }
}

/**
 * 12-hex-char un-reversible source id for an IP, salted with the current month.
 * NEVER stored or returned alongside the raw IP. Best-effort: on any crypto error
 * returns a stable non-identifying constant so a counter still increments.
 */
export async function sourceHashFor(ip: string, now: Date = new Date()): Promise<string> {
  const { month } = buckets(now);
  const key = await hmacKey(monthlySalt(month));
  if (!key) return "anon";
  try {
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(ip));
    const bytes = new Uint8Array(sig);
    let hex = "";
    for (let i = 0; i < 6; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
    return hex; // 12 hex chars
  } catch {
    return "anon";
  }
}

const dayKey = (day: string, reqType: string) => `${SHADOW_PREFIX}day:${day}:${reqType}`;
const srcKey = (day: string, srcHash: string) => `${SHADOW_PREFIX}src:${day}:${srcHash}`;
const notFoundKey = (day: string) => `${SHADOW_PREFIX}notfound:${day}`;

async function incrWithTtl(key: string): Promise<void> {
  const total = await kv.incr(key);
  if (total === 1) await kv.expire(key, DAY_TTL_SEC);
}

export interface ShadowEvent {
  /** Spoof-safe client IP (from ratelimit.clientIp). HASHED here, never stored raw. */
  ip: string;
  reqType: ShadowReqType;
  /** True when the query was well-formed but the entity is not (yet) in the registry. */
  found: boolean;
}

/**
 * Record ONE shadow (unauth/malformed) oracle hit. Stores ONLY:
 *   shadow:day:<YYYYMMDD>:<reqType>   — frequency per request type
 *   shadow:src:<YYYYMMDD>:<srcHash>   — distinct-source cardinality (hashed IP)
 *   shadow:notfound:<YYYYMMDD>        — queries for entities we don't yet list
 * NO PII, NO raw IP, NO payload. Best-effort: swallows all KV errors, never throws.
 */
export async function recordShadow(ev: ShadowEvent): Promise<void> {
  try {
    if (!isKvWired()) return; // counters are KV-only; no in-memory shadow store
    const now = new Date();
    const { day } = buckets(now);
    const srcHash = await sourceHashFor(ev.ip, now);
    await incrWithTtl(dayKey(day, ev.reqType));
    await incrWithTtl(srcKey(day, srcHash));
    // The purest latent-demand signal: a real, well-formed query for an entity we
    // do not list (someone wanted to bank/transact with an entity not yet here).
    if (ev.reqType === "not_found" && !ev.found) {
      await incrWithTtl(notFoundKey(day));
    }
  } catch {
    // best-effort: the public answer must never depend on this write
  }
}

export interface ShadowStats {
  /** Window in days (inclusive of today). */
  windowDays: number;
  /** Per-request-type totals over the window. */
  byReqType: Record<ShadowReqType, number>;
  /** Total hits over the window (sum of byReqType). */
  total: number;
  /** Distinct hashed sources observed over the window (cardinality estimate). */
  distinctSources: number;
  /** Queries for entities not yet listed — the headline latent-demand number. */
  notFound: number;
  /** UTC day buckets the window covers (most recent last). */
  days: string[];
}

const ZERO_BY_TYPE = (): Record<ShadowReqType, number> => ({
  not_found: 0,
  malformed: 0,
  missing_query: 0,
  rate_limited: 0,
});

function dayKeysBack(n: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(buckets(d).day);
  }
  return out;
}

/**
 * Read the aggregate shadow stats over the last `windowDays` days. ADMIN-ONLY by
 * convention (the route gates it on REGISTRY_ADMIN_TOKEN). Returns zeros on
 * KV-down. Distinct-source cardinality is the count of distinct `src:` keys that
 * exist across the window (it can double-count an IP that appears in two months,
 * which is acceptable for a demand signal and is the privacy/cardinality tradeoff
 * of the monthly salt rotation).
 */
export async function getShadowStats(windowDays = 30): Promise<ShadowStats> {
  const n = Math.max(1, Math.min(windowDays, 70));
  const now = new Date();
  const days = dayKeysBack(n, now);
  const byReqType = ZERO_BY_TYPE();
  let notFound = 0;
  const distinct = new Set<string>();

  if (!isKvWired()) {
    return { windowDays: n, byReqType, total: 0, distinctSources: 0, notFound: 0, days };
  }

  try {
    for (const day of days) {
      for (const rt of REQ_TYPES) {
        const v = await kv.get<number>(dayKey(day, rt));
        if (typeof v === "number") byReqType[rt] += v;
      }
      const nf = await kv.get<number>(notFoundKey(day));
      if (typeof nf === "number") notFound += nf;
      // Distinct sources: enumerate the per-day src keys via SCAN-free key match.
      // KV (Upstash) supports `keys(pattern)`; bounded by the day's cardinality.
      try {
        const keys = await kv.keys(`${SHADOW_PREFIX}src:${day}:*`);
        for (const k of keys) distinct.add(k);
      } catch {
        // keys() unavailable / errored: skip cardinality for this day (best-effort)
      }
    }
  } catch {
    // partial read: return what we accumulated (best-effort, never throws)
  }

  const total = REQ_TYPES.reduce((s, rt) => s + byReqType[rt], 0);
  return {
    windowDays: n,
    byReqType,
    total,
    distinctSources: distinct.size,
    notFound,
    days,
  };
}

/** Test-only: reset the per-isolate HMAC key cache. */
export function __resetShadowKeyCacheForTests(): void {
  keyCache.key = null;
  keyCache.salt = "";
}
