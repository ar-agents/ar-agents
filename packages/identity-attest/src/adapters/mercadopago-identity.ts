import {
  ArAgentsProtocolError,
  ArAgentsResponseValidationError,
  HttpClient,
} from "@ar-agents/core";
import { z } from "zod";
import type { AttestAdapter } from "./base";
import { AttestAdapterError } from "../errors";
import { randomToken } from "./base";
import type { VerificationSubject } from "../types";

/**
 * Verifies identity via a Mercado Pago micro-charge ($1 ARS by default).
 *
 * # Why this is the killer adapter (and its honest limitation)
 *
 * MP doesn't expose a public KYC API. But every successful payment carries
 * `payer.identification.{type, number}` (DNI/CUIT) and `payer.email` that MP
 * has validated against their internal KYC database. So a successful payment
 * is *implicit proof* that the buyer's MP account holds the claimed
 * identification — which is good enough for the 90% question SMBs ask:
 * "is this CUIT real and tied to a payable AR account?"
 *
 * This is **NOT full KYC** (no document image verification, no liveness
 * check, no government-database cross-reference). Trust level reflects that:
 *
 * - **0.5**: payment-payer attestation (MP confirms CUIT+email tied to a
 *   verified MP account). When MP eventually ships a real KYC API, we'll
 *   bump to 0.85 in v0.3+.
 *
 * # Flow
 *
 * 1. Agent calls `request_identity_verification(method: "mercadopago_identity")`.
 * 2. Agent's frontend renders MP Cards Brick / Wallet Brick with
 *    `external_reference = request_id` and `amount = microChargeAmount`.
 * 3. User completes the micro-payment.
 * 4. MP webhook fires; agent's webhook handler calls
 *    `submit_oauth_code(request_id, payment_id)` (we reuse the oauthCode
 *    field for the payment_id — semantics are similar: an opaque token to
 *    redeem against the provider).
 * 5. Adapter polls `GET /v1/payments/{payment_id}` for `status: approved`.
 * 6. Optionally auto-refunds the $1 (default true).
 * 7. Returns claims with `identification_type`, `identification_number`,
 *    `email`, `first_name`, `last_name`.
 */

export interface MercadoPagoIdentityAdapterOptions {
  /** Seller's MP access token (TEST- or APP_USR-). Required. */
  accessToken: string;
  /** Micro-charge amount in ARS. Default 1. */
  microChargeAmount?: number;
  /** Auto-refund the micro-charge after verification. Default true. */
  microChargeRefund?: boolean;
  /** MP API base URL — for testing. Default https://api.mercadopago.com */
  baseUrl?: string;
  /** Custom fetch — for testing / observability. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 10_000. The MP calls had NO timeout —
   * a hung api.mercadopago.com would block the verification forever. */
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.mercadopago.com";

// The MP payment fields this adapter needs. Validated at the boundary so a
// malformed body can't be blind-cast into a verification: an approved-looking
// payment with no `status`/`transaction_amount` must fail loud, never mint an
// identity attestation. Unknown MP fields are ignored (stripped).
const mpPaymentSchema = z.object({
  status: z.string(),
  transaction_amount: z.number(),
  payer: z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      email: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      identification: z
        .object({ type: z.string().optional(), number: z.string().optional() })
        .optional(),
    })
    .optional(),
});

export class MercadoPagoIdentityAdapter implements AttestAdapter {
  readonly id = "mercadopago_identity";
  readonly trustLevel = 0.5;

  private readonly microChargeAmount: number;
  private readonly microChargeRefund: boolean;
  private readonly client: HttpClient;

  constructor(options: MercadoPagoIdentityAdapterOptions) {
    this.microChargeAmount = options.microChargeAmount ?? 1;
    this.microChargeRefund = options.microChargeRefund ?? true;
    this.client = new HttpClient({
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      auth: `Bearer ${options.accessToken}`,
      timeoutMs: options.timeoutMs ?? 10_000,
      // Idempotent GET payment lookups can retry a transient 5xx; the refund
      // POST opts out per-call (never double-refund).
      retry: { maxAttempts: 2 },
      ...(options.fetchImpl !== undefined ? { fetch: options.fetchImpl } : {}),
    });
  }

  /** Random nonce — the actual "secret" is the payment_id the agent submits. */
  generateSecret(): string {
    return randomToken(16);
  }

  buildVerificationUrl(): string | null {
    return null; // Agent's frontend renders the MP Brick
  }

