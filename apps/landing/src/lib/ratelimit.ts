/**
 * Minimal fixed-window in-memory rate limiter for public POST endpoints.
 *
 * Per-isolate (Edge instances don't share memory, cold starts reset buckets),
 * so this is abuse damping, not a hard quota — the goal is stopping a single
 * IP from amplifying KV writes or MP API calls, at zero KV cost on the hot
 * path. Same pattern /api/play already uses.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
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
    buckets.set(k, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}
