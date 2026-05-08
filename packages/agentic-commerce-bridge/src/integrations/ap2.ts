// AP2 mandate integration helper.
//
// When an agent submits an AP2 Closed Checkout Mandate as the payment
// credential (`payment_data.instrument.credential.type: "ap2_mandate"`),
// the host's `PaymentProvider.processPayment` should verify the mandate
// before authorizing the actual payment downstream (MP, x402, card rails,
// etc.).
//
// This module is a thin convenience wrapper around `@ar-agents/ap2`. It's
// opt-in — `@ar-agents/ap2` is an OPTIONAL peer dependency. Hosts that
// don't need AP2 don't pay for it.
//
// Usage inside a custom PaymentProvider:
//
//   import { verifyAp2CheckoutCredential, signAp2CheckoutReceipt }
//     from "@ar-agents/agentic-commerce-bridge";
//   import type { Jwk } from "@ar-agents/ap2";
//
//   const provider: PaymentProvider = {
//     handlerId: "ap2-then-mp",
//     async processPayment({ session, paymentData }) {
//       const cred = paymentData.instrument?.credential;
//       if (cred?.type === "ap2_mandate") {
//         const verified = await verifyAp2CheckoutCredential({
//           credentialToken: cred.token,
//           agentPublicJwk: AGENT_JWK,
//           merchantPublicJwk: MERCHANT_JWK,
//         });
//         if (!verified.ok) return { success: false, code: verified.code, message: verified.reason };
//         // Verified — proceed with downstream MP / x402 / card rails.
//         // ...
//         // After success, attach a signed AP2 CheckoutReceipt to the result.
//         const receiptJwt = await signAp2CheckoutReceipt({
//           merchantPrivateKey: MERCHANT_PRIVATE_KEY,
//           issuer: "merchant_1",
//           sdHash: verified.sdHash,
//           orderId: ORDER_ID,
//         });
//         return { success: true, paymentId: "...", metadata: { ap2_receipt: receiptJwt } };
//       }
//       // ... non-AP2 path.
//     },
//   };

// We import @ar-agents/ap2 only as type-imports to avoid a hard runtime dep.
// The host MUST install @ar-agents/ap2 for these helpers to actually work.
import type {
  Jwk,
  JoseCryptoKey,
  CheckoutJwtPayload,
  ClosedCheckoutMandate,
  CheckoutReceipt,
} from "@ar-agents/ap2";

// ---------------------------------------------------------------------------
// Verify an AP2 Closed Checkout Mandate inside processPayment.
// ---------------------------------------------------------------------------

export interface VerifyAp2CredentialOptions {
  /**
   * The compact SD-JWT VC presentation passed by the agent as
   * `payment_data.instrument.credential.token`.
   */
  credentialToken: string;
  /** Agent's public JWK (issuer of the closed mandate's SD-JWT). */
  agentPublicJwk: Jwk | JoseCryptoKey;
  /** Merchant's public JWK (issuer of the inner `checkout_jwt`). */
  merchantPublicJwk: Jwk | JoseCryptoKey;
  /** Optional iss claim on the issuer JWS. */
  issuer?: string;
  /** Clock tolerance in seconds. Default 30. */
  clockTolerance?: number;
  /** Override "now" for tests. */
  currentDate?: Date;
  /** When the SD-JWT terminates with a KB-JWT, supply expected aud + nonce. */
  keyBinding?: { audience: string; nonce: string };
}

export type Ap2VerifyOutcome =
  | {
      ok: true;
      /** sd_hash of the closed mandate — pass into `signAp2CheckoutReceipt`. */
      sdHash: string;
      /** Verified inner checkout payload. */
      checkout: CheckoutJwtPayload;
      /** Verified closed mandate. */
      closed: ClosedCheckoutMandate;
    }
  | {
      ok: false;
      /** Maps directly to ACP error codes for `processPayment` failure. */
      code: string;
      reason: string;
    };

/**
 * Verify an AP2 Closed Checkout Mandate carried as the payment credential.
 *
 * Returns success with the resolved checkout payload + sdHash when valid;
 * returns a structured failure suitable for return as a
 * `PaymentResult` failure (`{ success: false, code, message }`).
 *
 * `@ar-agents/ap2` MUST be installed by the host. Throws at runtime if
 * the import fails.
 */
