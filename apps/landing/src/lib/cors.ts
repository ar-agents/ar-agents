import { NextResponse } from "next/server";

/**
 * Permissive CORS for the public agent-facing API routes (auditor/*,
 * auto-incorporate). These are unauthenticated or bearer-authenticated
 * (x-api-key in a header, never a cookie), so `*` origin is safe and lets a
 * browser-context agent or a third-party dashboard read both the response and
 * its errors. Server-to-server callers ignore CORS entirely.
 *
 * Both the preflight (OPTIONS) AND the actual response must carry
 * Access-Control-Allow-Origin or the browser blocks the read — hence jsonCors.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

/** NextResponse.json with CORS headers merged in (callers' headers win on conflict). */
export function jsonCors(data: unknown, init?: ResponseInit): NextResponse {
  const headers = new Headers(CORS_HEADERS);
  const extra = new Headers(init?.headers);
  extra.forEach((v, k) => headers.set(k, v));
  return NextResponse.json(data, { ...init, headers });
}

/** 204 preflight response with CORS headers. */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
