import { describe, expect, it } from "vitest";
import {
  buildAccountingPayload,
  mockFxOracle,
  createOpenUsdRail,
  mockOpenUsdBackend,
  OPEN_USD,
  type FiatRail,
} from "../src/index";

const AT = "2026-07-01T12:00:00.000Z";

describe("accounting_payload (rail-neutral)", () => {
  it("values a USD movement into local currency at execution time", async () => {
    const p = await buildAccountingPayload({ usd: 100, asset: "OUSD", fx: mockFxOracle(1000), at: AT });
    expect(p).toEqual({
      usd: 100,
      local: 100_000,
      localCurrency: "ARS",
      fxRate: 1000,
      fxSource: "mock",
      at: AT,
      asset: "OUSD",
    });
  });

  it("honors a non-ARS local currency (currency/jurisdiction decoupled)", async () => {
    const p = await buildAccountingPayload({ usd: 10, asset: "USDC", fx: mockFxOracle(0.92), at: AT, localCurrency: "EUR" });
    expect(p.localCurrency).toBe("EUR");
    expect(p.local).toBeCloseTo(9.2, 5);
  });

  it("rejects an invalid amount or a non-positive FX rate (fail-safe, no silent 0)", async () => {
    await expect(buildAccountingPayload({ usd: -1, asset: "OUSD", fx: mockFxOracle(), at: AT })).rejects.toThrow();
    await expect(buildAccountingPayload({ usd: 1, asset: "OUSD", fx: mockFxOracle(0), at: AT })).rejects.toThrow();
  });

  it("marks the source `mock` so production valuation can refuse it", async () => {
    const p = await buildAccountingPayload({ usd: 1, asset: "OUSD", fx: mockFxOracle(), at: AT });
    expect(p.fxSource).toBe("mock");
  });
});

describe("OpenUsdRail (flagship USD FiatRail, MOCK-only)", () => {
  const rail = createOpenUsdRail({ fx: mockFxOracle(1000) });

  it("is pre-launch and rail-neutral: a plain FiatRail with a stable id", () => {
    expect(OPEN_USD.status).toBe("pre-launch"); // integration is mock until this flips
    expect(OPEN_USD.asset).toBe("OUSD");
    const asFiatRail: FiatRail = rail; // structurally IS a FiatRail (one impl among many)
    expect(asFiatRail.id).toBe("open-usd");
    expect(rail.currency).toBe("ARS");
    expect(rail.direction).toBe("both");
  });

  it("quotes OUSD -> ARS (with spread) and settles with an idempotent txId", async () => {
    const spready = createOpenUsdRail({ fx: mockFxOracle(1000), spread: 0.01 });
    const q = await spready.quote({ amount: 100, fromAsset: "OUSD", toAsset: "ARS" });
    expect(q.out).toBe(99_000); // 100 * 1000 * (1 - 0.01)
    expect(q.spread).toBe(0.01);

    const r1 = await rail.settle({ amount: 50, fromAsset: "OUSD", toAsset: "ARS", externalId: "op-1" });
    const r2 = await rail.settle({ amount: 50, fromAsset: "OUSD", toAsset: "ARS", externalId: "op-1" });
    expect(r1.received).toBe(50_000);
    expect(r1.txId).toBe(r2.txId); // idempotent by externalId (no double-spend)
    const r3 = await rail.settle({ amount: 50, fromAsset: "OUSD", toAsset: "ARS", externalId: "op-2" });
    expect(r3.txId).not.toBe(r1.txId);
  });

  it("emits the accounting_payload for a bare OUSD movement (no off-ramp)", async () => {
    const p = await rail.accountingFor({ amount: 250, at: AT });
    expect(p.asset).toBe("OUSD");
    expect(p.usd).toBe(250);
    expect(p.local).toBe(250_000);
    expect(p.at).toBe(AT);
  });

  it("propagates an invalid FX rate as an error (never settles at a bogus rate)", async () => {
    const bad = createOpenUsdRail({ fx: mockFxOracle(0) });
    await expect(bad.settle({ amount: 1, fromAsset: "OUSD", toAsset: "ARS", externalId: "x" })).rejects.toThrow();
  });

  it("mock backend has zero chain deps and is deterministic", async () => {
    const b = mockOpenUsdBackend();
    const a = await b.transfer({ amount: 1, toAsset: "ARS", externalId: "same" });
    const c = await b.transfer({ amount: 999, toAsset: "ARS", externalId: "same" });
    expect(a.txId).toBe(c.txId); // keyed by externalId only
    expect(a.txId).toMatch(/^ousd-mock-[0-9a-f]{8}$/);
  });
});
