/**
 * Drop-in tool collection for Vercel AI SDK 6+. Pair with an Agent or
 * any caller of `tool()`.
 *
 * Usage:
 *   import { x402Tools } from "@ar-agents/x402";
 *   const tools = x402Tools({
 *     signer: myViemSigner,           // wallet stays outside this package
 *     onPayment: async (req) => askHuman(req),  // HITL gate (recommended)
 *   });
 *
 * Without a signer, `x402_paid_fetch` returns a structured
 * { ok: false, code: "unconfigured" } result instead of throwing, so an
 * agent can explain the situation to the operator.
 */
import { tool } from "ai";
import { z } from "zod";
import {
  x402Fetch,
  probePaymentRequirements,
  FacilitatorClient,
} from "./client";
import { X402Error } from "./errors";
import {
  paymentPayloadSchema,
  paymentRequirementsSchema,
  type PaymentRequirements,
  type X402Signer,
} from "./types";

export const ALL_TOOL_NAMES = [
  "x402_get_payment_requirements",
  "x402_paid_fetch",
  "x402_verify_payment",
] as const;

export type X402ToolName = (typeof ALL_TOOL_NAMES)[number];

export interface X402ToolsOptions {
  /**
   * The signer that produces PaymentPayloads (viem / CDP / custom).
   * Omit it and `x402_paid_fetch` reports `unconfigured` gracefully;
   * the probe + verify tools still work without it.
   */
  signer?: X402Signer;
  /**
   * Programmatic Human-In-The-Loop gate, mirroring mercadopago's
   * `requireConfirmation` pattern: called BEFORE any money moves with the
   * exact requirements about to be paid. Return false to reject (the tool
   * returns { ok: false, reason: "Confirmation declined" } instead of
   * paying). Tool descriptions nudge the LLM to confirm in-conversation,
   * but only this callback is real out-of-band enforcement, immune to
   * prompt injection. If omitted, description-based HITL is the only line
   * of defense; fine for trusted agents with capped wallets, NOT for
   * agents reading untrusted input.
   */
  onPayment?: (requirements: PaymentRequirements) => Promise<boolean>;
  /**
   * Facilitator for the seller-side `x402_verify_payment` tool.
   * e.g. new FacilitatorClient({ baseUrl: "https://x402.org/facilitator" })
   */
  facilitator?: FacilitatorClient;
  /** Restrict the exposed tool set (e.g. probe-only agents). */
  include?: ReadonlyArray<X402ToolName>;
  /** fetch implementation override (tests). */
  fetch?: typeof globalThis.fetch;
}

/** Serialize any error into a structured tool result (never throw raw). */
function errorResult(err: unknown): {
  ok: false;
  code: string;
  reason: string;
} {
  if (err instanceof X402Error) {
    return { ok: false, code: err.code ?? "error", reason: err.message };
  }
  return {
    ok: false,
    code: "error",
    reason: err instanceof Error ? err.message : String(err),
  };
}

