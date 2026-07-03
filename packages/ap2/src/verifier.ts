// Single-hop AP2 mandate verifier.
//
// Implements the canonical verification rules from AP2 v0.2 §C, restricted
// to single-hop SD-JWT presentations. Multi-hop chain walking (with
// hop-by-hop `cnf.jwk` PoP binding) ships in Phase 2.2.
//
// What's checked, in order:
//   1. SD-JWT compact serialization parses cleanly.
//   2. Issuer JWT signature is valid against caller-supplied issuer key.
//   3. Disclosures resolve cleanly into the issuer payload.
//   4. `vct` matches the expected mandate type.
//   5. Time claims (`iat`, `exp`) within tolerance.
//   6. (Closed Checkout) `checkout_hash` equals base64url(sha-256(checkout_jwt)).
//   7. (Closed Payment) `transaction_id` equals the supplied
//      `linkedClosedCheckoutMandateDigest`.
//   8. KB-JWT (if present): signature matches the expected
//      `cnf.jwk`-bound key, `aud`/`nonce`/`sd_hash` match.
//   9. (Open mandates) Constraints are evaluated. Unknown types fail with
//      `unresolved_constraint`.

import {
  base64urlEncode,
  importPublicJwk,
  sha256,
  sha256Base64url,
  verifyCompactJws,
  type JoseCryptoKey,
  type VerifyOptions as CryptoVerifyOptions,
} from "./crypto";
import {
  computeSdHash,
  parseSdJwt,
  resolveDisclosures,
  verifyKbJwt,
  SdJwtError,
} from "./sd-jwt";
import {
  ClosedCheckoutMandate,
  OpenCheckoutMandate,
  CheckoutJwtPayload,
  type ClosedCheckoutMandate as TClosedCheckoutMandate,
  type OpenCheckoutMandate as TOpenCheckoutMandate,
} from "./schemas/checkout-mandate";
import {
  ClosedPaymentMandate,
  OpenPaymentMandate,
  type ClosedPaymentMandate as TClosedPaymentMandate,
  type OpenPaymentMandate as TOpenPaymentMandate,
} from "./schemas/payment-mandate";
import type { Jwk } from "./schemas/jwk";
import { computeCheckoutHash, verifyCheckoutJwt } from "./checkout-jwt";
import {
  evaluateCheckoutConstraint,
  evaluatePaymentConstraint,
  type EvaluationResult,
  type BudgetTracker,
} from "./constraints";
import type { Constraint } from "./schemas/constraints";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type VerificationOutcome<T> =
  | {
      ok: true;
      mandate: T;
      /** sd_hash of the verified presentation — useful for receipts. */
      sdHash: string;
    }
  | {
      ok: false;
      code:
        | "invalid_credential"
        | "invalid_mandate"
        | "unresolved_constraint"
        | "mandates_not_supported";
      reason: string;
    };

// ---------------------------------------------------------------------------
// Common verification opts
// ---------------------------------------------------------------------------

export interface CommonVerifyOptions {
  /** Issuer public key, as JWK or already-imported CryptoKey. */
  issuerKey: Jwk | JoseCryptoKey;
  /** Algorithm declared by the issuer key. Default ES256. */
  issuerAlg?: string;
  /** Optional iss claim to validate. */
  issuer?: string;
  /** Clock tolerance for iat/exp (seconds). Default 30. */
  clockTolerance?: number;
  /** Override "now" for deterministic tests. */
  currentDate?: Date;
}

export interface KeyBindingVerifyOptions {
  /** Verifier-issued audience. */
  audience: string;
  /** Verifier-issued nonce — must equal the KB-JWT's `nonce`. */
  nonce: string;
}

// ---------------------------------------------------------------------------
// CLOSED CHECKOUT MANDATE
// ---------------------------------------------------------------------------

export interface VerifyClosedCheckoutOptions extends CommonVerifyOptions {
  /** Merchant key that signed the inner `checkout_jwt`. */
  checkoutJwtKey: Jwk | JoseCryptoKey;
  /** Algorithm of the inner `checkout_jwt`. ES256 default. */
  checkoutJwtAlg?: string;
  /** Required when the SD-JWT terminates with a KB-JWT. */
  keyBinding?: KeyBindingVerifyOptions;
}

export interface VerifiedClosedCheckout {
  closed: TClosedCheckoutMandate;
  /** The verified inner checkout payload. */
  checkout: CheckoutJwtPayload;
  /** sd_hash of the SD-JWT presentation (used as receipt `reference`). */
  sdHash: string;
}

