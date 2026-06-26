/**
 * Minimal auth + abuse guards for the starter's public endpoints.
 *
 * `/api/agent` runs a full @ar-agents/* agent loop (identity, banking, AFIP,
 * BCRA, IGJ, Boletín, GDE/TAD, treasury, MercadoPago, WhatsApp — whatever you
 * wire in `lib/agent.ts`) and spends Anthropic tokens per call. Left open it is
 * a credential-read + token-burn surface for any anonymous caller. So this
 * starter ships SECURE BY DEFAULT: the agent endpoint requires an API key and
 * is rate-limited, and refuses to run at all until you set `AGENT_API_KEY`.
 *
 * These are deliberately dependency-free (no KV) so the template runs anywhere.
 * The in-memory limiter is per-isolate (serverless cold starts reset it); for a
 * hard cross-instance quota, back it with Vercel KV / Upstash in production.
 */

import { NextResponse } from "next/server";

// ─── client IP ───────────────────────────────────────────────────────────────

/**
 * Platform-authenticated client IP. On Vercel, `x-vercel-forwarded-for` is set
 * by the platform and cannot be spoofed by the caller; prefer it. NEVER trust
 * the leftmost `x-forwarded-for` hop (caller-controlled — rotating it would mint
 * a fresh rate-limit bucket per request).
 */
export function clientIp(req: Request): string {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    // Rightmost hop is the closest trusted proxy; leftmost is caller-supplied.
    if (parts.length) return parts[parts.length - 1]!;
  }
  return "unknown";
}

// ─── constant-time string compare ────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  // Compare over a fixed length so we don't leak which (or how long) via timing.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ─── API key auth (fail-closed) ──────────────────────────────────────────────

export type AuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string; message: string };

/**
 * Require a valid API key. Accepts `Authorization: Bearer <key>` or
 * `x-api-key: <key>`, compared in constant time against `AGENT_API_KEY`.
 * FAIL-CLOSED: if `AGENT_API_KEY` is unset the endpoint refuses (503) rather
 * than serving an unauthenticated agent loop.
 */
export function requireApiKey(req: Request): AuthResult {
  const expected = process.env.AGENT_API_KEY?.trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "not_configured",
      message:
        "Set AGENT_API_KEY in the environment to enable /api/agent. The starter refuses to run an unauthenticated agent loop.",
    };
  }
  const header = req.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const presented = bearer || req.headers.get("x-api-key")?.trim() || "";
  if (!presented || !timingSafeEqual(presented, expected)) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "Missing or invalid API key. Send Authorization: Bearer <AGENT_API_KEY>.",
    };
  }
  return { ok: true };
}

// ─── in-memory fixed-window rate limit ───────────────────────────────────────

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 10_000;

/** Returns true if the call is allowed, false if the window is exhausted. */
export function rateLimit(scope: string, id: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const key = `${scope}:${id}`;
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

/** Convenience: a 401/503/429 JSON response from a guard result. */
export function guardResponse(
  r: { status: number; error: string; message: string },
): NextResponse {
  return NextResponse.json(
    { error: r.error, message: r.message },
    { status: r.status },
  );
}
