/**
 * On-chain USDC balance read for a society's CDP wallet (ROADMAP.md M2-4d:
 * "v0 owner top-up flow"). The owner funds a society by sending USDC directly
 * to its CDP account address from their OWN external wallet -- this module's
 * job is only to read the resulting on-chain balance back, so the host can
 * reconcile it into `@ar-agents/treasury`'s `TreasuryState` and log it. It
 * does not move money and does not know who the sender is; a direct transfer
 * carries no memo the recipient side can read.
 */

import { ArAgentsUnconfiguredError, ArAgentsValidationError } from "@ar-agents/core";
import { classifyCdpError } from "./errors";
import type { CdpAccountLike } from "./wallet";

/**
 * Canonical Circle USDC contract addresses, lowercased for case-insensitive
 * matching against whatever casing `listTokenBalances` returns.
 */
export const USDC_CONTRACT_BY_NETWORK: Record<string, string> = {
  base: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "base-sepolia": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
};

export interface UsdcBalance {
  network: string;
  contractAddress: string;
  /** Summed atomic base units (USDC: 6 decimals) as a decimal string. */
  amountAtomic: string;
  decimals: number;
  /** amountAtomic / 10^decimals, as a convenience view. */
  amountUsd: number;
}

/**
 * Read the account's current USDC balance on `network` (default
 * "base-sepolia", same default as `transferUsdc`). Paginates
 * `account.listTokenBalances` (capped at `opts.maxPages`, default 20, as a
 * defensive bound against a runaway paginator) and sums every entry whose
 * token contract matches USDC on that network. No matching entry means the
 * account holds no USDC -- returns a zero balance, not an error.
 */
export async function getUsdcBalance(
  account: CdpAccountLike,
  opts?: { network?: string; usdcContract?: string; maxPages?: number },
): Promise<UsdcBalance> {
  const network = opts?.network ?? "base-sepolia";
  const usdc = (opts?.usdcContract ?? USDC_CONTRACT_BY_NETWORK[network])?.toLowerCase();
  if (!usdc) {
    throw new ArAgentsValidationError(
      "network",
      `no known USDC contract for network "${network}"; pass opts.usdcContract`,
    );
  }
  if (typeof account.listTokenBalances !== "function") {
    throw new ArAgentsUnconfiguredError("wallet-cdp", "account does not support balance reads", {});
  }

  const maxPages = opts?.maxPages ?? 20;
  let total = 0n;
  let decimals: number | undefined;
  let pageToken: string | undefined;
  let pages = 0;

  try {
    do {
      const page = await account.listTokenBalances({
        network,
        ...(pageToken !== undefined ? { pageToken } : {}),
      });
      for (const balance of page.balances) {
        if (balance.token.contractAddress.toLowerCase() === usdc) {
          total += balance.amount.amount;
          decimals = balance.amount.decimals;
        }
      }
      pageToken = page.nextPageToken;
      pages += 1;
    } while (pageToken && pages < maxPages);
  } catch (err) {
    throw classifyCdpError(err, "getUsdcBalance");
  }

  const resolvedDecimals = decimals ?? 6;
  return {
    network,
    contractAddress: usdc,
    amountAtomic: total.toString(),
    decimals: resolvedDecimals,
    amountUsd: Number(total) / 10 ** resolvedDecimals,
  };
}
