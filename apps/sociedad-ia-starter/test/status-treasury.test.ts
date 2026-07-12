/**
 * Unit tests for `fetchTreasuryStatus` (ROADMAP.md M2-4d): the society's CDP
 * wallet address + USDC balance surfaced on `GET /api/status`. Kept in its
 * own file (rather than test/status.test.ts) so it can mock `./clients`'s
 * `getCdpWallet` and `@ar-agents/wallet-cdp`'s `getUsdcBalanceAtomic`
 * directly -- no real CDP credentials, no network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCdpWalletMock, getUsdcBalanceAtomicMock } = vi.hoisted(() => ({
  getCdpWalletMock: vi.fn(),
  getUsdcBalanceAtomicMock: vi.fn(),
}));
vi.mock("../src/lib/clients", () => ({ getCdpWallet: getCdpWalletMock }));
vi.mock("@ar-agents/wallet-cdp", () => ({ getUsdcBalanceAtomic: getUsdcBalanceAtomicMock }));

import { fetchTreasuryStatus } from "../src/lib/status";

beforeEach(() => {
  getCdpWalletMock.mockReset();
  getUsdcBalanceAtomicMock.mockReset();
  delete process.env.CDP_NETWORK;
});

afterEach(() => {
  delete process.env.CDP_NETWORK;
});

describe("fetchTreasuryStatus", () => {
  it("available:false, address null, when no wallet is configured", async () => {
    getCdpWalletMock.mockResolvedValue(undefined);
    const status = await fetchTreasuryStatus();
    expect(status).toEqual({
      available: false,
      address: null,
      network: "base-sepolia",
      asset: "USDC",
      balanceAtomic: null,
      usd: null,
    });
    expect(getUsdcBalanceAtomicMock).not.toHaveBeenCalled();
  });

  it("returns the address, atomic balance, and the human-decimal usd figure on success", async () => {
    getCdpWalletMock.mockResolvedValue({ address: "0xAA00000000000000000000000000000000000A" });
    getUsdcBalanceAtomicMock.mockResolvedValue("15250000");
    const status = await fetchTreasuryStatus();
    expect(status).toEqual({
      available: true,
      address: "0xAA00000000000000000000000000000000000A",
      network: "base-sepolia",
      asset: "USDC",
      balanceAtomic: "15250000",
      usd: 15.25,
    });
  });

  it("respects CDP_NETWORK and passes it through to the balance read", async () => {
    process.env.CDP_NETWORK = "base";
    getCdpWalletMock.mockResolvedValue({ address: "0xAA" });
    getUsdcBalanceAtomicMock.mockResolvedValue("0");
    const status = await fetchTreasuryStatus();
    expect(status.network).toBe("base");
    expect(getUsdcBalanceAtomicMock).toHaveBeenCalledWith(expect.anything(), { network: "base" });
  });

  it("degrades to available:false (keeping the known address) when the balance read throws", async () => {
    getCdpWalletMock.mockResolvedValue({ address: "0xAA" });
    getUsdcBalanceAtomicMock.mockRejectedValue(new Error("upstream down"));
    const status = await fetchTreasuryStatus();
    expect(status).toEqual({
      available: false,
      address: "0xAA",
      network: "base-sepolia",
      asset: "USDC",
      balanceAtomic: null,
      usd: null,
    });
  });

  it("degrades to available:false when the balance read hangs past the timeout", async () => {
    vi.useFakeTimers();
    getCdpWalletMock.mockResolvedValue({ address: "0xAA" });
    getUsdcBalanceAtomicMock.mockReturnValue(new Promise(() => {})); // never resolves
    const promise = fetchTreasuryStatus();
    await vi.advanceTimersByTimeAsync(6_001);
    const status = await promise;
    expect(status.available).toBe(false);
    vi.useRealTimers();
  });

  it("never throws even if getCdpWallet itself rejects (belt-and-suspenders: the real one is documented not to)", async () => {
    getCdpWalletMock.mockRejectedValue(new Error("provisioning failed"));
    await expect(fetchTreasuryStatus()).resolves.toEqual({
      available: false,
      address: null,
      network: "base-sepolia",
      asset: "USDC",
      balanceAtomic: null,
      usd: null,
    });
  });
});
