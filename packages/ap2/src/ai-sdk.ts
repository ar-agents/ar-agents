// Vercel AI SDK 6 tools wrapper for AP2.
//
// Drop these tools straight into an `Experimental_Agent`'s `tools` option:
//
//   import { Experimental_Agent as Agent, stepCountIs } from "ai";
//   import { ap2Tools } from "@ar-agents/ap2/ai-sdk";
//
//   const agent = new Agent({
//     model: "anthropic/claude-sonnet-4-6",
//     tools: ap2Tools({
//       agentPublicJwk: AGENT_JWK,
//       merchantPublicJwk: MERCHANT_JWK,
//       merchantPrivateKey: MERCHANT_KEY,
//       issuer: "merchant.example",
//     }),
//     stopWhen: stepCountIs(8),
//   });
//
// Each tool returns a discriminated-union `{ ok: true, ... } | { ok: false, code, reason }`
// so agents can branch on outcome without parsing strings.

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import {
  verifyClosedCheckoutMandate,
  verifyClosedPaymentMandate,
  buildCheckoutReceipt,
  buildPaymentReceipt,
  decodeJwsUnverified,
  computeCheckoutHash,
  type JoseCryptoKey,
} from "./index";
import { verifyDsdJwtChain } from "./chain";
import { parseSdJwt } from "./sd-jwt";
import { Jwk, type Jwk as TJwk } from "./schemas/jwk";
import { CheckoutReceipt, PaymentReceipt } from "./schemas/receipts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type Ap2ToolName =
  | "verify_closed_checkout_mandate"
  | "verify_closed_payment_mandate"
  | "verify_dsd_jwt_chain"
  | "build_checkout_receipt"
  | "build_payment_receipt"
  | "compute_checkout_hash"
  | "inspect_mandate";

export interface Ap2ToolsOptions {
  /** Public JWK of the agent that signs closed mandates. */
  agentPublicJwk?: TJwk;
  /** Public JWK of the merchant — used to verify the inner `checkout_jwt`. */
  merchantPublicJwk?: TJwk;
  /** Public JWK of the root issuer (for chain verification). */
  rootIssuerPublicJwk?: TJwk;
  /** Merchant's private key — used to sign CheckoutReceipts. */
  merchantPrivateKey?: JoseCryptoKey;
  /** MPP's private key — used to sign PaymentReceipts. */
  mppPrivateKey?: JoseCryptoKey;
  /** Default issuer string for receipts (`iss` claim). */
  defaultIssuer?: string;
  /** Override agent-facing tool descriptions. */
  descriptions?: Partial<Record<Ap2ToolName, string>>;
}

// ---------------------------------------------------------------------------
// Default descriptions — written for LLM consumption per agents.md guidance
// ---------------------------------------------------------------------------

