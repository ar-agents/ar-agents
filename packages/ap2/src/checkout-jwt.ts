// The inner Checkout JWT.
//
// AP2 v0.2 critical rule (spec §A.1, security_and_privacy_considerations.md):
//
//   The merchant Checkout JWT (the inner JWT whose hash is `checkout_hash`)
//   MUST use a non-deterministic digital-signature scheme such as ECDSA.
//   Deterministic schemes like Ed25519 are FORBIDDEN — the protocol relies
//   on signature entropy to defeat rainbow-table preimage attacks against
//   `checkout_hash`.
//
// This module enforces that rule at construction time + provides the
// canonical hashing helper that produces `checkout_hash`.

import {
  signCompactJws,
  verifyCompactJws,
  sha256Base64url,
  decodeJwsUnverified,
  type JoseCryptoKey,
  type VerifyOptions,
} from "./crypto";
import { CheckoutJwtPayload } from "./schemas/checkout-mandate";

const FORBIDDEN_INNER_CHECKOUT_ALGS = new Set([
  "EdDSA",
  "Ed25519",
  "Ed448",
  "none",
]);

const DEFAULT_INNER_ALG = "ES256";

export class CheckoutJwtAlgError extends Error {
  constructor(alg: string) {
    super(
      `checkout_jwt MUST use a non-deterministic algorithm (e.g. ES256). ` +
        `Got '${alg}'. AP2 v0.2 forbids deterministic schemes for this layer ` +
        `because they leak no entropy to defeat rainbow-table attacks against ` +
        `checkout_hash.`,
    );
    this.name = "CheckoutJwtAlgError";
  }
}

export interface SignCheckoutJwtOptions {
  /** Algorithm. Default `ES256`. MUST be non-deterministic ECDSA. */
  alg?: "ES256" | "ES384" | "ES512" | "RS256";
  /** Optional kid. */
  kid?: string;
  /** Optional issuance time (Unix seconds). Default `Math.floor(Date.now()/1000)`. */
  iat?: number;
  /** Optional expiration (Unix seconds). */
  exp?: number;
}

/**
 * Sign a checkout payload as the inner `checkout_jwt`. Returns the compact
 * JWS string (suitable for stuffing into `ClosedCheckoutMandate.checkout_jwt`).
 *
 * Pairs with `computeCheckoutHash` — the closed mandate must carry both.
 */
export async function signCheckoutJwt(
  payload: unknown,
  signingKey: JoseCryptoKey,
  options: SignCheckoutJwtOptions = {},
): Promise<string> {
  const alg = options.alg ?? DEFAULT_INNER_ALG;
  if (FORBIDDEN_INNER_CHECKOUT_ALGS.has(alg)) {
    throw new CheckoutJwtAlgError(alg);
  }
  const parsed = CheckoutJwtPayload.parse(payload);
  const claims: Record<string, unknown> = { ...parsed };
  const iat = options.iat ?? Math.floor(Date.now() / 1000);
  claims["iat"] = iat;
  if (options.exp !== undefined) claims["exp"] = options.exp;
  return signCompactJws(claims, signingKey, {
    alg,
    typ: "JWT",
    ...(options.kid !== undefined ? { kid: options.kid } : {}),
  });
}

/**
 * Compute `checkout_hash` per spec: `base64url(sha-256(checkout_jwt))`.
 *
 * The closed Checkout Mandate's `checkout_hash` MUST equal this value, AND
 * the closed Payment Mandate's `transaction_id` MUST equal this value.
 */
export async function computeCheckoutHash(
  checkoutJwt: string,
): Promise<string> {
  return sha256Base64url(checkoutJwt);
}

/**
 * Verify the inner `checkout_jwt` signature. Use this when receiving a
 * Closed Checkout Mandate — after extracting `checkout_jwt`, hash it to
 * confirm `checkout_hash` matches, then call this to verify the merchant
 * actually signed the cart payload.
 */
export async function verifyCheckoutJwt(
  checkoutJwt: string,
  verificationKey: JoseCryptoKey,
  options: VerifyOptions = {},
): Promise<{ payload: unknown; alg: string }> {
  const result = await verifyCompactJws(checkoutJwt, verificationKey, {
    ...options,
    // Restrict to non-deterministic algs.
    algorithms: options.algorithms ?? ["ES256", "ES384", "ES512", "RS256"],
  });
  const alg = result.protectedHeader.alg;
  if (typeof alg !== "string" || FORBIDDEN_INNER_CHECKOUT_ALGS.has(alg)) {
    throw new CheckoutJwtAlgError(String(alg));
  }
  return { payload: result.payload as unknown, alg };
}

/**
 * Decode the inner Checkout JWT WITHOUT signature verification. Useful when
 * the merchant is serving a hosted JWKS and a separate verifier needs to
 * resolve the header `kid` before verification.
 */
export function decodeCheckoutJwt(checkoutJwt: string): {
  header: ReturnType<typeof decodeJwsUnverified>["protectedHeader"];
  payload: unknown;
} {
  const { protectedHeader, payload } = decodeJwsUnverified(checkoutJwt);
  return { header: protectedHeader, payload };
}
