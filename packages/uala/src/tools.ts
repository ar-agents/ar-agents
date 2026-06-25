/**
 * Drop-in tool collection for Vercel AI SDK 6+. Pair with an Agent or
 * any caller of `tool()`. Schema authoring is conservative, every input
 * has an explicit zod description so the model can pick the right tool
 * without guessing what each parameter means.
 *
 * Usage:
 *   import { ualaTools, UalaApiAdapter } from "@ar-agents/uala";
 *   const tools = ualaTools({
 *     adapter: new UalaApiAdapter({ apiKey: process.env.UALA_API_KEY! }),
 *   });
 *   const agent = new Experimental_Agent({ model, tools });
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { UalaAdapter } from "./adapter";
import { UnconfiguredUalaAdapter } from "./adapter";

export interface UalaToolsOptions {
  /** The adapter that performs the actual operations. Defaults to the
   * unconfigured throwing one so tests pass without network. */
  adapter?: UalaAdapter;
  /** Optional override for the set of tools to expose. Useful when an
   * agent should only have read-only access (no payouts, no cancels). */
  include?: ReadonlyArray<UalaToolName>;
}

export const ALL_TOOL_NAMES = [
  "uala_create_payment_link",
  "uala_get_payment_link",
  "uala_cancel_payment_link",
  "uala_list_transactions",
  "uala_get_transaction",
  "uala_get_balance",
  "uala_create_payout",
  "uala_get_payout",
] as const;

export type UalaToolName = (typeof ALL_TOOL_NAMES)[number];

const currencySchema = z.enum(["ARS", "USD"]);

export function ualaTools(opts: UalaToolsOptions = {}): ToolSet {
  const adapter = opts.adapter ?? new UnconfiguredUalaAdapter();
  const wanted = new Set<UalaToolName>(opts.include ?? ALL_TOOL_NAMES);

  const allTools = {
    uala_create_payment_link: tool({
      description:
        "Create a Ualá payment link (crear link de pago, cobrar con Ualá) the payer can complete on the web or via the Ualá app. Returns shareUrl + optional QR. Use for billing flows where the customer is not in-person. Idempotency-key honored: same key + same amount returns the original link.",
      inputSchema: z.object({
        amount: z
          .number()
          .int()
          .positive()
          .describe(
            "Amount in centavos (ARS) or cents (USD). e.g. 100000 = ARS 1.000.",
          ),
        currency: currencySchema
          .optional()
          .describe("ARS (default) or USD. Most AR flows use ARS."),
        description: z
          .string()
          .max(200)
          .optional()
          .describe(
            "Short description the payer sees on the payment page. Max 200 chars.",
          ),
        externalReference: z
          .string()
          .max(64)
          .optional()
          .describe(
            "Your own invoice / order id. Echoed back in webhooks and transactions.",
          ),
        expiresInMinutes: z
          .number()
          .int()
          .positive()
          .max(60 * 24 * 14) // 14 days
          .optional()
          .describe(
            "Minutes until the link expires. Omit for no expiry. Max 14 days.",
          ),
        idempotencyKey: z
          .string()
          .min(8)
          .max(128)
          .optional()
          .describe(
            "Idempotency key. Reposting with the same key + same payload returns the original link.",
          ),
      }),
      execute: async (input) => adapter.createPaymentLink(input),
    }),

    uala_get_payment_link: tool({
      description:
        "Check a Ualá payment link's status (consultar estado de un link de pago) (status, paid amount, payer info if any). Use to poll a link's status if you don't yet have the webhook wired.",
      inputSchema: z.object({
        id: z.string().describe("The payment link id returned at creation."),
      }),
      execute: async ({ id }) => adapter.getPaymentLink(id),
    }),

    uala_cancel_payment_link: tool({
      description:
        "Cancel an open Ualá payment link (cancelar un link de pago) so it can no longer be paid. Idempotent: cancelling an already-cancelled link is a no-op. Cannot un-cancel; create a new link instead.",
      inputSchema: z.object({
        id: z.string().describe("The payment link id to revoke."),
      }),
      execute: async ({ id }) => adapter.cancelPaymentLink(id),
    }),

    uala_list_transactions: tool({
      description:
        "List Ualá account transactions (movimientos de la cuenta) in chronological order. Returns up to `limit` items + a `nextCursor` for paging. Use for reconciliation, agent-summarized statements, or matching incoming credits to invoices.",
      inputSchema: z.object({
        fromIso: z
          .string()
          .optional()
          .describe(
            "ISO-8601 lower bound, inclusive. Omit for all history (capped by Ualá retention).",
          ),
        toIso: z
          .string()
          .optional()
          .describe("ISO-8601 upper bound, inclusive. Omit for now."),
        kind: z
          .enum(["credit", "debit"])
          .optional()
          .describe("Filter by credit (incoming) or debit (outgoing) only."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Page size. Default 25, max 100."),
        cursor: z
          .string()
          .optional()
          .describe("Opaque cursor from a previous page's `nextCursor`."),
      }),
      execute: async (input) => adapter.listTransactions(input),
    }),

    uala_get_transaction: tool({
      description:
        "Fetch a single transaction by id. Use when you need full details (e.g. the externalReference or counterpart CUIT) that the list view trimmed.",
      inputSchema: z.object({
        id: z.string().describe("The transaction id."),
      }),
      execute: async ({ id }) => adapter.getTransaction(id),
    }),

    uala_get_balance: tool({
      description:
        "Get the current Ualá balance (consultar saldo): available + pending. Useful before initiating a payout to verify funds. Pass `currency` to query USD vs ARS independently.",
      inputSchema: z.object({
        currency: currencySchema
          .optional()
          .describe("ARS (default) or USD. Omit to get the primary currency."),
      }),
      execute: async ({ currency }) => adapter.getBalance(currency),
    }),

    uala_create_payout: tool({
      description:
        "Send money from the Ualá account to a CBU (transferir dinero, hacer un payout). Status starts at `pending` and resolves to `paid` or `rejected`. IRREVERSIBLE once `paid`, agents calling this MUST gate with explicit user confirmation in the host UI.",
      inputSchema: z.object({
        amount: z
          .number()
          .int()
          .positive()
          .describe("Amount in centavos (ARS) or cents (USD)."),
        currency: currencySchema
          .optional()
          .describe("ARS (default) or USD."),
        destinationCbu: z
          .string()
          .regex(/^[0-9]{22}$/, "Must be a 22-digit CBU")
          .describe("Beneficiary CBU. 22 numeric digits."),
        reference: z
          .string()
          .max(120)
          .optional()
          .describe(
            "Short memo visible to both sides of the transfer. Max 120 chars.",
          ),
        idempotencyKey: z
          .string()
          .min(8)
          .max(128)
          .optional()
          .describe(
            "Idempotency key. Reposting with the same key + same payload returns the original payout instead of double-paying.",
          ),
      }),
      execute: async (input) => adapter.createPayout(input),
    }),

    uala_get_payout: tool({
      description:
        "Fetch the current state of a previously-created payout (status, paidAt, rejectionReason). Use to poll payout completion when you don't yet have a webhook wired.",
      inputSchema: z.object({
        id: z.string().describe("The payout id returned at creation."),
      }),
      execute: async ({ id }) => adapter.getPayout(id),
    }),
  } as const;

  const out: Record<string, (typeof allTools)[UalaToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) out[name] = allTools[name];
  }
  return out as Pick<typeof allTools, UalaToolName>;
}
