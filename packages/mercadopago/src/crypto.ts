/**
 * Universal crypto helpers — work in Node 18+, Vercel Edge Runtime, browsers,
 * and any environment that exposes the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Crypto)
 * via `globalThis.crypto`.
 *
 * # Why this module exists
 *
 * Webhook HMAC verification and deterministic idempotency keys both need
 * crypto primitives. The previous implementation used `node:crypto` which
 * doesn't ship in Edge Runtime (Vercel Edge, Cloudflare Workers, Deno
 * deploy). Web Crypto is the cross-runtime standard.
 *
 * # Why async?
 *
 * Web Crypto's `crypto.subtle.*` methods are Promise-based by design (they
 * may delegate to hardware-backed key stores). The trade-off: signatures
 * change from `(...) => boolean` to `(...) => Promise<boolean>`. All call
 * sites in this package are already inside `async` tool execute() handlers,
 * so this is a zero-cost upgrade for the typical agent-tool consumer.
 *
 * # Performance
 *
 * Web Crypto in Node 18+ is implemented in OpenSSL-backed C, so HMAC-SHA256
 * costs ~100µs per verification — same order as the old `node:crypto`
 * synchronous path. For SHA256-of-string idempotency keys, perf is identical.
 */

const subtle: SubtleCrypto = (() => {
  // `crypto` is a global in modern Node (18+), Edge runtimes, browsers, etc.
  // `globalThis.crypto.subtle` exists if the runtime supports Web Crypto.
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error(
      "@ar-agents/mercadopago: Web Crypto API is not available in this runtime. Use Node 18+, Vercel Edge Runtime, Cloudflare Workers, or any modern browser.",
    );
  }
  return c.subtle;
})();

const encoder = new TextEncoder();

/**
 * Compute HMAC-SHA256 of `message` using `secret`. Returns the hex digest.
 *
 * @param secret The HMAC secret (e.g., MP webhook secret from dev panel).
 * @param message The string to authenticate.
 */
export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await subtle.sign(
    "HMAC",
    keyMaterial,
    encoder.encode(message),
  );
  return bufferToHex(sigBuf);
}

/**
 * Compute SHA-256 hash of `input`. Returns the full 64-char hex digest.
 *
 * Used for deterministic idempotency keys derived from caller-meaningful
 * fields. Truncate the output to 32 chars for storage if needed.
 */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await subtle.digest("SHA-256", encoder.encode(input));
  return bufferToHex(digest);
}

/**
 * Constant-time comparison of two hex strings. Use after computing an
 * expected HMAC to compare against a user-supplied signature, to prevent
 * timing attacks that could leak the secret.
 *
 * Falls back to a manual constant-time loop because `node:crypto`'s
 * `timingSafeEqual` isn't available in Edge.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return hex;
}
