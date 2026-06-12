/**
 * Drop-in tool collection for Vercel AI SDK 6+. Pair with an Agent or
 * any caller of `tool()`.
 *
 * Usage:
 *   import { bindTools, HttpBindAdapter } from "@ar-agents/bind";
 *   const tools = bindTools({
 *     adapter: new HttpBindAdapter({
 *       username: process.env.BIND_USERNAME!,
 *       password: process.env.BIND_PASSWORD!,
 *     }),
 *     requireConfirmation: async (op, args) => myUi.confirm(op, args),
 *   });
 */
import { tool } from "ai";
import { z } from "zod";
import type { BindAdapter } from "./adapter";
import { UnconfiguredBindAdapter } from "./adapter";
import {
  bindTransferRequestSchema,
  bindDebinRequestSchema,
} from "./types";

export const ALL_TOOL_NAMES = [
  "bind_list_accounts",
  "bind_get_movements",
  "bind_get_cbu_owner",
  "bind_create_transfer",
  "bind_create_debin",
  "bind_get_echeqs",
] as const;

export type BindToolName = (typeof ALL_TOOL_NAMES)[number];

/**
 * Tool names that go through `requireConfirmation` when configured.
 * Mirrors the @ar-agents/mercadopago HITL gate pattern: a programmatic
 * human-in-the-loop check, in addition to the description-level nudges.
 */
export type GatedOperation = "bind_create_transfer";

const GATED_TOOL_NAMES: readonly GatedOperation[] = ["bind_create_transfer"];

export interface BindToolsOptions {
  /** The adapter that performs the actual operations. Defaults to the
   * structured-failing unconfigured one, so tests pass without network. */
  adapter?: BindAdapter;
  /** Optional override for the set of tools to expose. Useful when an
   * agent should be read-only (no transfers, no DEBIN). */
  include?: ReadonlyArray<BindToolName>;
  /**
   * Programmatic Human-In-The-Loop gate for irreversible / money-moving
   * operations. When set, every call to a gated tool first awaits this
   * callback; resolving `false` aborts the call and the tool returns
   * `{ ok: false, reason: "Confirmation declined" }` instead of moving
   * money. Bank transfers are IRREVERSIBLE once COMPLETED, so production
   * deployments should ALWAYS wire this to a real confirmation flow
   * (push notification, Slack approve button, in-app modal, etc.).
   *
   * The description-based HITL warnings still apply (they nudge the LLM
   * to confirm in-conversation), but those depend on the LLM's heuristic
   * obedience. This gate is deterministic.
   */
  requireConfirmation?: (
    operation: GatedOperation,
    args: Record<string, unknown>,
  ) => Promise<boolean> | boolean;
}

type ToolSet = Record<string, ReturnType<typeof tool>>;

