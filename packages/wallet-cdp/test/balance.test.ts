import { describe, expect, it, vi } from "vitest";
import { isArAgentsError } from "@ar-agents/core";
import {
  checkBalanceAndDetectTopUp,
  detectBalanceChange,
  getUsdcBalanceAtomic,
  InMemoryLastBalanceStore,
  parseUsdcBalanceAtomic,
  type CdpAccountWithBalance,
} from "../src/balance";
import { WalletCdpUpstreamError } from "../src/errors";

function mockAccountWithBalance(listTokenBalances: ReturnType<typeof vi.fn>): CdpAccountWithBalance {
  return {
    address: "0x000000000000000000000000000000000000AA",
    transfer: vi.fn(),
    listTokenBalances,
  } as unknown as CdpAccountWithBalance;
}

describe("parseUsdcBalanceAtomic", () => {
  it("unwraps a nested { amount: { amount, decimals } } shape", () => {
    const response = {
      balances: [{ token: { symbol: "USDC" }, amount: { amount: "1000000", decimals: 6 } }],
    };
    expect(parseUsdcBalanceAtomic(response)).toBe("1000000");
  });

  it("unwraps a bare amount value (no nested object)", () => {
    const response = { balances: [{ symbol: "USDC", amount: "2500000" }] };
    expect(parseUsdcBalanceAtomic(response)).toBe("2500000");
  });

  it("reads from a .balance field when .amount is absent", () => {
    const response = { balances: [{ symbol: "USDC", balance: "700000" }] };
    expect(parseUsdcBalanceAtomic(response)).toBe("700000");
  });

  it("supports the .data shape instead of .balances", () => {
    const response = { data: [{ token: { symbol: "usdc" }, amount: "42" }] };
    expect(parseUsdcBalanceAtomic(response)).toBe("42");
  });

  it("returns 0 when there is no USDC entry (other tokens present)", () => {
    const response = { balances: [{ token: { symbol: "WETH" }, amount: "999999" }] };
    expect(parseUsdcBalanceAtomic(response)).toBe("0");
  });

  it("returns 0 on an empty balances list (unfunded wallet)", () => {
    expect(parseUsdcBalanceAtomic({ balances: [] })).toBe("0");
  });

  it("never throws on a malformed/unexpected response shape", () => {
    expect(parseUsdcBalanceAtomic(null)).toBe("0");
    expect(parseUsdcBalanceAtomic(undefined)).toBe("0");
    expect(parseUsdcBalanceAtomic("not an object")).toBe("0");
    expect(parseUsdcBalanceAtomic({ balances: "not an array" })).toBe("0");
    expect(parseUsdcBalanceAtomic({ balances: [{ token: { symbol: "USDC" }, amount: "not-a-number" }] })).toBe("0");
  });

  it("is case-insensitive on the symbol", () => {
    const response = { balances: [{ symbol: "usdc", amount: "10" }] };
    expect(parseUsdcBalanceAtomic(response)).toBe("10");
  });
});

describe("getUsdcBalanceAtomic", () => {
  it("calls listTokenBalances with the given network and parses the result", async () => {
    const listTokenBalances = vi.fn().mockResolvedValue({
      balances: [{ token: { symbol: "USDC" }, amount: { amount: "3000000" } }],
    });
    const account = mockAccountWithBalance(listTokenBalances);
    const atomic = await getUsdcBalanceAtomic(account, { network: "base" });
    expect(listTokenBalances).toHaveBeenCalledWith({ network: "base" });
    expect(atomic).toBe("3000000");
  });

  it("defaults to base-sepolia when no network is given", async () => {
    const listTokenBalances = vi.fn().mockResolvedValue({ balances: [] });
    const account = mockAccountWithBalance(listTokenBalances);
    await getUsdcBalanceAtomic(account);
    expect(listTokenBalances).toHaveBeenCalledWith({ network: "base-sepolia" });
  });

  it("classifies an upstream failure as WalletCdpUpstreamError", async () => {
    const listTokenBalances = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const account = mockAccountWithBalance(listTokenBalances);
    await expect(getUsdcBalanceAtomic(account)).rejects.toBeInstanceOf(WalletCdpUpstreamError);
    try {
      await getUsdcBalanceAtomic(account);
    } catch (err) {
      expect(isArAgentsError(err)).toBe(true);
      expect((err as WalletCdpUpstreamError).code).toBe("upstream_error");
    }
  });

  it("throws a plain Error when the account has no listTokenBalances method", async () => {
    const account = { address: "0xAA", transfer: vi.fn() };
    await expect(getUsdcBalanceAtomic(account)).rejects.toThrow(/listTokenBalances/);
  });
});

