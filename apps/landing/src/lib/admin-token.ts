/**
 * Per-society administrator capability token.
 *
 * The art. 102 administrator authorizes suspend / resume / approve / deny by
 * PRESENTING this token, not by knowing a CUIT. A CUIT is semi-public (on every
 * factura, padron-resolvable, and leaked verbatim by the public audit log), so
 * "knows the admin CUIT" must never be authentication. This token is a real
 * secret: minted WRITE-ONCE at constitution, returned to the human exactly once,
 * stored only as a SHA-256 hash, and verified in constant time.
 *
 * The CUIT stays in the signed record as the *named* administrator (art. 102);
 * the token is the *proof*. Storage: Vercel KV, in-memory fallback for dev.
 */

import { kv } from "@vercel/kv";
import { constantTimeEqual } from "./incorporate-auth";

const enc = new TextEncoder();
const memTokens = new Map<string, string>(); // sessionId -> tokenHash

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

const tokenKey = (sessionId: string) => `society:admintoken:${sessionId}`;

async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Mint a society's admin token, store its hash WRITE-ONCE, and return the
 * plaintext exactly once. Returns null if the society already has a token (so a
 * later re-constitution can never rotate/steal the administrator credential).
 */
export async function mintAdminToken(sessionId: string): Promise<string | null> {
  const token = `sat_${crypto.randomUUID().replace(/-/g, "")}${crypto
    .randomUUID()
    .replace(/-/g, "")}`;
  const hash = await sha256hex(token);
  if (isKvWired()) {
    const got = await kv.set(tokenKey(sessionId), hash, { nx: true });
    if (!got) return null; // already minted (write-once)
  } else {
    if (memTokens.has(sessionId)) return null;
    memTokens.set(sessionId, hash);
  }
  return token;
}

/** Whether a society has an admin token (i.e. was constituted on the v2 path). */
export async function hasAdminToken(sessionId: string): Promise<boolean> {
  const stored = isKvWired()
    ? await kv.get<string>(tokenKey(sessionId))
    : memTokens.get(sessionId);
  return Boolean(stored);
}

/** Verify a presented token against the stored hash, in constant time. */
export async function verifyAdminToken(sessionId: string, token: string): Promise<boolean> {
  if (!token || token.length < 8) return false;
  const stored = isKvWired()
    ? await kv.get<string>(tokenKey(sessionId))
    : memTokens.get(sessionId);
  if (!stored) return false;
  return constantTimeEqual(await sha256hex(token), stored);
}