export function bindTools(opts: BindToolsOptions = {}) {
  const adapter = opts.adapter ?? new UnconfiguredBindAdapter();
  const wanted = new Set<BindToolName>(opts.include ?? ALL_TOOL_NAMES);

  const allTools = {
    bind_list_accounts: tool({
      description:
        "List the BIND bank accounts (Banco Industrial / Banco de Valores BaaS) visible to the configured credentials. Returns account ids (format XX-X-XXXX-X-X), CBU, type, status, owners, and current balance in decimal pesos. Call this FIRST to obtain the account_id that every other bind_* tool needs.",
      inputSchema: z.object({}),
      execute: async () => adapter.listAccounts(),
    }),

    bind_get_movements: tool({
      description:
        "Get the movements (transactions) of a BIND bank account: credits, debits, transfers received, DEBIN settlements. Use for reconciliation, statements, or matching an incoming transfer to an invoice. Paginated via limit/offset.",
      inputSchema: z.object({
        accountId: z
          .string()
          .describe("BIND account id, format XX-X-XXXX-X-X (from bind_list_accounts)."),
        fromDate: z
          .string()
          .optional()
          .describe("ISO date lower bound, e.g. 2026-01-01."),
        toDate: z.string().optional().describe("ISO date upper bound."),
        limit: z.number().int().min(1).max(100).optional().describe("Page size."),
        offset: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Page number, 1-based."),
      }),
      execute: async (input) => adapter.getMovements(input),
    }),

    bind_get_cbu_owner: tool({
      description:
        "Check who owns a CBU, CVU, or alias BEFORE paying. Returns the owner name + CUIT, account type, currency, and bank. ALWAYS call this before bind_create_transfer to a new destination, restate the owner name to the user, and only transfer after they confirm it matches the intended payee. Pass exactly one of cbuCvu or alias.",
      inputSchema: z.object({
        cbuCvu: z
          .string()
          .regex(/^[0-9]{22}$/, "Must be 22 numeric digits")
          .optional()
          .describe("22-digit CBU or CVU to look up."),
        alias: z.string().optional().describe("Alias CBU to look up."),
      }),
      execute: async (input) => adapter.getCbuOwner(input),
    }),

    bind_create_transfer: tool({
      description:
        "Transfer pesos from a BIND bank account to any CBU, CVU, or alias (immediate transfer). IRREVERSIBLE once status is COMPLETED: there is no undo on interbank transfers. Before calling: (1) verify the destination with bind_get_cbu_owner, (2) restate destination owner + amount to the user and get an explicit 'si, transferi' (or equivalent). Amounts are in DECIMAL PESOS (10.5 = ARS 10,50), never centavos. origin_id is your idempotency key: reuse it on retries to avoid double-paying.",
      inputSchema: z.object({
        accountId: z
          .string()
          .describe("Source (debit) BIND account id, format XX-X-XXXX-X-X."),
        request: bindTransferRequestSchema.describe(
          "The transfer request: origin_id, destination (to.cbu or to.label), value, concept.",
        ),
      }),
      execute: async ({ accountId, request }) =>
        adapter.createTransfer(accountId, request),
    }),

    bind_create_debin: tool({
      description:
        "Create a DEBIN request to pull pesos FROM a buyer's account INTO the BIND account (the buyer must approve it in their bank within the expiration window). Use for collections: the money only moves if the counterparty accepts, so this is safer than asking them to transfer manually. Not a transfer out: no funds leave the BIND account.",
      inputSchema: z.object({
        accountId: z
          .string()
          .describe("Destination (credit) BIND account id that will receive the funds."),
        request: bindDebinRequestSchema.describe(
          "The DEBIN request: origin_id, buyer (to.cbu or to.label), value, concept, expiration minutes.",
        ),
      }),
      execute: async ({ accountId, request }) =>
        adapter.createDebin(accountId, request),
    }),

    bind_get_echeqs: tool({
      description:
        "List echeqs (electronic checks) for a BIND account, filtered by status (e.g. ACTIVE, ACCREDIT, CUSTODY, REJECTED) and perspective (ISSUER = checks the account issued, RECEIVER = checks it received). Returns issuer/payee CUITs, amounts, payment dates, and the possible_actions each echeq supports (DEPOSIT, ENDORSE, etc.).",
      inputSchema: z.object({
        accountId: z
          .string()
          .describe("BIND account id, format XX-X-XXXX-X-X."),
        status: z
          .string()
          .describe("Echeq status filter, required by BIND. e.g. ACTIVE, ACCREDIT, CUSTODY, REJECTED."),
        mode: z
          .string()
          .optional()
          .describe("ISSUER or RECEIVER perspective."),
        limit: z.number().int().min(5).max(20).optional().describe("Page size, 5 to 20."),
        offset: z.number().int().min(1).optional().describe("Page number, 1-based."),
        issuedFromDate: z.string().optional().describe("Issue date lower bound, ISO."),
        issuedToDate: z.string().optional().describe("Issue date upper bound, ISO."),
      }),
      execute: async (input) => adapter.getEcheqs(input),
    }),
  } as const;

  const filtered: Record<string, (typeof allTools)[BindToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) filtered[name] = allTools[name];
  }
  const built = filtered as Pick<typeof allTools, BindToolName>;
  return opts.requireConfirmation
    ? (applyConfirmationGate(
        built as unknown as ToolSet,
        opts.requireConfirmation,
      ) as unknown as Pick<typeof allTools, BindToolName>)
    : built;
}

function applyConfirmationGate(
  tools: ToolSet,
  requireConfirmation: NonNullable<BindToolsOptions["requireConfirmation"]>,
): ToolSet {
  const wrapped: ToolSet = { ...tools };
  for (const name of GATED_TOOL_NAMES) {
    const original = tools[name];
    if (!original) continue;
    const originalExecute = (
      original as unknown as {
        execute: (i: unknown, c: unknown) => Promise<unknown>;
      }
    ).execute;
    wrapped[name] = {
      ...original,
      execute: async (input: unknown, ctx: unknown) => {
        const args = (input ?? {}) as Record<string, unknown>;
        const approved = await requireConfirmation(name, args);
        if (!approved) {
          return {
            ok: false,
            reason: "Confirmation declined by requireConfirmation gate.",
            operation: name,
            args,
          };
        }
        // Original execute keeps its own typing; we cast inputs/ctx to
        // unknown for the wrapper layer because tool() generics aren't
        // preserved through the ToolSet container.
        return await originalExecute(input, ctx);
      },
    } as unknown as ToolSet[string];
  }
  return wrapped;
}
