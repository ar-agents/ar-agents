/**
 * Unit tests for ROADMAP.md M2-4d's owner top-up composition helper:
 * observing a society wallet's on-chain USDC balance and reconciling it
 * into a caller-supplied `TreasuryState`, no live CDP credentials needed.
 */

import { describe, expect, it, vi } from "vitest";
import { ZERO_STATE, type TreasuryState } from "@ar-agents/treasury";
import type { CdpAccountLike, CdpListTokenBalancesResult } from "@ar-agents/wallet-cdp";
import { reconcileOwnerTopUp } from "../src/lib/owner-topup";

const USDC_BASE_SEPOLIA = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";

function mockAccount(usdcAtomic: bigint): CdpAccountLike {
  return {
    address: "0x000000000000000000000000000000000000AA",
    transfer: vi.fn(),
    listTokenBalances: vi.fn().mockResolvedValue({
      balances: [{ token: { contractAddress: USDC_BASE_SEPOLIA }, amount: { amount: usdcAtomic, decimals: 6 } }],
    } satisfies CdpListTokenBalancesResult),
  };
}

describe("reconcileOwnerTopUp", () => {
  it("reports the delta as a top-up when observed USDC exceeds knownState.usd", async () => {
    const knownState: TreasuryState = { ...ZERO_STATE, usd: 10 };
    const account = mockAccount(BigInt(50_000_000)); // 50 USDC

    const result = await reconcileOwnerTopUp({ account, knownState });

    expect(result.toppedUpUsd).toBe(40);
    expect(result.state.usd).toBe(50);
    expect(result.observed.amountUsd).toBe(50);
    expect(result.auditSummary).toBeDefined();
    expect(result.auditSummary).toContain("recibido");
  });

  it("is a no-op when observed balance equals knownState.usd", async () => {
    const knownState: TreasuryState = { ...ZERO_STATE, usd: 25 };
    const account = mockAccount(BigInt(25_000_000)); // 25 USDC

    const result = await reconcileOwnerTopUp({ account, knownState });

    expect(result.toppedUpUsd).toBe(0);
    expect(result.state).toEqual(knownState);
    expect(result.auditSummary).toBeUndefined();
  });
});