export async function verifyAp2CheckoutCredential(
  options: VerifyAp2CredentialOptions,
): Promise<Ap2VerifyOutcome> {
  const ap2 = await loadAp2();

  const result = await ap2.verifyClosedCheckoutMandate(options.credentialToken, {
    issuerKey: options.agentPublicJwk,
    checkoutJwtKey: options.merchantPublicJwk,
    ...(options.issuer !== undefined ? { issuer: options.issuer } : {}),
    ...(options.clockTolerance !== undefined
      ? { clockTolerance: options.clockTolerance }
      : {}),
    ...(options.currentDate !== undefined
      ? { currentDate: options.currentDate }
      : {}),
    ...(options.keyBinding !== undefined ? { keyBinding: options.keyBinding } : {}),
  });

  if (result.ok) {
    return {
      ok: true,
      sdHash: result.sdHash,
      checkout: result.mandate.checkout,
      closed: result.mandate.closed,
    };
  }
  return {
    ok: false,
    code: mapAp2CodeToAcp(result.code),
    reason: result.reason,
  };
}

// ---------------------------------------------------------------------------
// Sign an AP2 CheckoutReceipt after a successful payment.
// ---------------------------------------------------------------------------

export interface SignAp2CheckoutReceiptOptions {
  /** Merchant's signing key — same one used to sign the inner `checkout_jwt`. */
  merchantPrivateKey: JoseCryptoKey;
  /** AP2 algorithm. Default `ES256`. */
  alg?: string;
  /** Optional kid header. */
  kid?: string;
  /** Receipt issuer (`iss` claim). Equals merchant identity. */
  issuer: string;
  /** sd_hash of the closed mandate (from `verifyAp2CheckoutCredential`). */
  sdHash: string;
  /** Merchant's order id. */
  orderId: string;
  /** Override iat for deterministic tests. */
  iat?: number;
}

export async function signAp2CheckoutReceipt(
  options: SignAp2CheckoutReceiptOptions,
): Promise<string> {
  const ap2 = await loadAp2();
  const receipt: CheckoutReceipt = {
    status: "Success",
    iss: options.issuer,
    iat: options.iat ?? Math.floor(Date.now() / 1000),
    reference: options.sdHash,
    order_id: options.orderId,
  };
  return ap2.buildCheckoutReceipt({
    receipt,
    signingKey: options.merchantPrivateKey,
    ...(options.alg !== undefined ? { alg: options.alg } : {}),
    ...(options.kid !== undefined ? { kid: options.kid } : {}),
  });
}

// ---------------------------------------------------------------------------
// Sign an AP2 PaymentReceipt — for the MPP role (after the actual money moves).
// ---------------------------------------------------------------------------

export interface SignAp2PaymentReceiptOptions {
  /** MPP signing key. */
  mppPrivateKey: JoseCryptoKey;
  alg?: string;
  kid?: string;
  /** Receipt issuer (MPP identity). */
  issuer: string;
  /** sd_hash of the Closed Payment Mandate. */
  sdHash: string;
  /** PSP-side payment id (e.g. MP `payment.id`). */
  paymentId: string;
  /** Optional confirmation ids. */
  pspConfirmationId?: string;
  networkConfirmationId?: string;
  iat?: number;
}

export async function signAp2PaymentReceipt(
  options: SignAp2PaymentReceiptOptions,
): Promise<string> {
  const ap2 = await loadAp2();
  return ap2.buildPaymentReceipt({
    receipt: {
      status: "Success",
      iss: options.issuer,
      iat: options.iat ?? Math.floor(Date.now() / 1000),
      reference: options.sdHash,
      payment_id: options.paymentId,
      ...(options.pspConfirmationId !== undefined
        ? { psp_confirmation_id: options.pspConfirmationId }
        : {}),
      ...(options.networkConfirmationId !== undefined
        ? { network_confirmation_id: options.networkConfirmationId }
        : {}),
    },
    signingKey: options.mppPrivateKey,
    ...(options.alg !== undefined ? { alg: options.alg } : {}),
    ...(options.kid !== undefined ? { kid: options.kid } : {}),
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** AP2 error codes map to ACP `PaymentResult.code` strings. */
function mapAp2CodeToAcp(code: string): string {
  switch (code) {
    case "invalid_credential":
      return "invalid_payment_token";
    case "invalid_mandate":
      return "validation_failed";
    case "unresolved_constraint":
      return "validation_failed";
    case "mandates_not_supported":
      return "unsupported_capability";
    default:
      return code;
  }
}

/**
 * Lazy-load `@ar-agents/ap2`. Throws a helpful error if the optional peer
 * dep isn't installed.
 */
async function loadAp2(): Promise<typeof import("@ar-agents/ap2")> {
  try {
    return await import("@ar-agents/ap2");
  } catch {
    throw new Error(
      "AP2 helpers require '@ar-agents/ap2' to be installed. Run `pnpm add @ar-agents/ap2` and retry.",
    );
  }
}
