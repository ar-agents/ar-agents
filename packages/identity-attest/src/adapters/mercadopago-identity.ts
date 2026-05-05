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
}

const DEFAULT_BASE_URL = "https://api.mercadopago.com";

export class MercadoPagoIdentityAdapter implements AttestAdapter {
  readonly id = "mercadopago_identity";
  readonly trustLevel = 0.5;

  private readonly accessToken: string;
  private readonly microChargeAmount: number;
  private readonly microChargeRefund: boolean;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: MercadoPagoIdentityAdapterOptions) {
    this.accessToken = options.accessToken;
    this.microChargeAmount = options.microChargeAmount ?? 1;
    this.microChargeRefund = options.microChargeRefund ?? true;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl;
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
    | { verified: true; claims?: Record<string, unknown> }
    | { verified: false; reason: string }
  > {
    const paymentId = params.submitted.oauthCode ?? params.submitted.token;
    if (!paymentId) {
      return {
        verified: false,
        reason: "Missing payment_id. The agent must POST the MP webhook's data.id as `oauthCode` or `token`.",
      };
    }

    const fetchFn = this.fetchImpl ?? globalThis.fetch;
    let res: Response;
    try {
      res = await fetchFn(`${this.baseUrl}/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
    } catch (err) {
      throw new AttestAdapterError(
        this.id,
        `MP payment lookup failed (network): ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
    if (!res.ok) {
      return {
        verified: false,
        reason: `MP payment lookup failed: HTTP ${res.status}`,
      };
    }
    const payment = (await res.json()) as {
      status: string;
      transaction_amount: number;
      payer?: {
        id?: string | number;
        email?: string;
        first_name?: string;
        last_name?: string;
        identification?: { type?: string; number?: string };
      };
    };

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

    // Auto-refund the micro-charge (best effort; verification succeeds even if refund fails)
    if (this.microChargeRefund) {
      try {
        await fetchFn(`${this.baseUrl}/v1/payments/${paymentId}/refunds`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
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
    };
  }
}
