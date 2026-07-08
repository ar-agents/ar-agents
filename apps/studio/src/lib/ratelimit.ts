/**
 * Minimal fixed-window in-memory rate limiter for public POST endpoints.
 *
 * Per-isolate (Edge instances don't share memory, cold starts reset buckets),
 * so this is abuse damping, not a hard quota: the goal is stopping a single
 * IP from amplifying KV writes or MP API calls, at zero KV cost on the hot
 * path. Same pattern /api/play already uses.
 */

import { kv } from "@vercel/kv";

const buckets = new Map<string, { count: number; resetAt: number }>();

// Cap the Map so a flood of distinct IPs/keys can't grow it unboundedly on a
// long-lived isolate (millions of agents → OOM). Over cap: sweep expired
// buckets first; if still over, evict oldest-inserted (Map preserves insertion
// order): a benign reset of stale limits, never a correctness issue.
const MAX_BUCKETS = 50_000;

function evictIfNeeded(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
  if (buckets.size < MAX_BUCKETS) return;
  const overflow = buckets.size - MAX_BUCKETS + 1;
  let i = 0;
  for (const k of buckets.keys()) {
    if (i++ >= overflow) break;
    buckets.delete(k);
  }
}

export function clientIp(req: Request): string {
  // On Vercel, `x-vercel-forwarded-for` is the platform-computed client IP and
  // cannot be spoofed by the caller (Vercel overwrites it on ingress). Prefer
  // it. NEVER trust the LEFTMOST `x-forwarded-for` hop: it is caller-controlled,
  // so rotating it would mint a fresh bucket per request and defeat every
  // per-IP rate limit.
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  // Non-Vercel / local fallback: the RIGHTMOST x-forwarded-for hop is the
  // closest trusted proxy; the leftmost is whatever the client sent. Take last.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  return "unknown";
}

/**
 * Returns true when the call is allowed, false when the window is exhausted.
 * `scope` namespaces buckets per endpoint so limits don't bleed across routes.
 */
export function rateLimit(
  scope: string,
  id: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const k = `${scope}:${id}`;
  const b = buckets.get(k);
  if (!b || now >= b.resetAt) {
    evictIfNeeded(now);
    buckets.set(k, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

/**
 * Durable, cross-isolate fixed-window limiter backed by Vercel KV. The
 * in-memory `rateLimit` above only damps a single isolate (Edge instances don't
 * share memory), so it is not a real quota on the abuse-attractive mutating
 * endpoints (incorporation). This one is: one INCR per call, one EXPIRE on the
 * first hit of a window, shared across every isolate.
 *
 * `windowSec` buckets are aligned to the wall clock so every isolate agrees on
 * the current window without coordination.
 *
 * On a KV error it fails OPEN by default (availability over strictness: the
 * in-memory limiter is the backstop). Pass `{ failClosed: true }` on the
 * abuse-attractive DURABLE-WRITE paths (constitution): there, a KV outage that
 * disabled the only real cross-isolate quota should DENY, not wave through an
 * unbounded flood of permanent records.
 */
export async function kvRateLimit(
  scope: string,
  id: string,
  max: number,
  windowSec: number,
  opts?: { failClosed?: boolean },
): Promise<boolean> {
  // KV not configured at all (zero-env local dev / tests) is not a KV outage:
  // failing closed here would 429 every constitute call before it starts.
  // Fall back to the in-memory limiter; `failClosed` only governs errors from
  // a KV that IS configured.
  if (!(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim())) {
    return rateLimit(`kvfallback:${scope}`, id, max, windowSec * 1000);
  }
  const windowStart = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${scope}:${id}:${windowStart}`;
  try {
    const count = await kv.incr(key);
    // Set the TTL once, on the first hit of this window (+1s slack).
    if (count === 1) await kv.expire(key, windowSec + 1);
    return count <= max;
  } catch {
    return !opts?.failClosed; // default fail-open; fail-closed when requested
  }
}
