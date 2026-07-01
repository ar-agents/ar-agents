import { describe, expect, it } from "vitest";
import { InMemoryOffRampAdapter } from "../src/index";
import { createOusdArsRoute } from "../src/open-usd-route";
import { mockFxOracle } from "@ar-agents/core";

const AT = "2026-07-01T12:00:00.000Z";

describe("OUSD -> ARS route (orchestrate a PSAV + accounting; never become the ramp)", () => {
  it("is mock/not-live until OUSD ships", () => {
    expect(createOusdArsRoute().live).toBe(false); // OPEN_USD.status === "pre-launch"
    expect(createOusdArsRoute().asset).toBe("OUSD");
  });

  it("quotes the provider ARS out AND a separate AFIP accounting valuation", async () => {
    const route = createOusdArsRoute({
      provider: new InMemoryOffRampAdapter(1000, 0.01), // 1000 ARS/USD, 1% spread
      fx: mockFxOracle(1000),
    });
    const q = await route.quote(100, { at: AT });
    // Provider realizes ARS net of spread.
    expect(q.offRamp.arsOut).toBeCloseTo(99_000, 2); // 100 * 1000 * 0.99
    // The accounting_payload is mark-to-market (independent of the provider spread).
    expect(q.accounting.local).toBe(100_000);
    expect(q.accounting.asset).toBe("OUSD");
    expect(q.accounting.localCurrency).toBe("ARS");
    // The gap between them IS the off-ramp cost (real, and reported separately for tax).
    expect(q.accounting.local - q.offRamp.arsOut).toBeCloseTo(1_000, 2);
  });

  it("converts via the provider (idempotent) and attaches the execution-time accounting", async () => {
    const route = createOusdArsRoute({ provider: new InMemoryOffRampAdapter(1000, 0.01), fx: mockFxOracle(1000) });
    const r1 = await route.convert(50, { externalId: "op-1", at: AT });
    const r2 = await route.convert(50, { externalId: "op-1", at: AT });
    expect(r1.receipt.arsReceived).toBeCloseTo(49_500, 2); // 50 * 1000 * 0.99
    expect(r1.receipt.txId).toBe(r2.receipt.txId); // idempotent by externalId
    expect(r1.accounting.usd).toBe(50);
    expect(r1.accounting.local).toBe(50_000); // mark-to-market
    expect(r1.accounting.at).toBe(AT);
  });

  it("defaults to a fully-mocked route (no provider/fx supplied)", async () => {
    const q = await createOusdArsRoute().quote(10, { at: AT });
    expect(q.accounting.fxSource).toBe("mock"); // production valuation can refuse a mock source
    expect(q.offRamp.amountUsd).toBe(10);
  });
});
