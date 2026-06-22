/**
 * Per-society capability tokens: real bearer secrets that authorize a privileged
 * surface by POSSESSION, not by knowledge of a semi-public identifier (a CUIT is
 * on every factura, padron-resolvable, and leaked verbatim by the public audit
 * log, so "knows the CUIT" can never be authentication).
 *
 * Two kinds share this one mechanism:
 *  - "admin" (prefix `sat_`): held by the human art. 102 administrator; authorizes
 *    suspend / resume / approve / deny. Returned to the human once at constitution.
 *  - "gate"  (prefix `sgt_`): held by the DEPLOYED society's runtime (baked into its
 *    env as SOCIETY_GATE_TOKEN); proves a call to /api/approvals/gate really comes
 *    from the society itself, so a stranger who merely knows the sessionId cannot
 *    flood its approval queue (approval fatigue).
 *
 * Each token is minted WRITE-ONCE per (kind, sessionId): returned in plaintext
 * exactly once, stored only as a SHA-256 hash, and verified in constant time. The
 * write-once guarantee means a later re-constitution can never rotate or steal an
 * existing credential. Storage: Vercel KV, in-memory fallback for local dev.
 */

import { kv } from "@vercel/kv";
import { constantTimeEqual } from "./incorporate-auth";

const enc = new TextEncoder();

// kind -> (sessionId -> tokenHash). Per-kind so an admin token and a gate token
// for the same session never collide in the dev fallback.
const memStores = new Map<string, Map<string, string>>();
function memStore(kind: string): Map<string, string> {
  let m = memStores.get(kind);
  if (!m) {
    m = new Map<string, string>();
    memStores.set(kind, m);
  }
  return m;
}

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

// Key shape preserved from the original admin-token module: `society:admintoken:`
// for kind "admin" so existing stored hashes keep verifying after this refactor.
const storeKey = (kind: string, sessionId: string) => `society:${kind}token:${sessionId}`;

async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Mint a capability token of `kind` (token prefix `prefix`), store its hash
 * WRITE-ONCE, and return the plaintext exactly once. Returns null if this
 * (kind, sessionId) already has a token, so a later re-constitution can never
 * rotate or steal the credential.
 */
export async function mintCapabilityToken(
  kind: string,
  prefix: string,
  sessionId: string,
): Promise<string | null> {
  const token = `${prefix}_${crypto.randomUUID().replace(/-/g, "")}${crypto
    .randomUUID()
    .replace(/-/g, "")}`;
  const hash = await sha256hex(token);
  if (isKvWired()) {
    const got = await kv.set(storeKey(kind, sessionId), hash, { nx: true });
    if (!got) return null; // already minted (write-once)
  } else {
    const m = memStore(kind);
    if (m.has(sessionId)) return null;
    m.set(sessionId, hash);
  }
  return token;
}

/** Whether a (kind, sessionId) has a token minted. */
export async function hasCapabilityToken(kind: string, sessionId: string): Promise<boolean> {
  const stored = isKvWired()
    ? await kv.get<string>(storeKey(kind, sessionId))
    : memStore(kind).get(sessionId);
  return Boolean(stored);
}

/** Verify a presented token against the stored hash, in constant time. */
export async function verifyCapabilityToken(
  kind: string,
  sessionId: string,
  token: string,
): Promise<boolean> {
  if (!token || token.length < 8) return false;
  const stored = isKvWired()
    ? await kv.get<string>(storeKey(kind, sessionId))
    : memStore(kind).get(sessionId);
  if (!stored) return false;
  return constantTimeEqual(await sha256hex(token), stored);
}
