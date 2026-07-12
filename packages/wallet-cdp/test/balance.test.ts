import { describe, expect, it, vi } from "vitest";
import { ArAgentsUnconfiguredError, ArAgentsValidationError } from "@ar-agents/core";
import { getUsdcBalance, USDC_CONTRACT_BY_NETWORK } from "../src/balance";
import { WalletCdpUpstreamError } from "../src/errors";
import type { CdpAccountLike, CdpListTokenBalancesResult } from "../src/wallet";

const USDC_BASE_SEPOLIA = USDC_CONTRACT_BY_NETWORK["base-sepolia"]!;

function mockAccount(overrides: Partial<CdpAccountLike> = {}): CdpAccountLike & {
  listTokenBalances: ReturnType<typeof vi.fn>;
} {
  return {
    address: "0x000000000000000000000000000000000000AA",
    transfer: vi.fn(),
    listTokenBalances: vi.fn(),
    ...overrides,
  } as CdpAccountLike & { listTokenBalances: ReturnType<typeof vi.fn> };
}

describe("getUsdcBalance", () => {
  it("sums the USDC balance matched case-insensitively by contract on base-sepolia default", async () => {
    const account = mockAccount();
    account.listTokenBalances.mockResolvedValue({
      balances: [
        {
          token: { contractAddress: USDC_BASE_SEPOLIA.toUpperCase(), symbol: "USDC" },
          amount: { amount: 1_500_000n, decimals: 6 },
        },
      ],
    } satisfies CdpListTokenBalancesResult);

    const balance = await getUsdcBalance(account);
    expect(balance.network).toBe("base-sepolia");
    expect(balance.contractAddress).toBe(USDC_BASE_SEPOLIA);
    expect(balance.amountAtomic).toBe("1500000");
    expect(balance.decimals).toBe(6);
    expect(balance.amountUsd).toBeCloseTo(1.5, 6);
  });

  it("ignores non-USDC tokens", async () => {
    const account = mockAccount();
    account.listTokenBalances.mockResolvedValue({
      balances: [
        {
          token: { contractAddress: "0xnotusdc0000000000000000000000000000000", symbol: "WETH" },
          amount: { amount: 999_999n, decimals: 18 },
        },
      ],
    } satisfies CdpListTokenBalancesResult);

    const balance = await getUsdcBalance(account);
    expect(balance.amountAtomic).toBe("0");
    expect(balance.amountUsd).toBe(0);
    expect(balance.decimals).toBe(6); // default when no USDC entry found
  });

  it("returns amountAtomic '0'/amountUsd 0 when the account holds no USDC", async () => {
    const account = mockAccount();
    account.listTokenBalances.mockResolvedValue({ balances: [] });

    const balance = await getUsdcBalance(account);
    expect(balance.amountAtomic).toBe("0");
    expect(balance.amountUsd).toBe(0);
  });

  it("paginates across two pages and sums both", async () => {
    const account = mockAccount();
    account.listTokenBalances
      .mockResolvedValueOnce({
        balances: [{ token: { contractAddress: USDC_BASE_SEPOLIA }, amount: { amount: 1_000_000n, decimals: 6 } }],
        nextPageToken: "page-2",
      })
      .mockResolvedValueOnce({
        balances: [{ token: { contractAddress: USDC_BASE_SEPOLIA }, amount: { amount: 2_000_000n, decimals: 6 } }],
      });

    const balance = await getUsdcBalance(account);
    expect(account.listTokenBalances).toHaveBeenCalledTimes(2);
    expect(account.listTokenBalances).toHaveBeenNthCalledWith(2, { network: "base-sepolia", pageToken: "page-2" });
    expect(balance.amountAtomic).toBe("3000000");
  });

  it("throws ArAgentsUnconfiguredError when the account has no listTokenBalances", async () => {
    const account: CdpAccountLike = { address: "0xAA", transfer: vi.fn() };
    await expect(getUsdcBalance(account)).rejects.toBeInstanceOf(ArAgentsUnconfiguredError);
  });

  it("throws ArAgentsValidationError when network has no known USDC contract and no usdcContract override", async () => {
    const account = mockAccount();
    await expect(getUsdcBalance(account, { network: "ethereum" })).rejects.toBeInstanceOf(ArAgentsValidationError);
  });

  it("honors an explicit usdcContract + network override", async () => {
    const account = mockAccount();
    const customUsdc = "0xdeadbeef00000000000000000000000000dead";
    account.listTokenBalances.mockResolvedValue({
      balances: [{ token: { contractAddress: customUsdc.toUpperCase() }, amount: { amount: 500_000n, decimals: 6 } }],
    });

    const balance = await getUsdcBalance(account, { network: "custom-net", usdcContract: customUsdc });
    expect(account.listTokenBalances).toHaveBeenCalledWith({ network: "custom-net", pageToken: undefined });
    expect(balance.network).toBe("custom-net");
    expect(balance.contractAddress).toBe(customUsdc);
    expect(balance.amountAtomic).toBe("500000");
  });

  it("wraps an SDK throw as a WalletCdpUpstreamError", async () => {
    const account = mockAccount();
    account.listTokenBalances.mockRejectedValue(new Error("ECONNRESET"));
    await expect(getUsdcBalance(account)).rejects.toBeInstanceOf(WalletCdpUpstreamError);
  });
});