const DEFAULT_DESCRIPTIONS: Record<Ap2ToolName, string> = {
  verify_closed_checkout_mandate:
    "Verify a Closed Checkout Mandate (`vct: 'mandate.checkout.1'`) presented as a single-hop SD-JWT VC compact serialization. USE THIS WHEN: a merchant or facilitator has just received an AP2 closed checkout mandate from an agent on a real checkout flow and needs to confirm: (1) the inner `checkout_jwt` was signed by the merchant, (2) `checkout_hash` matches `base64url(sha-256(checkout_jwt))`, (3) the agent's signature matches the configured `agentPublicJwk`. Returns `{ok: true, sdHash, checkout, closed}` on success or `{ok: false, code, reason}` on failure. The `sdHash` is what you pass to `build_checkout_receipt`.",
  verify_closed_payment_mandate:
    "Verify a Closed Payment Mandate (`vct: 'mandate.payment.1'`) and assert that its `transaction_id` equals the `expectedTransactionId` you pass — typically the linked Closed Checkout Mandate's `checkout_hash`. USE THIS WHEN: a credential provider / MPP / bank rail has received an AP2 payment mandate and wants to authorize the payment. Returns `{ok: true, sdHash, closed}` on success — the `sdHash` is what you pass to `build_payment_receipt`.",
  verify_dsd_jwt_chain:
    "Verify a multi-hop dSD-JWT chain (root + intermediate hops + terminal hop, `~~`-separated). USE THIS WHEN: the mandate is from a Trusted Agent Provider model where root is signed by the provider, intermediate hops carry forward `cnf.jwk` PoP bindings, and the terminal hop is signed by the agent. Returns `{ok: true, hops, openMandates, closedMandate, terminalSdHash}` — every constraint of every open mandate must STILL be evaluated separately by the caller against the closed mandate.",
  build_checkout_receipt:
    "Sign and return a CheckoutReceipt JWT after a successful checkout. USE THIS WHEN: you've verified a closed checkout mandate and the merchant is ready to confirm. Pass `sdHash` (from `verify_closed_checkout_mandate`'s result) and `orderId`. Returns `{ok: true, jwt}` — the JWT is the receipt that the agent stores as evidence of the merchant's confirmation.",
  build_payment_receipt:
    "Sign and return a PaymentReceipt JWT after a successful payment. USE THIS WHEN: an MPP / network has authorized the payment. Pass `sdHash` (from `verify_closed_payment_mandate`), `paymentId` (your provider's payment id), and optional confirmation ids. Returns `{ok: true, jwt}`.",
  compute_checkout_hash:
    "Compute the canonical `checkout_hash` of an inner `checkout_jwt` per AP2 §A.1: `base64url(sha-256(checkout_jwt))`. USE THIS WHEN: you're issuing a closed checkout mandate and need to fill in `checkout_hash`, OR when you're independently double-checking a closed mandate's `checkout_hash` claim. Returns `{ok: true, checkoutHash}`.",
  inspect_mandate:
    "Decode an SD-JWT VC compact serialization WITHOUT verifying any signature. USE THIS WHEN: debugging a malformed mandate, displaying the mandate tree to a developer, or pre-flight inspecting before deciding which verification path to invoke. Returns `{ok: true, header, payload, disclosures, kbJwt}`. NEVER trust the result for authorization decisions — pair with one of the `verify_*` tools.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configError(message: string) {
  return { ok: false as const, code: "tool_misconfigured" as const, reason: message };
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function ap2Tools(options: Ap2ToolsOptions = {}): ToolSet {
  const desc = (name: Ap2ToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];

  return {
    verify_closed_checkout_mandate: tool({
      description: desc("verify_closed_checkout_mandate"),
      inputSchema: z.object({
        presentation: z
          .string()
          .min(1)
          .describe("Compact SD-JWT VC presentation of the Closed Checkout Mandate."),
      }),
      execute: async ({ presentation }) => {
        if (!options.agentPublicJwk || !options.merchantPublicJwk) {
          return configError(
            "verify_closed_checkout_mandate requires `agentPublicJwk` and `merchantPublicJwk` in ap2Tools options.",
          );
        }
        const result = await verifyClosedCheckoutMandate(presentation, {
          issuerKey: options.agentPublicJwk,
          checkoutJwtKey: options.merchantPublicJwk,
        });
        if (result.ok) {
          return {
            ok: true as const,
            sdHash: result.sdHash,
            checkout: result.mandate.checkout,
            closed: result.mandate.closed,
          };
        }
        return { ok: false as const, code: result.code, reason: result.reason };
      },
    }),

    verify_closed_payment_mandate: tool({
      description: desc("verify_closed_payment_mandate"),
      inputSchema: z.object({
        presentation: z.string().min(1),
        expectedTransactionId: z
          .string()
          .min(1)
          .describe(
            "Hex/base64url checkout_hash of the linked Closed Checkout Mandate. The closed payment mandate's `transaction_id` MUST equal this.",
          ),
      }),
      execute: async ({ presentation, expectedTransactionId }) => {
        if (!options.agentPublicJwk) {
          return configError(
            "verify_closed_payment_mandate requires `agentPublicJwk` in ap2Tools options.",
          );
        }
        const result = await verifyClosedPaymentMandate(presentation, {
          issuerKey: options.agentPublicJwk,
          expectedTransactionId,
        });
        if (result.ok) {
          return {
            ok: true as const,
            sdHash: result.sdHash,
            closed: result.mandate.closed,
          };
        }
        return { ok: false as const, code: result.code, reason: result.reason };
      },
    }),

    verify_dsd_jwt_chain: tool({
      description: desc("verify_dsd_jwt_chain"),
      inputSchema: z.object({
        presentation: z.string().min(1),
        expectedAudience: z.string().min(1),
        expectedNonce: z.string().min(1),
      }),
      execute: async ({ presentation, expectedAudience, expectedNonce }) => {
        if (!options.rootIssuerPublicJwk) {
          return configError(
            "verify_dsd_jwt_chain requires `rootIssuerPublicJwk` in ap2Tools options.",
          );
        }
        const result = await verifyDsdJwtChain(presentation, {
          rootIssuerKey: options.rootIssuerPublicJwk,
          expectedAudience,
          expectedNonce,
        });
        if (result.ok) {
          return {
            ok: true as const,
            terminalSdHash: result.terminalSdHash,
            hops: result.hops.map((h) => ({
              index: h.index,
              isTerminal: h.isTerminal,
              isIntermediate: h.isIntermediate,
              sdHash: h.sdHash,
            })),
            openMandates: result.openMandates,
            closedMandate: result.closedMandate,
          };
        }
        return { ok: false as const, code: result.code, reason: result.reason };
      },
    }),

    build_checkout_receipt: tool({
      description: desc("build_checkout_receipt"),
      inputSchema: z.object({
        sdHash: z.string().min(1),
        orderId: z.string().min(1),
        issuer: z.string().min(1).optional(),
        status: z.enum(["Success", "Error"]).optional(),
        error: z.string().optional(),
        errorDescription: z.string().optional(),
      }),
      execute: async ({ sdHash, orderId, issuer, status, error, errorDescription }) => {
        if (!options.merchantPrivateKey) {
          return configError(
            "build_checkout_receipt requires `merchantPrivateKey` in ap2Tools options.",
          );
        }
        const issuerStr = issuer ?? options.defaultIssuer;
        if (!issuerStr) {
          return configError(
            "build_checkout_receipt requires an `issuer` argument or `defaultIssuer` in ap2Tools options.",
          );
        }
        const receipt = CheckoutReceipt.parse({
          status: status ?? "Success",
          iss: issuerStr,
          iat: Math.floor(Date.now() / 1000),
          reference: sdHash,
          order_id: orderId,
          ...(error !== undefined ? { error } : {}),
          ...(errorDescription !== undefined ? { error_description: errorDescription } : {}),
        });
        const jwt = await buildCheckoutReceipt({
          receipt,
          signingKey: options.merchantPrivateKey,
        });
        return { ok: true as const, jwt };
      },
    }),

    build_payment_receipt: tool({
      description: desc("build_payment_receipt"),
      inputSchema: z.object({
        sdHash: z.string().min(1),
        paymentId: z.string().min(1),
        issuer: z.string().min(1).optional(),
        pspConfirmationId: z.string().optional(),
        networkConfirmationId: z.string().optional(),
        status: z.enum(["Success", "Error"]).optional(),
        error: z.string().optional(),
        errorDescription: z.string().optional(),
      }),
      execute: async (args) => {
        if (!options.mppPrivateKey) {
          return configError(
            "build_payment_receipt requires `mppPrivateKey` in ap2Tools options.",
          );
        }
        const issuerStr = args.issuer ?? options.defaultIssuer;
        if (!issuerStr) {
          return configError(
            "build_payment_receipt requires an `issuer` argument or `defaultIssuer` in ap2Tools options.",
          );
        }
        const receipt = PaymentReceipt.parse({
          status: args.status ?? "Success",
          iss: issuerStr,
          iat: Math.floor(Date.now() / 1000),
          reference: args.sdHash,
          payment_id: args.paymentId,
          ...(args.pspConfirmationId !== undefined
            ? { psp_confirmation_id: args.pspConfirmationId }
            : {}),
          ...(args.networkConfirmationId !== undefined
            ? { network_confirmation_id: args.networkConfirmationId }
            : {}),
          ...(args.error !== undefined ? { error: args.error } : {}),
          ...(args.errorDescription !== undefined
            ? { error_description: args.errorDescription }
            : {}),
        });
        const jwt = await buildPaymentReceipt({
          receipt,
          signingKey: options.mppPrivateKey,
        });
        return { ok: true as const, jwt };
      },
    }),

    compute_checkout_hash: tool({
      description: desc("compute_checkout_hash"),
      inputSchema: z.object({
        checkoutJwt: z
          .string()
          .min(1)
          .describe("Compact JWS of the merchant-signed inner checkout JWT."),
      }),
      execute: async ({ checkoutJwt }) => {
        const checkoutHash = await computeCheckoutHash(checkoutJwt);
        return { ok: true as const, checkoutHash };
      },
    }),

    inspect_mandate: tool({
      description: desc("inspect_mandate"),
      inputSchema: z.object({
        presentation: z.string().min(1),
      }),
      execute: async ({ presentation }) => {
        try {
          const parts = parseSdJwt(presentation);
          const decoded = decodeJwsUnverified(parts.issuerJwt);
          return {
            ok: true as const,
            header: decoded.protectedHeader,
            payload: decoded.payload,
            disclosureCount: parts.disclosures.length,
            disclosures: parts.disclosures,
            hasKbJwt: parts.kbJwt !== undefined,
          };
        } catch (err) {
          return {
            ok: false as const,
            code: "parse_failed" as const,
            reason: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// JWK helpers re-export — agents commonly need to validate JWKs they receive.
// ---------------------------------------------------------------------------

export { Jwk } from "./schemas/jwk";
export type { TJwk as Ap2Jwk };
