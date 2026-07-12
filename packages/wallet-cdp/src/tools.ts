/**
 * @ar-agents/wallet-cdp/tools -- Vercel AI SDK 6 tool wrapper for the society
 * USDC wallet's guarded transfer. One tool:
 *
 *   wallet_transfer_usdc  EXECUTE a USDC transfer -- two-layer gated, IRREVERSIBLE
 *
 * The tool NAME matters: `@ar-agents/core`'s risk manifest classifies any
 * name matching "transfer" as `"money"` risk, so a host composing this into
 * `enforceRiskPolicy` (the way apps/sociedad-ia-starter/src/lib/agent.ts
 * composes every other package's tools) gets the CATEGORICAL art. 102 gate
 * for free, in addition to this package's own AMOUNT-based threshold gate
 * inside `guardedTransferUsdc`. The two are complementary, not redundant:
 * `enforceRiskPolicy` gates the tool call itself (every call needs approval,
 * any amount); `guardedTransferUsdc`'s threshold decides whether ITS OWN
 * internal approvals-gate consultation fires for THIS amount. A host that
 * wants art. 102's blanket per-call approval AND this package's per-amount
 * design should still wire this tool through `enforceRiskPolicy` -- the two
 * checks agree in spirit (both fail closed toward "ask a human") and the
 * amount threshold here is about UX (do not queue every $0.01 nudge), not a
 * bypass of art. 102.
 *
 * This entry point needs the `ai` + `zod` peers; the main entry does not.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { type ApproveFn, type GuardedTransferUsdcResult, guardedTransferUsdc } from "./guard";
import type { CdpAccountLike, TransferReceipt } from "./wallet";
import { checkBalanceAndDetectTopUp, InMemoryLastBalanceStore, type LastBalanceStore } from "./balance";

export interface WalletCdpToolsOptions {
  /** The society's CDP account. Omit to expose the tool in a degraded, always-`available:false` state. */
  account?: CdpAccountLike;
  /** Threshold (atomic USDC units) at/above which the approvals gate is consulted. */
  thresholdAtomic: string;
  /** The approvals-gate hook (e.g. governance.ts's `approve`). */
  approve: ApproveFn;
  network?: string;
  /** Idempotency store for `wallet_transfer_usdc` (keyed by idempotencyKey). */
  store?: Map<string, TransferReceipt>;
  /**
   * Durable last-balance store for `wallet_check_balance`'s v0 top-up
   * detection (ROADMAP.md M2-4d). Defaults to a fresh in-memory store, which
   * is USELESS across serverless invocations (see ./balance.ts) -- a real
   * host should inject a durable adapter (e.g. Vercel KV) here, the same way
   * it already must for `store` above.
   */
  balanceStore?: LastBalanceStore;
  /** Key this society's balance history is namespaced under (e.g. its
   *  `SOCIETY_ID`). Default "default" -- fine for a single-society dev
   *  checkout, but a host serving more than one society under one store
   *  MUST pass a distinct key per society. */
  balanceKey?: string;
}

/** sideEffects classification for the host's `enforceRiskPolicy` `sideEffectsFor` hook. */
export const WALLET_CDP_TOOL_SIDE_EFFECTS: Record<string, string> = {
  wallet_transfer_usdc: "moves money",
  wallet_check_balance: "network read",
};

/** Pass as enforceRiskPolicy's `sideEffectsFor` so this package's tool classifies right. */
export function walletCdpSideEffectsFor(toolName: string): string | undefined {
  return WALLET_CDP_TOOL_SIDE_EFFECTS[toolName];
}

export function walletCdpTools(options: WalletCdpToolsOptions): ToolSet {
  return {
    wallet_transfer_usdc: tool({
      description:
        "EXECUTE a USDC transfer from the society's CDP wallet (Base). IRREVERSIBLE -- moves real " +
        "money. Two independent layers can block this: (1) above the configured threshold, an " +
        "ar-agents human-approval decision is required first -- if not yet approved this returns " +
        "{available:true, status:'deferred'} and the provider is NEVER called, retry on a later run " +
        "once a human approves; (2) Coinbase CDP's own server-side spend policy (recipient allowlist " +
        "+ per-tx cap, native ETH denied) is evaluated by the provider before signing and can reject " +
        "the transfer even after (1) approves. Returns {available:false} if no wallet is configured.",
      inputSchema: z.object({
        to: z.string().describe("Recipient EVM address (0x...)."),
        amountAtomic: z.string().describe("Amount in USDC atomic base units (6 decimals; \"1000000\" == 1.0 USDC)."),
        idempotencyKey: z
          .string()
          .min(1)
          .describe("Stable id for THIS operation -- reuse the SAME key on any retry so it is never double-sent."),
      }),
      execute: async ({ to, amountAtomic, idempotencyKey }) => {
        if (!options.account) {
          return { available: false as const, reason: "No CDP wallet configured for this society." };
        }
        const result: GuardedTransferUsdcResult = await guardedTransferUsdc({
          account: options.account,
          to,
          amountAtomic,
          idempotencyKey,
          thresholdAtomic: options.thresholdAtomic,
          approve: options.approve,
          ...(options.network !== undefined ? { network: options.network } : {}),
          ...(options.store !== undefined ? { store: options.store } : {}),
        });
        return { available: true as const, ...result };
      },
    }),

    wallet_check_balance: tool({
      description:
        "Read the society's current USDC balance on Base and report whether it went UP since the " +
        "last check (a 'deposit detected' signal -- e.g. the owner sent a manual top-up). Read-only, " +
        "no side effects, always safe to call. v0 LIMITATION: this is an AGGREGATE delta between two " +
        "checks, not per-transaction attribution -- if several deposits land between checks they show " +
        "as one combined increase, and there is no chain-scanning or historical replay. Returns " +
        "{available:false} if no wallet is configured.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!options.account) {
          return { available: false as const, reason: "No CDP wallet configured for this society." };
        }
        const result = await checkBalanceAndDetectTopUp({
          account: options.account,
          ...(options.network !== undefined ? { network: options.network } : {}),
          store: options.balanceStore ?? new InMemoryLastBalanceStore(),
          key: options.balanceKey ?? "default",
        });
        return {
          available: true as const,
          asset: "USDC" as const,
          decimals: 6,
          address: options.account.address,
          network: options.network ?? "base-sepolia",
          ...result,
          depositDetected: result.direction === "increase" && !result.firstCheck,
        };
      },
    }),
  };
}
