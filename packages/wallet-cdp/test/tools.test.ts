import { describe, expect, it, vi } from "vitest";
import { classifyTool } from "@ar-agents/core";
import { walletCdpSideEffectsFor, walletCdpTools } from "../src/tools";
import { InMemoryLastBalanceStore } from "../src/balance";
import type { CdpAccountLike } from "../src/wallet";

interface ToolLike {
  execute: (input: unknown, ctx: { toolCallId: string; messages: unknown[] }) => Promise<unknown>;
}
const ctx = { toolCallId: "test", messages: [] };
const call = (tools: Record<string, unknown>, name: string, input: unknown) =>
  (tools[name] as ToolLike).execute(input, ctx);

function mockAccount(): CdpAccountLike & { transfer: ReturnType<typeof vi.fn> } {
  return {
    address: "0x000000000000000000000000000000000000AA",
    transfer: vi.fn(),
  } as CdpAccountLike & { transfer: ReturnType<typeof vi.fn> };
}

function mockAccountWithBalance(
  listTokenBalances: ReturnType<typeof vi.fn>,
): CdpAccountLike & { transfer: ReturnType<typeof vi.fn>; listTokenBalances: ReturnType<typeof vi.fn> } {
  return {
    address: "0x000000000000000000000000000000000000AA",
    transfer: vi.fn(),
    listTokenBalances,
  } as CdpAccountLike & { transfer: ReturnType<typeof vi.fn>; listTokenBalances: ReturnType<typeof vi.fn> };
}

describe("wallet_transfer_usdc tool name classifies as money risk", () => {
  it("matches @ar-agents/core's risk-manifest 'transfer' override", () => {
    expect(classifyTool({ name: "wallet_transfer_usdc" })).toBe("money");
  });

  it("walletCdpSideEffectsFor reports 'moves money' for the tool", () => {
    expect(walletCdpSideEffectsFor("wallet_transfer_usdc")).toBe("moves money");
    expect(walletCdpSideEffectsFor("unknown_tool")).toBeUndefined();
  });
});

describe("walletCdpTools", () => {
  it("returns {available:false} when no wallet is configured", async () => {
    const approve = vi.fn();
    const tools = walletCdpTools({ thresholdAtomic: "10000000", approve });
    const result = await call(tools, "wallet_transfer_usdc", {
      to: "0xabc",
      amountAtomic: "1",
      idempotencyKey: "k",
    });
    expect(result).toMatchObject({ available: false });
    expect(approve).not.toHaveBeenCalled();
  });

  it("defers below approval when the gate denies an above-threshold transfer", async () => {
    const account = mockAccount();
    const approve = vi.fn().mockResolvedValue(false);
    const tools = walletCdpTools({ account, thresholdAtomic: "10000000", approve });
    const result = await call(tools, "wallet_transfer_usdc", {
      to: "0x1234567890123456789012345678901234567890",
      amountAtomic: "50000000",
      idempotencyKey: "k2",
    });
    expect(result).toMatchObject({ available: true, status: "deferred" });
    expect(account.transfer).not.toHaveBeenCalled();
  });

  it("executes when below threshold (approve never consulted)", async () => {
    const account = mockAccount();
    account.transfer.mockResolvedValue({ transactionHash: "0xok" });
    const approve = vi.fn();
    const tools = walletCdpTools({ account, thresholdAtomic: "10000000", approve });
    const result = await call(tools, "wallet_transfer_usdc", {
      to: "0x1234567890123456789012345678901234567890",
      amountAtomic: "1000000",
      idempotencyKey: "k3",
    });
    expect(result).toMatchObject({ available: true, status: "executed" });
    expect(approve).not.toHaveBeenCalled();
  });
});

describe("wallet_check_balance tool name classifies as read (no approval needed)", () => {
  it("is not gated by the risk manifest", () => {
    expect(classifyTool({ name: "wallet_check_balance", sideEffects: walletCdpSideEffectsFor("wallet_check_balance") })).toBe(
      "read",
    );
  });

  it("walletCdpSideEffectsFor reports 'network read' for the tool", () => {
    expect(walletCdpSideEffectsFor("wallet_check_balance")).toBe("network read");
  });
});

describe("walletCdpTools — wallet_check_balance", () => {
  it("returns {available:false} when no wallet is configured", async () => {
    const tools = walletCdpTools({ thresholdAtomic: "10000000", approve: vi.fn() });
    const result = await call(tools, "wallet_check_balance", {});
    expect(result).toMatchObject({ available: false });
  });

  it("reports the current balance and firstCheck=true on the very first call", async () => {
    const listTokenBalances = vi.fn().mockResolvedValue({ balances: [{ symbol: "USDC", amount: "5000000" }] });
    const account = mockAccountWithBalance(listTokenBalances);
    const tools = walletCdpTools({ account, thresholdAtomic: "10000000", approve: vi.fn() });
    const result = await call(tools, "wallet_check_balance", {});
    expect(result).toMatchObject({
      available: true,
      asset: "USDC",
      currentAtomic: "5000000",
      firstCheck: true,
      depositDetected: false, // first-ever reading is the baseline, not a detected top-up
    });
  });

  it("flags depositDetected=true when the balance increased since the previous call", async () => {
    const listTokenBalances = vi
      .fn()
      .mockResolvedValueOnce({ balances: [{ symbol: "USDC", amount: "1000000" }] })
      .mockResolvedValueOnce({ balances: [{ symbol: "USDC", amount: "4000000" }] });
    const account = mockAccountWithBalance(listTokenBalances);
    const balanceStore = new InMemoryLastBalanceStore();
    const tools = walletCdpTools({ account, thresholdAtomic: "10000000", approve: vi.fn(), balanceStore, balanceKey: "soc" });

    await call(tools, "wallet_check_balance", {});
    const second = await call(tools, "wallet_check_balance", {});
    expect(second).toMatchObject({
      available: true,
      direction: "increase",
      deltaAtomic: "3000000",
      depositDetected: true,
    });
  });

  it("does NOT flag depositDetected on a decrease or no-change", async () => {
    const listTokenBalances = vi
      .fn()
      .mockResolvedValueOnce({ balances: [{ symbol: "USDC", amount: "5000000" }] })
      .mockResolvedValueOnce({ balances: [{ symbol: "USDC", amount: "5000000" }] })
      .mockResolvedValueOnce({ balances: [{ symbol: "USDC", amount: "1000000" }] });
    const account = mockAccountWithBalance(listTokenBalances);
    const balanceStore = new InMemoryLastBalanceStore();
    const tools = walletCdpTools({ account, thresholdAtomic: "10000000", approve: vi.fn(), balanceStore, balanceKey: "soc" });

    await call(tools, "wallet_check_balance", {}); // first, baseline
    const same = await call(tools, "wallet_check_balance", {});
    expect(same).toMatchObject({ direction: "none", depositDetected: false });
    const down = await call(tools, "wallet_check_balance", {});
    expect(down).toMatchObject({ direction: "decrease", depositDetected: false });
  });
});
