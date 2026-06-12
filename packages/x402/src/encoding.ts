/**
 * Base64 JSON helpers for the X-PAYMENT / X-PAYMENT-RESPONSE headers.
 * Edge Runtime compatible: uses btoa/atob + TextEncoder/TextDecoder
 * (all Web standard, available in Node 20+, workers, browsers) instead
 * of Buffer.
 */

/** Encode a JSON-serializable value as base64(JSON), UTF-8 safe. */
export function encodeBase64Json(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Decode base64(JSON) back to a value. Throws SyntaxError on bad JSON. */
export function decodeBase64Json(encoded: string): unknown {
  const binary = atob(encoded.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
