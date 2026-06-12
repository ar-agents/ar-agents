/**
 * Seller side of x402: framework-agnostic helpers built on the Web API
 * Request/Response (works in Next.js route handlers, Hono, raw Edge
 * functions, Bun, Deno; anything that speaks Fetch).
 *
 * Typical seller flow:
 *   1. Request arrives without X-PAYMENT -> return paymentRequiredResponse()
 *   2. Request arrives with X-PAYMENT -> verifyPayment() via facilitator
 *   3. Verified -> do the work, then settleAndRespond() to settle on-chain
 *      and attach X-PAYMENT-RESPONSE to the success response.
 */
import {
  X402_VERSION,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  paymentPayloadSchema,
  type PaymentRequirements,
  type PaymentPayload,
  type SettlementResponse,
  type VerifyResponse,
} from "./types";
import { encodeBase64Json, decodeBase64Json } from "./encoding";
import type { FacilitatorClient } from "./client";

/**
 * Build the HTTP 402 response advertising how to pay. `accepts` takes one
 * or many PaymentRequirements (spec allows multiple acceptable methods).
 */
export function paymentRequiredResponse(
  accepts: PaymentRequirements | PaymentRequirements[],
  opts: { error?: string; headers?: HeadersInit } = {},
): Response {
  const list = Array.isArray(accepts) ? accepts : [accepts];
  return new Response(
    JSON.stringify({
      x402Version: X402_VERSION,
      error: opts.error ?? `${X_PAYMENT_HEADER} header is required`,
      accepts: list,
    }),
    {
      status: 402,
      headers: { "content-type": "application/json", ...opts.headers },
    },
  );
}

/** Extract + decode + validate the X-PAYMENT header from a Request. */
export function extractPaymentPayload(
  request: Request,
): { ok: true; payload: PaymentPayload } | { ok: false; reason: string } {
  const header = request.headers.get(X_PAYMENT_HEADER);
  if (!header) {
    return { ok: false, reason: `Missing ${X_PAYMENT_HEADER} header` };
  }
  let raw: unknown;
  try {
    raw = decodeBase64Json(header);
  } catch {
    return {
      ok: false,
      reason: `${X_PAYMENT_HEADER} header is not valid base64 JSON`,
    };
  }
  const parsed = paymentPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `${X_PAYMENT_HEADER} header does not match the PaymentPayload schema`,
    };
  }
  return { ok: true, payload: parsed.data };
}

export type VerifyPaymentResult =
  | { verified: true; payload: PaymentPayload; verify: VerifyResponse }
  | {
      verified: false;
      /** A ready-to-return 402 Response explaining the failure. */
      response: Response;
      reason: string;
    };

/**
 * Verify an incoming paid request: extracts X-PAYMENT, calls the
 * facilitator's POST /verify. On failure returns a ready-made 402
 * Response (re-advertising `requirements`) so handlers can early-return.
 */
export async function verifyPayment(
  request: Request,
  requirements: PaymentRequirements,
  facilitator: FacilitatorClient,
): Promise<VerifyPaymentResult> {
  const extracted = extractPaymentPayload(request);
  if (!extracted.ok) {
    return {
      verified: false,
      reason: extracted.reason,
      response: paymentRequiredResponse(requirements, {
        error: extracted.reason,
      }),
    };
  }
  const verify = await facilitator.verify(extracted.payload, requirements);
  if (!verify.isValid) {
    const reason = verify.invalidReason ?? "Payment verification failed";
    return {
      verified: false,
      reason,
      response: paymentRequiredResponse(requirements, { error: reason }),
    };
  }
  return { verified: true, payload: extracted.payload, verify };
}

/** Attach a base64 SettlementResponse as X-PAYMENT-RESPONSE on a Response. */
export function withSettlementHeader(
  response: Response,
  settlement: SettlementResponse,
): Response {
  const headers = new Headers(response.headers);
  headers.set(X_PAYMENT_RESPONSE_HEADER, encodeBase64Json(settlement));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Settle a verified payment via the facilitator's POST /settle and attach
 * the outcome to the response:
 *  - settlement success: returns `successResponse` + X-PAYMENT-RESPONSE
 *  - settlement failure: returns a 402 (per transports-v1/http.md, failed
 *    settlement maps to 402) with X-PAYMENT-RESPONSE carrying the failure
 */
export async function settleAndRespond(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  facilitator: FacilitatorClient,
  successResponse: Response,
): Promise<Response> {
  const settlement = await facilitator.settle(payload, requirements);
  if (!settlement.success) {
    const failed = paymentRequiredResponse(requirements, {
      error: `Payment settlement failed: ${settlement.errorReason ?? "unknown"}`,
    });
    return withSettlementHeader(failed, settlement);
  }
  return withSettlementHeader(successResponse, settlement);
}
