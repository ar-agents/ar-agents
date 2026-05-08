// `@ar-agents/ap2` — Public API.
//
// Phase 2.1 — single-hop AP2 v0.2.
//
// Coverage:
//   - All four mandate types (Open + Closed × Checkout + Payment) as Zod schemas
//   - All eight constraint types as Zod schemas + evaluators
//   - ES256 sign/verify (jose-backed) with rainbow-table-defending guard for `checkout_jwt`
//   - SD-JWT VC primitives (RFC 9901 disclosures, `sd_hash`, single-hop parser)
//   - KB-JWT (RFC 9901 §4.4) build + verify
//   - Issuer factories + verifier for each mandate type
//   - CheckoutReceipt + PaymentReceipt build + verify

// Schemas
export * from "./schemas";

// Crypto + JWS basics
export {
  AP2_ALGS,
  NON_DETERMINISTIC_ALGS,
  base64urlEncode,
  base64urlDecode,
  base64urlDecodeToString,
  sha256,
  sha256Base64url,
  generateAp2KeyPair,
  importPublicJwk,
  importPrivateJwk,
  signCompactJws,
  verifyCompactJws,
  decodeJwsUnverified,
  type Ap2Alg,
  type Ap2KeyPair,
  type SignOptions,
  type VerifyOptions,
  type DecodedJws,
  type JoseCryptoKey,
  type JWTPayload,
  type JWTHeaderParameters,
  type JWTVerifyResult,
} from "./crypto";

// Inner Checkout JWT
export {
  CheckoutJwtAlgError,
  signCheckoutJwt,
  verifyCheckoutJwt,
  computeCheckoutHash,
  decodeCheckoutJwt,
  type SignCheckoutJwtOptions,
} from "./checkout-jwt";

// SD-JWT VC primitives
export {
  encodeDisclosure,
  decodeDisclosure,
  generateSalt,
  digestOfDisclosure,
  parseSdJwt,
  serializeSdJwt,
  computeSdHash,
  resolveDisclosures,
  buildIssuerPayload,
  buildKbJwt,
  verifyIssuerJwt,
  verifyKbJwt,
  SdJwtError,
  type Disclosure,
  type ObjectDisclosure,
  type ArrayDisclosure,
  type ParsedSdJwt,
  type IssueSdJwtOptions,
  type ResolveOptions,
  type BuildKbJwtOptions,
  type IssuerVerification,
  type KbJwtVerification,
} from "./sd-jwt";

// Constraint evaluators
export {
  evaluateCheckoutConstraint,
  evaluatePaymentConstraint,
  divisorFor,
  type EvaluationResult,
  type CheckoutConstraintContext,
  type PaymentConstraintContext,
  type BudgetTracker,
} from "./constraints";

// Issuance
export {
  issueOpenCheckoutMandate,
  issueClosedCheckoutMandate,
  issueOpenPaymentMandate,
  issueClosedPaymentMandate,
  type IssuerSigningCtx,
  type KeyBindingCtx,
  type IssueOpenCheckoutOptions,
  type IssueClosedCheckoutOptions,
  type IssueOpenPaymentOptions,
  type IssueClosedPaymentOptions,
} from "./issuer";

// Verification
export {
  verifyClosedCheckoutMandate,
  verifyOpenCheckoutMandate,
  verifyClosedPaymentMandate,
  verifyOpenPaymentMandate,
  type CommonVerifyOptions,
  type KeyBindingVerifyOptions,
  type VerifyClosedCheckoutOptions,
  type VerifyOpenCheckoutOptions,
  type VerifyClosedPaymentOptions,
  type VerifyOpenPaymentOptions,
  type VerifiedClosedCheckout,
  type VerifiedClosedPayment,
  type VerificationOutcome,
} from "./verifier";

// Receipts
export {
  buildCheckoutReceipt,
  buildPaymentReceipt,
  verifyCheckoutReceipt,
  verifyPaymentReceipt,
  type BuildCheckoutReceiptOptions,
  type BuildPaymentReceiptOptions,
  type VerifyReceiptOptions,
} from "./receipts";
