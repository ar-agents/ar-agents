/**
 * Universal crypto helpers — work in Node 18+, Vercel Edge Runtime,
 * Cloudflare Workers, browsers, and any environment with Web Crypto.
 *
 * Replaces the previous `node:crypto` usage so this package can run in
 * Edge Runtime + Workers without polyfills.
 */

const subtle: SubtleCrypto = (() => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error(
      "@ar-agents/identity-attest: Web Crypto API is not available in this runtime. Use Node 18+, Vercel Edge Runtime, Cloudflare Workers, or any modern browser.",
    );
  }
  return c.subtle;
})();

const encoder = new TextEncoder();

/** HMAC-SHA256 returning hex digest. Used to sign Attestations. */
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
  const sigBuf = await subtle.sign("HMAC", keyMaterial, encoder.encode(message));
  return bufferToHex(sigBuf);
}

/**
 * Constant-time comparison of two hex strings. Defangs timing attacks
 * that could leak the signing secret one byte at a time.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Edge-compatible UUID v4. Uses `crypto.randomUUID()` when available
 * (Node 19+, Edge Runtime, Workers, modern browsers); falls back to
 * `crypto.getRandomValues()` otherwise.
 */
export function randomUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error(
    "@ar-agents/identity-attest: no Web Crypto available for UUID generation.",
  );
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
