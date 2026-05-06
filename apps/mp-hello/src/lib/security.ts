import { NextRequest, NextResponse } from "next/server";

/**
 * In-memory rate limiter for API routes — per IP, per minute.
 *
 * # Why in-memory and not Redis/KV
 *
 * mp-hello is a single-region demo. In serverless, in-memory state is
 * per-instance — Vercel may run multiple concurrent instances, so a
 * determined attacker can get N×LIMIT requests by hammering many instances.
 * That's acceptable for a demo: the limit is mainly there to keep abusive
 * bots from burning through Anthropic credits + MP API calls. For production
 * traffic, swap this for `@upstash/ratelimit` (Vercel KV-backed).
 *
 * # Identification
 *
 * Reads `x-forwarded-for` (Vercel sets this) → `x-real-ip` → falls back to a
 * shared key. We never trust client-supplied IPs for anything but rate-limiting.
 */
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 LLM calls/min/IP — enough for demo

const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "anon";
}

export function rateLimit(req: NextRequest): NextResponse | null {
  const key = clientKey(req);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests", retryAfterSeconds: retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(MAX_REQUESTS_PER_WINDOW),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
        },
      },
    );
  }
  return null;
}

/**
 * Reject requests with bodies larger than `maxBytes`. Defaults to 32 KB —
 * a typical JSON message payload is well under 4 KB; 32 KB allows for
 * multi-turn conversations without opening up a DoS vector via huge bodies.
 * Webhook routes pass a larger override (256 KB) for MP payloads.
 */
export function bodySizeGuard(
  req: NextRequest,
  maxBytes = 32_768,
): NextResponse | null {
  const len = req.headers.get("content-length");
  if (len && Number(len) > maxBytes) {
    return NextResponse.json(
      { error: "Request body too large", maxBytes },
      { status: 413 },
    );
  }
  return null;
}

/**
 * Headers added to every API response so the JSON endpoints aren't framable
 * and don't leak referrer information. The static-asset CSP from
 * next.config.ts already covers HTML — these are additive for /api/*.
 */
export const apiSecurityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

export function withApiHeaders<T extends NextResponse>(res: T): T {
  for (const [k, v] of Object.entries(apiSecurityHeaders)) {
    res.headers.set(k, v);
  }
  return res;
}
