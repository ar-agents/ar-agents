import { z } from "zod";

// AP2 v0.2 — Checkout Receipt + Payment Receipt.
//
// Spec reference: `code/sdk/schemas/ap2/checkout_receipt.json`,
// `code/sdk/schemas/ap2/payment_receipt.json`.
//
// Receipts are PLAIN JWTs (NOT SD-JWTs) signed by their issuer:
//   - Checkout Receipt → signed by Merchant
//   - Payment Receipt  → signed by Merchant Payment Processor
//
// Both have `reference` = `sd_hash` of the closed mandate they receipt.
// On error, `status: "Error"` + canonical error code.

// ---- Receipt status -------------------------------------------------------

export const ReceiptStatus = z.enum(["Success", "Error"]);
export type ReceiptStatus = z.infer<typeof ReceiptStatus>;

// ---- Canonical error codes (per spec §G) ---------------------------------

export const ReceiptErrorCode = z.enum([
  /** Mandate failed signature or schema verification. Terminal. */
  "invalid_credential",
  /** Unknown constraint type / verifier can't evaluate one of the constraints.
   *  Non-terminal — caller falls back to non-agentic flow. */
  "unresolved_constraint",
  /** Mandate is well-formed but does not authorize the requested action. Terminal. */
  "invalid_mandate",
  /** Verifier doesn't speak AP2 at all. Non-terminal — fall back. */
  "mandates_not_supported",
]);
export type ReceiptErrorCode = z.infer<typeof ReceiptErrorCode>;

// ---- Checkout Receipt -----------------------------------------------------

export const CheckoutReceipt = z.object({
  status: ReceiptStatus,
  /** Issuer ID — equals merchant identity. */
  iss: z.string().min(1),
  /** Issued-at, Unix seconds. */
  iat: z.number().int().nonnegative(),
  /** sd_hash of the closed Checkout Mandate. */
  reference: z.string().min(1),
  /** Success branch: merchant-canonical order id. */
  order_id: z.string().optional(),
  /** Error branch: canonical code. */
  error: z.union([ReceiptErrorCode, z.string()]).optional(),
  error_description: z.string().optional(),
});
export type CheckoutReceipt = z.infer<typeof CheckoutReceipt>;

// ---- Payment Receipt ------------------------------------------------------

export const PaymentReceipt = z.object({
  status: ReceiptStatus,
  /** Issuer ID — equals MPP / network identity. */
  iss: z.string().min(1),
  iat: z.number().int().nonnegative(),
  reference: z.string().min(1),
  /** Always required (per spec) — provider-side payment id. */
  payment_id: z.string().min(1),
  /** Success branch — PSP-side confirmation id. */
  psp_confirmation_id: z.string().optional(),
  /** Success branch — payment-network-side confirmation id. */
  network_confirmation_id: z.string().optional(),
  /** Error branch. */
  error: z.union([ReceiptErrorCode, z.string()]).optional(),
  error_description: z.string().optional(),
});
export type PaymentReceipt = z.infer<typeof PaymentReceipt>;
