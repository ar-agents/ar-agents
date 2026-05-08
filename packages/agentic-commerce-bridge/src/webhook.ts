// ACP webhook signing + verification.
//
// Spec (`openapi.agentic_checkout_webhook.yaml` 2026-04-17):
//   Header: `Merchant-Signature: t=<unix_seconds>,v1=<64_hex>`
//   Algorithm: HMAC-SHA256
//   Signed payload: `timestamp + "." + raw_body`
//   Recommended timestamp tolerance: 300 seconds
//   Reject with 401 on:
//     - Missing / malformed Merchant-Signature header
//     - Timestamp outside allowed window
//     - Signature mismatch
//
// Uses the WebCrypto API directly (`crypto.subtle`) so this works in Node
// 20+, Vercel Edge, Cloudflare Workers, Deno, and Bun without a Node-only
// import.

import type { WebhookEvent } from "./schemas/webhook";

export const SIGNATURE_HEADER = "Merchant-Signature";
const SIGNATURE_PATTERN = /^t=(\d+),v1=([a-fA-F0-9]{64})$/;
const DEFAULT_TOLERANCE_SECONDS = 300;

export type WebhookVerifyError =
  | { code: "missing_signature"; message: string }
  | { code: "malformed_signature"; message: string }
  | { code: "timestamp_out_of_window"; message: string; ageSeconds: number }
  | { code: "signature_mismatch"; message: string };

export class WebhookVerificationError extends Error {
  readonly detail: WebhookVerifyError;
  constructor(detail: WebhookVerifyError) {
    super(detail.message);
    this.name = "WebhookVerificationError";
    this.detail = detail;
  }
}

export interface SignWebhookOptions {
  /** UTF-8 secret shared between merchant and agent. */
  secret: string;
  /** Pre-serialized JSON body. MUST be byte-identical to what's sent. */
  rawBody: string;
  /** Unix timestamp seconds. Defaults to `Math.floor(Date.now() / 1000)`. */
  timestamp?: number;
}

export interface SignedWebhook {
  /** Header value to set as `Merchant-Signature`. */
  signature: string;
  /** The unix-seconds timestamp embedded. */
  timestamp: number;
}

/**
 * Sign a webhook body. Returns `t=<ts>,v1=<sig>` formatted header value.
 *
 * The merchant calls this when emitting an `order_create` / `order_update`
 * webhook to the agent.
 */
export async function signWebhook(
  options: SignWebhookOptions,
): Promise<SignedWebhook> {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const payload = `${timestamp}.${options.rawBody}`;
  const sig = await hmacSha256Hex(options.secret, payload);
  return {
    signature: `t=${timestamp},v1=${sig}`,
    timestamp,
  };
}

export interface VerifyWebhookOptions {
  /** UTF-8 secret. */
  secret: string;
  /** Raw HTTP body as a string. MUST be the exact bytes received. */
  rawBody: string;
  /** Header value of `Merchant-Signature`. */
  signatureHeader: string | null | undefined;
  /** Override clock for deterministic tests. Unix seconds. */
  now?: number;
  /** Tolerance window. Default 300s per spec. */
  toleranceSeconds?: number;
}

/**
 * Verify a webhook body. Returns parsed `WebhookEvent` payload on success.
 * Throws `WebhookVerificationError` on any failure (caller maps to 401).
 *
 * The agent calls this when receiving merchant webhooks. (And the merchant
 * calls this on its own outbound emissions during local testing.)
 *
 * Note: this performs cryptographic verification only. Schema validation is
 * a separate step — pipe the returned `payload` through
 * `WebhookEvent.parse()` to type-check.
 */
export async function verifyWebhook(
  options: VerifyWebhookOptions,
): Promise<{ timestamp: number; payload: unknown }> {
  const header = options.signatureHeader;
  if (!header) {
    throw new WebhookVerificationError({
      code: "missing_signature",
      message: "Missing Merchant-Signature header.",
    });
  }

  const match = SIGNATURE_PATTERN.exec(header);
  if (!match) {
    throw new WebhookVerificationError({
      code: "malformed_signature",
      message: "Merchant-Signature must be t=<timestamp>,v1=<64_hex>.",
    });
  }

  const tsRaw = match[1];
  const sigHex = match[2];
  // Regex guarantees both groups; this assertion satisfies strict TS.
  if (!tsRaw || !sigHex) {
    throw new WebhookVerificationError({
      code: "malformed_signature",
      message: "Merchant-Signature components missing.",
    });
  }

  const timestamp = Number.parseInt(tsRaw, 10);
  if (!Number.isFinite(timestamp)) {
    throw new WebhookVerificationError({
      code: "malformed_signature",
      message: "Timestamp is not a valid integer.",
    });
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const ageSeconds = Math.abs(now - timestamp);
  if (ageSeconds > tolerance) {
    throw new WebhookVerificationError({
      code: "timestamp_out_of_window",
      message: `Timestamp outside allowed window (${ageSeconds}s > ${tolerance}s).`,
      ageSeconds,
    });
  }

  const expected = await hmacSha256Hex(
    options.secret,
    `${timestamp}.${options.rawBody}`,
  );
  if (!constantTimeEqualHex(expected, sigHex)) {
    throw new WebhookVerificationError({
      code: "signature_mismatch",
      message: "Webhook signature verification failed.",
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(options.rawBody);
  } catch {
    payload = null;
  }

  return { timestamp, payload };
}

/**
 * Convenience: verify and Zod-parse in one call. Throws on either failure.
 *
 * @returns the typed `WebhookEvent` from the body.
 */
export async function verifyAndParseWebhook(
  options: VerifyWebhookOptions,
  parser: { parse: (input: unknown) => WebhookEvent },
): Promise<{ timestamp: number; event: WebhookEvent }> {
  const { timestamp, payload } = await verifyWebhook(options);
  const event = parser.parse(payload);
  return { timestamp, event };
}

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToHex(new Uint8Array(signed));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Constant-time string comparison for hex strings of equal length.
 * Defends against timing attacks on signature verification.
 */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // Lowercase both for case-insensitive hex comparison.
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  let diff = 0;
  for (let i = 0; i < aLower.length; i++) {
    diff |= aLower.charCodeAt(i) ^ bLower.charCodeAt(i);
  }
  return diff === 0;
}

function getSubtleCrypto(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error(
      "WebCrypto API is required (globalThis.crypto.subtle). " +
        "Available in Node 20+, browsers, Vercel Edge, Cloudflare Workers, Deno, Bun.",
    );
  }
  return c.subtle;
}