  async deliverChallenge(): Promise<void> {
    // No-op: agent's frontend renders the MP payment form.
  }

  async verify(params: {
    submitted: { oauthCode?: string; token?: string };
    subject: VerificationSubject;
  }): Promise<
    | {
        verified: true;
        claims?: Record<string, unknown>;
        verifiedSubject?: VerificationSubject;
      }
    | { verified: false; reason: string }
  > {
    const paymentId = params.submitted.oauthCode ?? params.submitted.token;
    if (!paymentId) {
      return {
        verified: false,
        reason: "Missing payment_id. The agent must POST the MP webhook's data.id as `oauthCode` or `token`.",
      };
    }

    let payment: z.infer<typeof mpPaymentSchema>;
    try {
      payment = await this.client.request({
        path: `/v1/payments/${encodeURIComponent(paymentId)}`,
        schema: mpPaymentSchema,
      });
    } catch (err) {
      // A non-2xx from MP (payment not found, bad token, etc.) → not verified.
      if (err instanceof ArAgentsProtocolError && err.status !== null) {
        return { verified: false, reason: `MP payment lookup failed: HTTP ${err.status}` };
      }
      // A malformed 200 body must NOT be blind-cast into a verification —
      // fail loud (fail-closed) rather than mint an attestation from garbage.
      if (err instanceof ArAgentsResponseValidationError) {
        throw new AttestAdapterError(
          this.id,
          `MP payment response did not match the expected shape; refusing to mint an attestation. ${err.message}`,
          err,
        );
      }
      // Network / timeout.
      throw new AttestAdapterError(
        this.id,
        `MP payment lookup failed (network): ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    if (payment.status !== "approved") {
      return {
        verified: false,
        reason: `Payment status is "${payment.status}" (expected "approved"). User did not complete the micro-charge.`,
      };
    }

    if (payment.transaction_amount > this.microChargeAmount * 1.5) {
      // Sanity check — agent shouldn't accept an arbitrary payment as identity proof
      return {
        verified: false,
        reason: `Payment amount ${payment.transaction_amount} exceeds expected micro-charge ${this.microChargeAmount}. Suspicious; rejected.`,
      };
    }

    // Auto-refund the micro-charge (best effort; verification succeeds even if
    // refund fails). `retry: false` — a refund is non-idempotent; never fire it
    // twice on a transient error.
    if (this.microChargeRefund) {
      try {
        await this.client.requestRaw({
          method: "POST",
          path: `/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
          retry: false,
        });
      } catch {
        // Swallow — verification already succeeded, refund is best-effort
      }
    }

    return {
      verified: true,
      claims: {
        sub: payment.payer?.id ? `mp:${payment.payer.id}` : null,
        email: payment.payer?.email ?? null,
        first_name: payment.payer?.first_name ?? null,
        last_name: payment.payer?.last_name ?? null,
        identification_type: payment.payer?.identification?.type ?? null,
        identification_number: payment.payer?.identification?.number ?? null,
        payment_id: paymentId,
        refunded: this.microChargeRefund,
      },
      // Bind to the payer the payment actually proves. The client rejects if
      // this doesn't equal request.subject — so an approved payment can't mint
      // an attestation for an arbitrary subject. When MP can't prove the
      // requested subject type (e.g. a phone request — MP carries no payer
      // phone), we return an empty value to force a fail-closed mismatch.
      verifiedSubject: mpVerifiedSubject(params.subject.type, payment.payer),
    };
  }
}

/**
 * Build the subject a MercadoPago payment can authoritatively prove, keyed to
 * the requested subject type. Empty value = "MP cannot prove this" → the client
 * fails the binding check (closed).
 */
function mpVerifiedSubject(
  requestedType: VerificationSubject["type"],
  payer: z.infer<typeof mpPaymentSchema>["payer"],
): VerificationSubject {
  const idType = (payer?.identification?.type ?? "").toUpperCase();
  const idNum = payer?.identification?.number ?? "";
  if (requestedType === "email") {
    return { type: "email", value: payer?.email ?? "" };
  }
  if (requestedType === "cuit") {
    // AFIP CUIL is a CUIT-shaped key; treat it as cuit.
    return { type: "cuit", value: idType === "CUIT" || idType === "CUIL" ? idNum : "" };
  }
  if (requestedType === "dni") {
    return { type: "dni", value: idType === "DNI" ? idNum : "" };
  }
  // phone / oauth / custom — MP carries no such field; force a mismatch.
  return { type: requestedType, value: "" };
}