export function x402Tools(opts: X402ToolsOptions = {}) {
  const wanted = new Set<X402ToolName>(opts.include ?? ALL_TOOL_NAMES);
  const fetchImpl = opts.fetch ?? globalThis.fetch;

  const allTools = {
    x402_get_payment_requirements: tool({
      description:
        "Probe x402 payment requirements for a URL without paying. Sends the request and, if the server answers HTTP 402, returns the parsed list of acceptable payment methods (scheme, network, amount in atomic units, asset contract, payTo address, description). Use BEFORE x402_paid_fetch to show the user what a resource costs. Free and safe: never signs, never moves money.",
      inputSchema: z.object({
        url: z.string().url().describe("The resource URL to probe."),
        method: z
          .enum(["GET", "POST", "HEAD"])
          .optional()
          .describe("HTTP method to probe with. Default GET."),
      }),
      execute: async ({ url, method }) => {
        try {
          const body = await probePaymentRequirements(
            url,
            { method: method ?? "GET" },
            fetchImpl,
          );
          if (body === null) {
            return {
              ok: true as const,
              paymentRequired: false as const,
              note: "Resource did not return HTTP 402; no payment needed.",
            };
          }
          return {
            ok: true as const,
            paymentRequired: true as const,
            x402Version: body.x402Version,
            error: body.error,
            accepts: body.accepts,
          };
        } catch (err) {
          return errorResult(err);
        }
      },
    }),

    x402_paid_fetch: tool({
      description:
        "Pay for an HTTP 402 resource and fetch it (x402 protocol). Performs the full flow: request, parse 402 requirements, sign payment via the configured wallet signer, retry with the X-PAYMENT header, return the body + on-chain settlement receipt (tx hash, network, payer). MOVES MONEY (crypto, irreversible once settled). Confirm the amount, asset, and payTo with the user BEFORE calling; probe first with x402_get_payment_requirements. Returns { ok: false, code: 'unconfigured' } when no signer is wired.",
      inputSchema: z.object({
        url: z.string().url().describe("The paid resource URL to fetch."),
        method: z
          .enum(["GET", "POST"])
          .optional()
          .describe("HTTP method. Default GET."),
        body: z
          .string()
          .optional()
          .describe("Request body (e.g. JSON string) for POST requests."),
        contentType: z
          .string()
          .optional()
          .describe("Content-Type for the request body, e.g. application/json."),
      }),
      execute: async ({ url, method, body, contentType }) => {
        if (!opts.signer) {
          return {
            ok: false as const,
            code: "unconfigured" as const,
            reason:
              "No x402 signer is configured. Wire a signer (e.g. viem or CDP based) into x402Tools({ signer }) to enable payments. You can still probe costs with x402_get_payment_requirements.",
          };
        }
        try {
          const init: RequestInit = {
            method: method ?? "GET",
            ...(body !== undefined ? { body } : {}),
            ...(contentType !== undefined
              ? { headers: { "content-type": contentType } }
              : {}),
          };
          const result = await x402Fetch(url, init, {
            signer: opts.signer,
            fetch: fetchImpl,
            ...(opts.onPayment
              ? {
                  onPayment: async (req: PaymentRequirements) => {
                    return opts.onPayment!(req);
                  },
                }
              : {}),
          });
          const text = await result.response.text();
          return {
            ok: true as const,
            status: result.response.status,
            paid: result.paid,
            body: text,
            ...(result.requirements !== undefined
              ? { requirements: result.requirements }
              : {}),
            ...(result.settlement !== undefined
              ? { settlement: result.settlement }
              : {}),
          };
        } catch (err) {
          const res = errorResult(err);
          if (res.code === "payment_rejected" && opts.onPayment) {
            // Normalize the declined-gate case to mercadopago's wording.
            if (res.reason.includes("onPayment confirmation gate")) {
              return {
                ok: false as const,
                code: "payment_rejected",
                reason: "Confirmation declined",
              };
            }
          }
          return res;
        }
      },
    }),

    x402_verify_payment: tool({
      description:
        "Verify an x402 payment authorization as a SELLER, via the facilitator's POST /verify. Pass the decoded PaymentPayload (from the buyer's X-PAYMENT header) and the PaymentRequirements you advertised; returns { isValid, invalidReason?, payer? }. Off-chain check only: does NOT settle or move money. Use before doing paid work; settle afterwards with settleAndRespond in your route handler. Requires a facilitator configured in x402Tools({ facilitator }).",
      inputSchema: z.object({
        paymentPayload: paymentPayloadSchema.describe(
          "The decoded PaymentPayload from the buyer's X-PAYMENT header.",
        ),
        paymentRequirements: paymentRequirementsSchema.describe(
          "The PaymentRequirements your 402 response advertised.",
        ),
      }),
      execute: async ({ paymentPayload, paymentRequirements }) => {
        if (!opts.facilitator) {
          return {
            ok: false as const,
            code: "unconfigured" as const,
            reason:
              "No facilitator is configured. Pass x402Tools({ facilitator: new FacilitatorClient({ baseUrl }) }) to enable seller-side verification.",
          };
        }
        try {
          const verify = await opts.facilitator.verify(
            paymentPayload,
            paymentRequirements,
          );
          return { ok: true as const, ...verify };
        } catch (err) {
          return errorResult(err);
        }
      },
    }),
  } as const;

  const out: Record<string, (typeof allTools)[X402ToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) out[name] = allTools[name];
  }
  return out as Pick<typeof allTools, X402ToolName>;
}