describe("detectBalanceChange", () => {
  it("reports an increase", () => {
    const d = detectBalanceChange("1000000", "3000000");
    expect(d).toEqual({
      previousAtomic: "1000000",
      currentAtomic: "3000000",
      deltaAtomic: "2000000",
      direction: "increase",
    });
  });

  it("reports a decrease with a non-negative deltaAtomic", () => {
    const d = detectBalanceChange("3000000", "1000000");
    expect(d.direction).toBe("decrease");
    expect(d.deltaAtomic).toBe("2000000");
  });

  it("reports none when unchanged", () => {
    const d = detectBalanceChange("1000000", "1000000");
    expect(d.direction).toBe("none");
    expect(d.deltaAtomic).toBe("0");
  });

  it("treats a null previous reading as 0 (any positive balance reads as an increase)", () => {
    const d = detectBalanceChange(null, "1000000");
    expect(d.previousAtomic).toBe("0");
    expect(d.direction).toBe("increase");
    expect(d.deltaAtomic).toBe("1000000");
  });
});

describe("checkBalanceAndDetectTopUp", () => {
  it("flags firstCheck=true and an increase when the store has no prior reading", async () => {
    const listTokenBalances = vi.fn().mockResolvedValue({
      balances: [{ symbol: "USDC", amount: "5000000" }],
    });
    const account = mockAccountWithBalance(listTokenBalances);
    const store = new InMemoryLastBalanceStore();
    const result = await checkBalanceAndDetectTopUp({ account, store, key: "soc-1" });
    expect(result.firstCheck).toBe(true);
    expect(result.direction).toBe("increase");
    expect(result.currentAtomic).toBe("5000000");
  });

  it("detects a real top-up on the SECOND check (increase, not firstCheck)", async () => {
    const listTokenBalances = vi
      .fn()
      .mockResolvedValueOnce({ balances: [{ symbol: "USDC", amount: "1000000" }] })
      .mockResolvedValueOnce({ balances: [{ symbol: "USDC", amount: "6000000" }] });
    const account = mockAccountWithBalance(listTokenBalances);
    const store = new InMemoryLastBalanceStore();

    const first = await checkBalanceAndDetectTopUp({ account, store, key: "soc-2" });
    expect(first.firstCheck).toBe(true);

    const second = await checkBalanceAndDetectTopUp({ account, store, key: "soc-2" });
    expect(second.firstCheck).toBe(false);
    expect(second.direction).toBe("increase");
    expect(second.deltaAtomic).toBe("5000000");
  });

  it("reports none on a repeated check with no change, and persists across calls", async () => {
    const listTokenBalances = vi.fn().mockResolvedValue({ balances: [{ symbol: "USDC", amount: "2000000" }] });
    const account = mockAccountWithBalance(listTokenBalances);
    const store = new InMemoryLastBalanceStore();

    await checkBalanceAndDetectTopUp({ account, store, key: "soc-3" });
    const second = await checkBalanceAndDetectTopUp({ account, store, key: "soc-3" });
    expect(second.direction).toBe("none");
    expect(second.firstCheck).toBe(false);
  });

  it("reports a decrease (e.g. after a transfer out) without flagging a deposit", async () => {
    const listTokenBalances = vi
      .fn()
      .mockResolvedValueOnce({ balances: [{ symbol: "USDC", amount: "9000000" }] })
      .mockResolvedValueOnce({ balances: [{ symbol: "USDC", amount: "1000000" }] });
    const account = mockAccountWithBalance(listTokenBalances);
    const store = new InMemoryLastBalanceStore();

    await checkBalanceAndDetectTopUp({ account, store, key: "soc-4" });
    const second = await checkBalanceAndDetectTopUp({ account, store, key: "soc-4" });
    expect(second.direction).toBe("decrease");
  });

  it("keeps two different keys' histories independent", async () => {
    const listTokenBalances = vi.fn().mockResolvedValue({ balances: [{ symbol: "USDC", amount: "1000000" }] });
    const account = mockAccountWithBalance(listTokenBalances);
    const store = new InMemoryLastBalanceStore();

    await checkBalanceAndDetectTopUp({ account, store, key: "society-a" });
    const other = await checkBalanceAndDetectTopUp({ account, store, key: "society-b" });
    expect(other.firstCheck).toBe(true); // society-b never saw a check before, despite society-a's history
  });
});
