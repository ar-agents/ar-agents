/**
 * Base64 (de)serialization of the x402 headers. Edge-runtime safe: uses the
 * global btoa/atob + TextEncoder, never Node's Buffer.
 *
 *   X-PAYMENT           = base64(JSON(PaymentPayload))        (client -> server)
 *   X-PAYMENT-RESPONSE  = base64(JSON(SettleResponse))        (server -> client)
 */

import {
  PaymentPayloadSchema,
  SettleResponseSchema,
  type PaymentPayload,
  type SettleResponse,
} from "./types";

export const X_PAYMENT_HEADER = "X-PAYMENT";
export const X_PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE";

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Encode a PaymentPayload into the X-PAYMENT header value. */
export function encodePaymentHeader(payload: PaymentPayload): string {
  return toBase64(JSON.stringify(payload));
}

/**
 * Decode + validate an X-PAYMENT header value. Throws (ZodError or SyntaxError)
 * on a malformed header; callers map that to the `invalid_payload` reason.
 */
export function decodePaymentHeader(header: string): PaymentPayload {
  return PaymentPayloadSchema.parse(JSON.parse(fromBase64(header)));
}

/** Encode a SettleResponse into the X-PAYMENT-RESPONSE header value. */
export function encodeSettlementHeader(res: SettleResponse): string {
  return toBase64(JSON.stringify(res));
}

/** Decode + validate an X-PAYMENT-RESPONSE header value. */
export function decodeSettlementHeader(header: string): SettleResponse {
  return SettleResponseSchema.parse(JSON.parse(fromBase64(header)));
}
