/**
 * x402 protocol types, straight from the v1 spec
 * (coinbase/x402 specs/x402-specification-v1.md + transports-v1/http.md).
 *
 * Zod schemas are the source of truth; TS types are inferred. Only fields
 * the spec documents are modeled. Scheme-specific payloads (`payload` inside
 * PaymentPayload, `extra` inside PaymentRequirements) are deliberately left
 * as opaque records because they vary per scheme (exact-evm vs exact-svm vs
 * future schemes) and this package is scheme-agnostic: the signer adapter
 * owns scheme knowledge.
 */
import { z } from "zod";

/** Protocol version this package implements. */
export const X402_VERSION = 1;

/** HTTP header carrying the base64-encoded PaymentPayload (client to server). */
export const X_PAYMENT_HEADER = "X-PAYMENT";

/** HTTP header carrying the base64-encoded SettlementResponse (server to client). */
export const X_PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE";

// ── PaymentRequirements ─────────────────────────────────────────────

/**
 * One acceptable payment method, as published inside the 402 body's
 * `accepts` array. Spec section 5.1.2.
 */
export const paymentRequirementsSchema = z.object({
  /** Payment scheme identifier, e.g. "exact". */
  scheme: z.string().min(1),
  /** Blockchain network identifier, e.g. "base-sepolia", "base". */
  network: z.string().min(1),
  /** Required payment amount in atomic token units, as a decimal string. */
  maxAmountRequired: z.string().min(1),
  /** Token contract address. */
  asset: z.string().min(1),
  /** Recipient wallet address. */
  payTo: z.string().min(1),
  /** URL of the protected resource. */
  resource: z.string().min(1),
  /** Human-readable description of the resource. */
  description: z.string(),
  /** MIME type of the expected response. Optional per spec. */
  mimeType: z.string().optional(),
  /**
   * JSON schema describing the response format. Optional per spec; the
   * reference server emits `null`, so null is accepted and normalized away.
   */
  outputSchema: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? undefined),
  /** Maximum time allowed for payment completion, in seconds. */
  maxTimeoutSeconds: z.number(),
  /** Scheme-specific extra info (e.g. { name: "USDC", version: "2" }). */
  extra: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? undefined),
});

export type PaymentRequirements = z.infer<typeof paymentRequirementsSchema>;

/**
 * The full JSON body of an HTTP 402 response. Spec section 5.1.1.
 * All three fields are required by the spec.
 */
export const paymentRequiredBodySchema = z.object({
  x402Version: z.number(),
  /** Human-readable reason payment is required. */
  error: z.string(),
  /** Acceptable payment methods. The client picks one. */
  accepts: z.array(paymentRequirementsSchema),
});

export type PaymentRequiredBody = z.infer<typeof paymentRequiredBodySchema>;

// ── PaymentPayload ──────────────────────────────────────────────────

/**
 * Payment authorization the client sends back, base64-JSON encoded into
 * the X-PAYMENT header. Spec section 5.2.
 *
 * The inner `payload` is scheme-specific (for "exact" on EVM it is
 * { signature, authorization: { from, to, value, validAfter, validBefore,
 * nonce } }); this package keeps it opaque because the signer adapter
 * produces it and the facilitator consumes it verbatim.
 */
export const paymentPayloadSchema = z.object({
  x402Version: z.number(),
  scheme: z.string().min(1),
  network: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type PaymentPayload = z.infer<typeof paymentPayloadSchema>;

// ── SettlementResponse (X-PAYMENT-RESPONSE) ─────────────────────────

/** Spec section 5.3. Returned base64-JSON in the X-PAYMENT-RESPONSE header. */
export const settlementResponseSchema = z.object({
  success: z.boolean(),
  /** Error reason when settlement failed. Omitted on success. */
  errorReason: z.string().optional(),
  /** Blockchain tx hash. Empty string when settlement failed. */
  transaction: z.string(),
  network: z.string(),
  /** Payer wallet address. */
  payer: z.string(),
});

export type SettlementResponse = z.infer<typeof settlementResponseSchema>;

// ── Facilitator API (spec section 7) ────────────────────────────────

/** Request body for both POST /verify and POST /settle. */
export const facilitatorRequestSchema = z.object({
  x402Version: z.number(),
  paymentPayload: paymentPayloadSchema,
  paymentRequirements: paymentRequirementsSchema,
});

export type VerifyRequest = z.infer<typeof facilitatorRequestSchema>;
export type SettleRequest = z.infer<typeof facilitatorRequestSchema>;

/** Response from POST /verify. Spec 7.1. */
export const verifyResponseSchema = z.object({
  isValid: z.boolean(),
  /** Present when isValid is false. One of the spec's error codes. */
  invalidReason: z.string().optional(),
  /**
   * Payer wallet address. The spec shows it in both success and error
   * examples but does not list it in a field table, so it is modeled as
   * optional to tolerate facilitators that omit it.
   */
  payer: z.string().optional(),
});

export type VerifyResponse = z.infer<typeof verifyResponseSchema>;

/** Response from POST /settle. Same shape as SettlementResponse. Spec 7.2. */
export const settleResponseSchema = settlementResponseSchema;
export type SettleResponse = z.infer<typeof settleResponseSchema>;

/** Response from GET /supported. Spec 7.3. */
export const supportedKindsSchema = z.object({
  kinds: z.array(
    z.object({
      x402Version: z.number(),
      scheme: z.string(),
      network: z.string(),
    }),
  ),
});

export type SupportedKinds = z.infer<typeof supportedKindsSchema>;

// ── Signer adapter contract ─────────────────────────────────────────

/**
 * Produces a signed PaymentPayload for one PaymentRequirements entry.
 * Wallets and signing stay OUTSIDE this package: wire viem, the Coinbase
 * CDP SDK, or any signer here. The adapter receives the requirements the
 * client selected and must return a payload whose scheme + network match.
 */
export type X402Signer = (
  requirements: PaymentRequirements,
) => Promise<PaymentPayload>;
