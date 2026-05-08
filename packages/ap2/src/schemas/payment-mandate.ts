import { z } from "zod";
import { Cnf } from "./jwk";
import { Amount, Merchant, PaymentInstrument, Pisp } from "./common";
import { Constraint } from "./constraints";

// AP2 v0.2 — Payment Mandate (open + closed).
//
// Spec reference: `code/sdk/schemas/ap2/payment_mandate.json`,
// `code/sdk/schemas/ap2/open_payment_mandate.json`.

// ---- Closed Payment Mandate ----------------------------------------------

export const ClosedPaymentMandate = z.object({
  vct: z.literal("mandate.payment.1"),
  /**
   * MUST equal `checkout_hash` of the linked Closed Checkout Mandate. This
   * is AP2's anti-mismatch / anti-replay primitive — the verifier
   * recomputes hash(checkout_jwt) and asserts equality.
   */
  transaction_id: z.string().min(1),
  payee: Merchant,
  /** Optional Payment Initiation Service Provider routing. */
  pisp: Pisp.optional(),
  payment_amount: Amount,
  payment_instrument: PaymentInstrument,
  /** ISO 8601. Absent = immediate execution. */
  execution_date: z.string().optional(),
  /** Free-form risk metadata supplied by the issuer. */
  risk_data: z.record(z.string(), z.unknown()).optional(),
  iat: z.number().int().nonnegative().optional(),
  exp: z.number().int().nonnegative().optional(),
});
export type ClosedPaymentMandate = z.infer<typeof ClosedPaymentMandate>;

// ---- Open Payment Mandate ------------------------------------------------

export const OpenPaymentMandate = z.object({
  vct: z.literal("mandate.payment.open.1"),
  /**
   * REQUIRED set of constraints. Must contain `payment.reference` (binds
   * to an Open Checkout Mandate via its sd_hash). May contain any subset
   * of the other 7 payment-side constraint types.
   */
  constraints: z.array(Constraint).min(1),
  cnf: Cnf,
  iat: z.number().int().nonnegative().optional(),
  exp: z.number().int().nonnegative().optional(),
});
export type OpenPaymentMandate = z.infer<typeof OpenPaymentMandate>;
