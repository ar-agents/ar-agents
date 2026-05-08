// AP2 v0.2 receipts.
//
// Receipts are PLAIN JWTs (NOT SD-JWTs). They MUST be signed by the issuer
// (Merchant for CheckoutReceipt, MPP for PaymentReceipt). The `reference`
// claim binds the receipt to the closed mandate it confirms — equal to the
// `sd_hash` of the closed mandate's SD-JWT presentation.

import {
  signCompactJws,
  verifyCompactJws,
  type JoseCryptoKey,
  type VerifyOptions,
} from "./crypto";
import {
  CheckoutReceipt,
  PaymentReceipt,
  type CheckoutReceipt as TCheckoutReceipt,
  type PaymentReceipt as TPaymentReceipt,
} from "./schemas/receipts";

// ---------------------------------------------------------------------------
// Build receipts (sign as compact JWT)
// ---------------------------------------------------------------------------

export interface BuildCheckoutReceiptOptions {
  receipt: TCheckoutReceipt;
  signingKey: JoseCryptoKey;
  alg?: string;
  kid?: string;
}

export async function buildCheckoutReceipt(
  options: BuildCheckoutReceiptOptions,
): Promise<string> {
  const parsed = CheckoutReceipt.parse(options.receipt);
  return signCompactJws(parsed as unknown as Record<string, unknown>, options.signingKey, {
    alg: options.alg ?? "ES256",
    typ: "JWT",
    ...(options.kid !== undefined ? { kid: options.kid } : {}),
  });
}

export interface BuildPaymentReceiptOptions {
  receipt: TPaymentReceipt;
  signingKey: JoseCryptoKey;
  alg?: string;
  kid?: string;
}

export async function buildPaymentReceipt(
  options: BuildPaymentReceiptOptions,
): Promise<string> {
  const parsed = PaymentReceipt.parse(options.receipt);
  return signCompactJws(parsed as unknown as Record<string, unknown>, options.signingKey, {
    alg: options.alg ?? "ES256",
    typ: "JWT",
    ...(options.kid !== undefined ? { kid: options.kid } : {}),
  });
}

// ---------------------------------------------------------------------------
// Verify receipts
// ---------------------------------------------------------------------------

export interface VerifyReceiptOptions extends VerifyOptions {
  /** Expected issuer (`iss` claim). */
  expectedIssuer?: string;
  /** Expected reference (sd_hash of the closed mandate). */
  expectedReference?: string;
}

export async function verifyCheckoutReceipt(
  jws: string,
  verificationKey: JoseCryptoKey,
  options: VerifyReceiptOptions = {},
): Promise<TCheckoutReceipt> {
  const result = await verifyCompactJws(jws, verificationKey, options);
  const parsed = CheckoutReceipt.safeParse(result.payload);
  if (!parsed.success) {
    throw new Error(
      `CheckoutReceipt payload invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  if (options.expectedIssuer && parsed.data.iss !== options.expectedIssuer) {
    throw new Error(
      `CheckoutReceipt iss mismatch: expected '${options.expectedIssuer}', got '${parsed.data.iss}'`,
    );
  }
  if (
    options.expectedReference &&
    parsed.data.reference !== options.expectedReference
  ) {
    throw new Error(
      `CheckoutReceipt reference mismatch: expected '${options.expectedReference}', got '${parsed.data.reference}'`,
    );
  }
  return parsed.data;
}

export async function verifyPaymentReceipt(
  jws: string,
  verificationKey: JoseCryptoKey,
  options: VerifyReceiptOptions = {},
): Promise<TPaymentReceipt> {
  const result = await verifyCompactJws(jws, verificationKey, options);
  const parsed = PaymentReceipt.safeParse(result.payload);
  if (!parsed.success) {
    throw new Error(
      `PaymentReceipt payload invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  if (options.expectedIssuer && parsed.data.iss !== options.expectedIssuer) {
    throw new Error(
      `PaymentReceipt iss mismatch: expected '${options.expectedIssuer}', got '${parsed.data.iss}'`,
    );
  }
  if (
    options.expectedReference &&
    parsed.data.reference !== options.expectedReference
  ) {
    throw new Error(
      `PaymentReceipt reference mismatch: expected '${options.expectedReference}', got '${parsed.data.reference}'`,
    );
  }
  return parsed.data;
}
