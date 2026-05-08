/**
 * RFC 7636 (Proof Key for Code Exchange) primitives. Pure Web Crypto — no
 * Node-only APIs — so this works in Edge Runtime, Cloudflare Workers, Deno,
 * and the browser.
 *
 * # Why PKCE
 *
 * PKCE binds the OAuth `code` to a random secret created in the same
 * browser session. Without it, an attacker who steals the `code` (via log
 * leak, malicious browser extension, or a man-in-the-middle on the
 * callback) can exchange it for tokens. With PKCE, the attacker also needs
 * the verifier — which never leaves the original session.
 *
 * Mi Argentina REQUIRES PKCE for all clients (public and confidential)
 * since 2024. The S256 method is the only supported transform.
 */

/**
 * Generate a cryptographically random PKCE `code_verifier`. Per RFC 7636,
 * 43–128 characters from `[A-Z][a-z][0-9]-._~`. We use 64 characters of
 * unreserved-base64url, which carries 384 bits of entropy.
 */
export function generateCodeVerifier(byteLength = 48): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Compute the S256 `code_challenge` from a verifier:
 *   challenge = base64url(SHA256(verifier))
 */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Generate a random opaque token suitable for OAuth `state` or OIDC `nonce`.
 * 32 bytes ⇒ 256 bits of entropy ⇒ ~43 base64url characters.
 */
export function generateRandomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** RFC 4648 base64url (no padding). */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  // btoa is available in Node 16+, Edge runtimes, and browsers.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode RFC 4648 base64url (no padding) back to bytes. */
export function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
