/**
 * x402 v1 wire types + Zod schemas + Base/USDC constants.
 *
 * We model the x402 **v1** wire format (the widely-deployed Coinbase generation:
 * `X-PAYMENT` request header, `accepts` array in the 402 body, string `network`
 * enum). The underlying money mechanism is the `exact` EVM scheme = EIP-3009
 * `transferWithAuthorization` on USDC (gasless for the payer). v2 (`@x402/*`)
 * differs only in the envelope (header names + CAIP-2 networks); the EIP-712
 * core here is identical, so a v2 adapter can reuse `verify.ts` unchanged.
 *
 * Sources: docs.x402.org, github.com/coinbase/x402 (x402@1.2.0 published types),
 * EIP-3009, CDP network-support docs. Amounts are atomic strings (USDC = 6 dp:
 * "10000" = 0.01 USDC).
 */

import { z } from "zod";

export const X402_VERSION = 1 as const;

// ─────────────────────────────────────────────────────────────────────────────
// Networks + USDC (verified against CDP docs). EIP-712 domain name/version are
// the USDC contract's name()/version(); Base reports name "USDC" (NOT "USD Coin"
// — the classic footgun). requirements.extra can override per-asset.
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedNetwork = "base" | "base-sepolia";

export interface NetworkConfig {
  chainId: number;
  /** USDC ERC-20 address. */
  usdc: `0x${string}`;
  /** EIP-712 domain name of the USDC contract. */
  usdcName: string;
  /** EIP-712 domain version of the USDC contract. */
  usdcVersion: string;
}

export const NETWORKS: Record<SupportedNetwork, NetworkConfig> = {
  base: {
    chainId: 8453,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcName: "USDC",
    usdcVersion: "2",
  },
  "base-sepolia": {
    chainId: 84532,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcName: "USDC",
    usdcVersion: "2",
  },
};

export function isSupportedNetwork(n: string): n is SupportedNetwork {
  return n === "base" || n === "base-sepolia";
}

/** USDC has 6 decimals. */
export const USDC_DECIMALS = 6;

/** atomic units string -> USDC number (e.g. "10000" -> 0.01). */
export function atomicToUsdc(atomic: string): number {
  return Number(atomic) / 10 ** USDC_DECIMALS;
}
/** USDC number -> atomic units string (e.g. 0.01 -> "10000"). */
export function usdcToAtomic(usdc: number): string {
  return String(Math.round(usdc * 10 ** USDC_DECIMALS));
}

// ─────────────────────────────────────────────────────────────────────────────
// EIP-3009 TransferWithAuthorization typed data (stable per EIP-3009).
// ─────────────────────────────────────────────────────────────────────────────

export const EIP3009_PRIMARY_TYPE = "TransferWithAuthorization" as const;

export const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas (field names verbatim from x402 v1).
// ─────────────────────────────────────────────────────────────────────────────

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/, "expected 0x-hex");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected an EVM address");

export const PaymentRequirementsSchema = z.object({
  scheme: z.literal("exact"),
  network: z.string(),
  maxAmountRequired: z.string(),
  resource: z.string(),
  description: z.string().default(""),
  mimeType: z.string().default("application/json"),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  payTo: address,
  maxTimeoutSeconds: z.number().int().positive(),
  asset: address,
  extra: z.object({ name: z.string().optional(), version: z.string().optional() }).optional(),
});
export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;

export const PaymentRequirementsResponseSchema = z.object({
  x402Version: z.literal(1),
  error: z.string().default(""),
  accepts: z.array(PaymentRequirementsSchema).min(1),
});
export type PaymentRequirementsResponse = z.infer<typeof PaymentRequirementsResponseSchema>;

export const ExactEvmPayloadAuthorizationSchema = z.object({
  from: address,
  to: address,
  value: z.string(),
  validAfter: z.string(),
  validBefore: z.string(),
  nonce: hex.refine((s) => s.length === 66, "nonce must be bytes32 (0x + 64 hex)"),
});
export type ExactEvmPayloadAuthorization = z.infer<typeof ExactEvmPayloadAuthorizationSchema>;

export const ExactEvmPayloadSchema = z.object({
  signature: hex,
  authorization: ExactEvmPayloadAuthorizationSchema,
});
export type ExactEvmPayload = z.infer<typeof ExactEvmPayloadSchema>;

export const PaymentPayloadSchema = z.object({
  x402Version: z.literal(1),
  scheme: z.literal("exact"),
  network: z.string(),
  payload: ExactEvmPayloadSchema,
});
export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;

export const SettleResponseSchema = z.object({
  success: z.boolean(),
  transaction: z.string(),
  network: z.string(),
  payer: z.string().optional(),
  error: z.string().nullable().optional(),
});
export type SettleResponse = z.infer<typeof SettleResponseSchema>;

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: ReasonText;
  payer?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error reasons (x402 ErrorReasons enum).
// ─────────────────────────────────────────────────────────────────────────────

export const ERROR_REASONS = [
  "invalid_payload",
  "invalid_scheme",
  "invalid_network",
  "invalid_x402_version",
  "invalid_payment_requirements",
  "invalid_exact_evm_payload_recipient_mismatch",
  "invalid_exact_evm_payload_authorization_value",
  "invalid_exact_evm_payload_authorization_valid_after",
  "invalid_exact_evm_payload_authorization_valid_before",
  "payment_expired",
  "invalid_exact_evm_payload_signature",
  "insufficient_funds",
  "duplicate_settlement",
  "unsupported_scheme",
  "unexpected_verify_error",
  "unexpected_settle_error",
] as const;
export type ErrorReason = (typeof ERROR_REASONS)[number];

/**
 * A failure reason as seen on the wire. Our own local `verify.ts` always emits an
 * `ErrorReason` enum value, but a hosted facilitator speaks its own vocabulary:
 * the live x402.org facilitator returns `invalid_exact_evm_insufficient_balance`
 * on verify and a raw on-chain revert string on settle, neither of which is in
 * our enum. This type keeps enum autocomplete while accepting those passthroughs,
 * so the real cause reaches the caller instead of being flattened to "unexpected".
 */
export type ReasonText = ErrorReason | (string & {});
