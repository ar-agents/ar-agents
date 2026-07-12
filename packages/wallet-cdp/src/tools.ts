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

export interface WalletCdpToolsOptions {
  /** The society's CDP account. Omit to expose the tool in a degraded, always-`available:false` state. */
  account?: CdpAccountLike;
  /** Threshold (atomic USDC units) at/above which the approvals gate is consulted. */
  thresholdAtomic: string;
  /** The approvals-gate hook (e.g. governance.ts's `approve`). */
  approve: ApproveFn;
  network?: string;
  store?: Map<string, TransferReceipt>;
}

/** sideEffects classification for the host's `enforceRiskPolicy` `sideEffectsFor` hook. */
export const WALLET_CDP_TOOL_SIDE_EFFECTS: Record<string, string> = {
  wallet_transfer_usdc: "moves money",
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
  };
}