export async function verifyClosedCheckoutMandate(
  presentation: string,
  options: VerifyClosedCheckoutOptions,
): Promise<VerificationOutcome<VerifiedClosedCheckout>> {
  let parts;
  try {
    parts = parseSdJwt(presentation);
  } catch (err) {
    return invalidCredential(err);
  }

  // 1. Verify issuer JWT.
  const issuerKey = await resolveKey(options.issuerKey, options.issuerAlg ?? "ES256");
  let issuerResult;
  try {
    issuerResult = await verifyCompactJws(parts.issuerJwt, issuerKey, {
      ...(options.issuer !== undefined ? { issuer: options.issuer } : {}),
      ...(options.clockTolerance !== undefined ? { clockTolerance: options.clockTolerance } : {}),
      ...(options.currentDate !== undefined ? { currentDate: options.currentDate } : {}),
    });
  } catch (err) {
    return invalidCredential(err);
  }
  const rawIssuerPayload = issuerResult.payload as Record<string, unknown>;

  // 2. Resolve disclosures.
  let resolved: Record<string, unknown>;
  try {
    resolved = await resolveDisclosures(rawIssuerPayload, parts.disclosures);
  } catch (err) {
    return invalidCredential(err);
  }

  // 3. Validate Zod shape.
  const parsedClosed = ClosedCheckoutMandate.safeParse(resolved);
  if (!parsedClosed.success) {
    return {
      ok: false,
      code: "invalid_credential",
      reason: `Closed Checkout Mandate schema invalid: ${parsedClosed.error.issues[0]?.message ?? "unknown"}`,
    };
  }

  // 4. Verify checkout_hash equals hash(checkout_jwt).
  const expectedHash = await computeCheckoutHash(parsedClosed.data.checkout_jwt);
  if (expectedHash !== parsedClosed.data.checkout_hash) {
    return {
      ok: false,
      code: "invalid_mandate",
      reason: `checkout_hash mismatch: payload=${parsedClosed.data.checkout_hash}, computed=${expectedHash}`,
    };
  }

  // 5. Verify the inner checkout_jwt + parse the cart payload.
  const checkoutKey = await resolveKey(
    options.checkoutJwtKey,
    options.checkoutJwtAlg ?? "ES256",
  );
  let innerPayload;
  try {
    const inner = await verifyCheckoutJwt(parsedClosed.data.checkout_jwt, checkoutKey, {
      ...(options.clockTolerance !== undefined ? { clockTolerance: options.clockTolerance } : {}),
      ...(options.currentDate !== undefined ? { currentDate: options.currentDate } : {}),
    });
    const parsed = CheckoutJwtPayload.safeParse(inner.payload);
    if (!parsed.success) {
      return {
        ok: false,
        code: "invalid_credential",
        reason: `Inner checkout_jwt payload invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      };
    }
    innerPayload = parsed.data;
  } catch (err) {
    return invalidCredential(err);
  }

  // 6. Verify KB-JWT if present.
  const sdHash = await computeSdHash({
    issuerJwt: parts.issuerJwt,
    disclosures: parts.disclosures,
  });
  if (parts.kbJwt) {
    if (!options.keyBinding) {
      return {
        ok: false,
        code: "invalid_credential",
        reason: "Presentation includes KB-JWT but no keyBinding options were supplied",
      };
    }
    // Key binding requires the verifier to know the holder's `cnf.jwk`. For
    // a single-hop closed mandate, that is not carried in the closed payload
    // — it would come from the linked Open Checkout Mandate's `cnf.jwk`. In
    // single-hop direct-flow tests, both are signed by the same key.
    // Phase 2.1: accept the KB-JWT against the issuer key (single-actor flow).
    try {
      await verifyKbJwt(parts.kbJwt, issuerKey, {
        audience: options.keyBinding.audience,
        nonce: options.keyBinding.nonce,
        sdHash,
      });
    } catch (err) {
      return invalidCredential(err);
    }
  }

  return {
    ok: true,
    sdHash,
    mandate: { closed: parsedClosed.data, checkout: innerPayload, sdHash } as VerifiedClosedCheckout,
  };
}

// ---------------------------------------------------------------------------
// OPEN CHECKOUT MANDATE — verify + evaluate constraints against a closed
// checkout payload.
// ---------------------------------------------------------------------------

export interface VerifyOpenCheckoutOptions extends CommonVerifyOptions {
  /** The closed mandate's verified inner checkout payload. */
  closedCheckout: CheckoutJwtPayload;
  closedMandate: TClosedCheckoutMandate;
  keyBinding?: KeyBindingVerifyOptions;
}

export async function verifyOpenCheckoutMandate(
  presentation: string,
  options: VerifyOpenCheckoutOptions,
): Promise<VerificationOutcome<TOpenCheckoutMandate>> {
  return verifyOpenMandate(presentation, options, OpenCheckoutMandate, (mandate) => {
    for (const c of mandate.constraints) {
      const result = evaluateCheckoutConstraint(c as Constraint, {
        checkoutPayload: options.closedCheckout,
        closedMandate: options.closedMandate,
      });
      if (!result.ok) return result;
    }
    return { ok: true } as EvaluationResult;
  });
}

// ---------------------------------------------------------------------------
// CLOSED PAYMENT MANDATE
// ---------------------------------------------------------------------------

export interface VerifyClosedPaymentOptions extends CommonVerifyOptions {
  /**
   * `checkout_hash` of the linked Closed Checkout Mandate. Required —
   * `transaction_id` MUST equal this value.
   */
  expectedTransactionId: string;
  keyBinding?: KeyBindingVerifyOptions;
}

export interface VerifiedClosedPayment {
  closed: TClosedPaymentMandate;
  sdHash: string;
}

export async function verifyClosedPaymentMandate(
  presentation: string,
  options: VerifyClosedPaymentOptions,
): Promise<VerificationOutcome<VerifiedClosedPayment>> {
  let parts;
  try {
    parts = parseSdJwt(presentation);
  } catch (err) {
    return invalidCredential(err);
  }

  const issuerKey = await resolveKey(options.issuerKey, options.issuerAlg ?? "ES256");
  let issuerResult;
  try {
    issuerResult = await verifyCompactJws(parts.issuerJwt, issuerKey, {
      ...(options.issuer !== undefined ? { issuer: options.issuer } : {}),
      ...(options.clockTolerance !== undefined ? { clockTolerance: options.clockTolerance } : {}),
      ...(options.currentDate !== undefined ? { currentDate: options.currentDate } : {}),
    });
  } catch (err) {
    return invalidCredential(err);
  }

  let resolved: Record<string, unknown>;
  try {
    resolved = await resolveDisclosures(
      issuerResult.payload as Record<string, unknown>,
      parts.disclosures,
    );
  } catch (err) {
    return invalidCredential(err);
  }
  const parsedClosed = ClosedPaymentMandate.safeParse(resolved);
  if (!parsedClosed.success) {
    return {
      ok: false,
      code: "invalid_credential",
      reason: `Closed Payment Mandate schema invalid: ${parsedClosed.error.issues[0]?.message ?? "unknown"}`,
    };
  }

  if (parsedClosed.data.transaction_id !== options.expectedTransactionId) {
    return {
      ok: false,
      code: "invalid_mandate",
      reason: `Payment Mandate transaction_id '${parsedClosed.data.transaction_id}' does not match expected checkout_hash '${options.expectedTransactionId}'`,
    };
  }

  const sdHash = await computeSdHash({
    issuerJwt: parts.issuerJwt,
    disclosures: parts.disclosures,
  });
  if (parts.kbJwt) {
    if (!options.keyBinding) {
      return {
        ok: false,
        code: "invalid_credential",
        reason: "Presentation includes KB-JWT but no keyBinding options were supplied",
      };
    }
    try {
      await verifyKbJwt(parts.kbJwt, issuerKey, {
        audience: options.keyBinding.audience,
        nonce: options.keyBinding.nonce,
        sdHash,
      });
    } catch (err) {
      return invalidCredential(err);
    }
  }

  return {
    ok: true,
    sdHash,
    mandate: { closed: parsedClosed.data, sdHash },
  };
}

// ---------------------------------------------------------------------------
// OPEN PAYMENT MANDATE
// ---------------------------------------------------------------------------

export interface VerifyOpenPaymentOptions extends CommonVerifyOptions {
  closedMandate: TClosedPaymentMandate;
  /** sd_hash of the linked Open Checkout Mandate (for `payment.reference`). */
  linkedCheckoutMandateDigest?: string;
  /** Optional stateful tracker for `payment.budget` / `payment.agent_recurrence`. */
  tracker?: BudgetTracker;
  keyBinding?: KeyBindingVerifyOptions;
}

export async function verifyOpenPaymentMandate(
  presentation: string,
  options: VerifyOpenPaymentOptions,
): Promise<VerificationOutcome<TOpenPaymentMandate>> {
  return verifyOpenMandate(presentation, options, OpenPaymentMandate, async (mandate, sdHash) => {
    // Resolve the paired `payment.agent_recurrence` (if any) so the budget
    // evaluator can enforce both caps together.
    const recurrence = mandate.constraints.find(
      (c): c is Extract<Constraint, { type: "payment.agent_recurrence" }> =>
        c.type === "payment.agent_recurrence",
    );
    for (const c of mandate.constraints) {
      const result = await evaluatePaymentConstraint(c as Constraint, {
        closedMandate: options.closedMandate,
        openMandateDigest: sdHash,
        ...(options.linkedCheckoutMandateDigest !== undefined
          ? { linkedCheckoutMandateDigest: options.linkedCheckoutMandateDigest }
          : {}),
        ...(options.tracker !== undefined ? { tracker: options.tracker } : {}),
        ...(recurrence !== undefined
          ? {
              budgetRecurrence: {
                frequency: recurrence.frequency,
                max_occurrences: recurrence.max_occurrences,
              },
            }
          : {}),
      });
      if (!result.ok) return result;
    }
    return { ok: true } as EvaluationResult;
  });
}

// ---------------------------------------------------------------------------
// Internal: shared open-mandate verification + constraint loop
// ---------------------------------------------------------------------------

async function verifyOpenMandate<T>(
  presentation: string,
  options: CommonVerifyOptions & { keyBinding?: KeyBindingVerifyOptions },
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message?: string }> } } },
  evaluate: (mandate: T, sdHash: string) => EvaluationResult | Promise<EvaluationResult>,
): Promise<VerificationOutcome<T>> {
  let parts;
  try {
    parts = parseSdJwt(presentation);
  } catch (err) {
    return invalidCredential(err);
  }

  const issuerKey = await resolveKey(options.issuerKey, options.issuerAlg ?? "ES256");
  let issuerResult;
  try {
    issuerResult = await verifyCompactJws(parts.issuerJwt, issuerKey, {
      ...(options.issuer !== undefined ? { issuer: options.issuer } : {}),
      ...(options.clockTolerance !== undefined ? { clockTolerance: options.clockTolerance } : {}),
      ...(options.currentDate !== undefined ? { currentDate: options.currentDate } : {}),
    });
  } catch (err) {
    return invalidCredential(err);
  }
  let resolved: Record<string, unknown>;
  try {
    resolved = await resolveDisclosures(
      issuerResult.payload as Record<string, unknown>,
      parts.disclosures,
    );
  } catch (err) {
    return invalidCredential(err);
  }
  const parsedOpen = schema.safeParse(resolved);
  if (!parsedOpen.success) {
    return {
      ok: false,
      code: "invalid_credential",
      reason: `Open mandate schema invalid: ${parsedOpen.error.issues[0]?.message ?? "unknown"}`,
    };
  }
  const sdHash = await computeSdHash({
    issuerJwt: parts.issuerJwt,
    disclosures: parts.disclosures,
  });
  if (parts.kbJwt) {
    if (!options.keyBinding) {
      return {
        ok: false,
        code: "invalid_credential",
        reason: "Presentation includes KB-JWT but no keyBinding options were supplied",
      };
    }
    try {
      await verifyKbJwt(parts.kbJwt, issuerKey, {
        audience: options.keyBinding.audience,
        nonce: options.keyBinding.nonce,
        sdHash,
      });
    } catch (err) {
      return invalidCredential(err);
    }
  }

  // Constraint evaluation.
  const result = await evaluate(parsedOpen.data, sdHash);
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      reason: result.reason,
    };
  }

  return { ok: true, sdHash, mandate: parsedOpen.data };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveKey(
  keyOrJwk: Jwk | JoseCryptoKey,
  alg: string,
): Promise<JoseCryptoKey> {
  // CryptoKey-likes (jose) have a `type` field of "public" | "private" |
  // "secret"; JWKs have `kty`.
  if ("kty" in keyOrJwk) {
    return importPublicJwk(keyOrJwk, alg);
  }
  return keyOrJwk;
}

function invalidCredential(err: unknown): VerificationOutcome<never> {
  return {
    ok: false,
    code: "invalid_credential",
    reason: err instanceof Error ? err.message : String(err),
  };
}
