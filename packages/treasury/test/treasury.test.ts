/**
 * Unit tests for the treasury/fiscal-rail core: cedular tax, obligation buffer,
 * just-in-time conversion policy, state transitions, the off-ramp adapter, and
 * the fundTaxBuffer end-to-end helper.
 */

import { describe, expect, it } from "vitest";
import {
  cedularTax,
  CEDULAR_RATE,
  nextObligation,
  requiredArsBuffer,
  planConversion,
  applyConversion,
  applyPayment,
  fundTaxBuffer,
  InMemoryOffRampAdapter,
  withOffRampIdempotency,
  type Obligation,
  type TreasuryState,
  type OffRampAdapter,
  type OffRampReceipt,
} from "../src/index";

const DAY = 86_400_000;
const t0 = 1_750_000_000_000;

describe("cedularTax", () => {
  it("is ~0 when there is no gain (USDC held at cost basis ~1)", () => {
    expect(cedularTax(1000, 1, 1100)).toBe(0); // proceeds == cost, no gain
  });
  it("taxes the gain at 5% for ARS-denominated disposal", () => {
    // 1000 USDC, cost basis 0.5/u, fx 1000 ARS/USD: proceeds 1,000,000; cost 500,000; gain 500,000 -> 5% = 25,000
    expect(cedularTax(1000, 0.5, 1000, "ARS")).toBe(25_000);
  });
  it("taxes the gain at 15% for foreign-denominated disposal", () => {
    expect(cedularTax(1000, 0.5, 1000, "FOREIGN")).toBe(75_000);
    expect(CEDULAR_RATE.FOREIGN).toBe(0.15);
  });
  it("never goes negative on a loss", () => {
    expect(cedularTax(1000, 2, 1000, "ARS")).toBe(0); // cost > proceeds
  });
});

describe("obligations + buffer", () => {
  const obs: Obligation[] = [
    { id: "m1", kind: "monotributo", amountArs: 30_000, dueAtMs: t0 + 5 * DAY },
    { id: "v1", kind: "vep", amountArs: 50_000, dueAtMs: t0 + 20 * DAY },
    { id: "old", kind: "iibb", amountArs: 99_000, dueAtMs: t0 - 1 * DAY }, // past
  ];

  it("nextObligation returns the soonest upcoming, ignoring past", () => {
    expect(nextObligation(obs, t0)?.id).toBe("m1");
    expect(nextObligation([], t0)).toBeNull();
  });

  it("requiredArsBuffer sums what's due within the horizon, times safety", () => {
    // 7-day horizon: only m1 (30k); safety 1.1 -> 33,000
    expect(requiredArsBuffer(obs, t0, 7 * DAY)).toBe(33_000);
    // 30-day horizon: m1 + v1 = 80k; *1.1 -> 88,000
    expect(requiredArsBuffer(obs, t0, 30 * DAY)).toBe(88_000);
  });

  it("excludes past-due and far-future obligations from the horizon", () => {
    expect(requiredArsBuffer(obs, t0, 1 * DAY)).toBe(0); // nothing due in 1 day; past excluded
  });
});

describe("planConversion (just-in-time)", () => {
  const state: TreasuryState = { usd: 1000, ars: 10_000, costBasisPerUsd: 1 };

  it("does nothing when the ARS buffer already covers the requirement", () => {
    const p = planConversion(state, 8_000, 1000);
    expect(p.convertUsd).toBe(0);
  });

  it("converts only the shortfall (net of spread), not more", () => {
    // need 43,000 ARS, have 10,000 -> shortfall 33,000; rate 1000, spread 1% -> eff 990; usd = 33000/990 = 33.33...
    const p = planConversion(state, 43_000, 1000, 0.01);
    expect(p.convertUsd).toBeCloseTo(33.333, 2);
    expect(p.expectedArs).toBeCloseTo(33_000, 0);
    expect(p.convertUsd).toBeLessThan(state.usd); // does not over-convert
  });

  it("caps the conversion at available USDC (partial top-up)", () => {
    const poor: TreasuryState = { usd: 5, ars: 0, costBasisPerUsd: 1 };
    const p = planConversion(poor, 1_000_000, 1000, 0.01);
    expect(p.convertUsd).toBe(5);
    expect(p.reason).toContain("partial");
  });
});

describe("state transitions", () => {
  it("applyConversion moves USDC -> ARS", () => {
    const s: TreasuryState = { usd: 100, ars: 0, costBasisPerUsd: 1 };
    const next = applyConversion(s, { amountUsd: 40, arsReceived: 39_600, rate: 990, txId: "x" });
    expect(next.usd).toBe(60);
    expect(next.ars).toBe(39_600);
  });
  it("applyPayment debits ARS and throws on overdraw", () => {
    const s: TreasuryState = { usd: 0, ars: 50_000, costBasisPerUsd: 1 };
    expect(applyPayment(s, 30_000).ars).toBe(20_000);
    expect(() => applyPayment(s, 80_000)).toThrow(/insufficient ARS/);
  });
});

describe("InMemoryOffRampAdapter", () => {
  it("quotes + converts net of spread; idempotent on the externalId key", async () => {
    const a = new InMemoryOffRampAdapter(1000, 0.01);
    const q = await a.quote(100);
    expect(q.arsOut).toBeCloseTo(99_000, 0);
    const r1 = await a.convert(100, { externalId: "pay-1" });
    const r2 = await a.convert(100, { externalId: "pay-2" });
    expect(r1.arsReceived).toBeCloseTo(99_000, 0);
    expect(r1.txId).toBe("mem-pay-1");
    expect(r2.txId).toBe("mem-pay-2");
    // a retry with the SAME key returns the SAME receipt (no double-spend)
    const retry = await a.convert(100, { externalId: "pay-1" });
    expect(retry).toEqual(r1);
  });
  it("convert requires an externalId idempotency key", async () => {
    const a = new InMemoryOffRampAdapter(1000, 0.01);
    // @ts-expect-error — externalId is required by the OffRampAdapter contract
    await expect(a.convert(100, {})).rejects.toThrow(/externalId/);
  });
});

describe("fundTaxBuffer (end-to-end)", () => {
  const obs: Obligation[] = [
    { id: "m1", kind: "monotributo", amountArs: 30_000, dueAtMs: t0 + 5 * DAY },
  ];

  it("converts via the off-ramp to fund the buffer and returns the new state", async () => {
    const state: TreasuryState = { usd: 1000, ars: 0, costBasisPerUsd: 1 };
    const offramp = new InMemoryOffRampAdapter(1000, 0.01);
    const out = await fundTaxBuffer({
      state,
      obligations: obs,
      nowMs: t0,
      horizonMs: 7 * DAY,
      fxRate: 1000,
      offramp,
    });
    // required = 30,000 * 1.1 = 33,000; converted ~33.33 USDC; ARS ~33,000
    expect(out.receipt).toBeDefined();
    expect(out.state.ars).toBeGreaterThanOrEqual(33_000 - 1);
    expect(out.state.usd).toBeLessThan(1000);
    // The funded buffer covers the obligation.
    expect(out.state.ars).toBeGreaterThanOrEqual(obs[0]!.amountArs);
  });

  it("is a no-op when the buffer is already funded (no conversion, no receipt)", async () => {
    const state: TreasuryState = { usd: 1000, ars: 100_000, costBasisPerUsd: 1 };
    const out = await fundTaxBuffer({
      state,
      obligations: obs,
      nowMs: t0,
      horizonMs: 7 * DAY,
      fxRate: 1000,
      offramp: new InMemoryOffRampAdapter(1000),
    });
    expect(out.receipt).toBeUndefined();
    expect(out.plan.convertUsd).toBe(0);
    expect(out.state).toEqual(state);
  });

  it("default externalId is stable across fxRate drift on retry (no double-spend)", async () => {
    // A lost-response retry re-runs fundTaxBuffer with the SAME obligations + the
    // SAME `required` ARS buffer but a DIFFERENT live fxRate. The default
    // idempotency key must NOT change — otherwise the PSAV executes a second real
    // payout. We capture the externalId the off-ramp is called with on each run.
    function captureAdapter() {
      const externalIds: string[] = [];
      const adapter: OffRampAdapter = {
        quote: async (amountUsd) => ({ amountUsd, arsOut: amountUsd * 1000, rate: 1000, spread: 0 }),
        convert: async (amountUsd, opts): Promise<OffRampReceipt> => {
          externalIds.push(opts.externalId);
          return { amountUsd, arsReceived: amountUsd * 1000, rate: 1000, txId: `tx-${externalIds.length}` };
        },
      };
      return { adapter, externalIds };
    }

    const state: TreasuryState = { usd: 1000, ars: 0, costBasisPerUsd: 1 };

    const first = captureAdapter();
    await fundTaxBuffer({
      state,
      obligations: obs,
      nowMs: t0,
      horizonMs: 7 * DAY,
      fxRate: 1000,
      offramp: first.adapter,
    });

    // Same obligations + horizon (→ same `required` buffer) but the fx moved on the retry.
    const retry = captureAdapter();
    await fundTaxBuffer({
      state,
      obligations: obs,
      nowMs: t0,
      horizonMs: 7 * DAY,
      fxRate: 1200,
      offramp: retry.adapter,
    });

    expect(first.externalIds).toHaveLength(1);
    expect(retry.externalIds).toHaveLength(1);
    // Identical key despite the fxRate drift → the PSAV dedupes → no second payout.
    expect(retry.externalIds[0]).toBe(first.externalIds[0]);
  });
});

describe("withOffRampIdempotency (double-send guard)", () => {
  // A fake PSAV adapter that creates a NEW payout every call (like Mural's raw
  // convert, which only echoes the key as a memo) so we can prove the wrapper
  // dedupes instead of double-sending.
  function countingAdapter() {
    let payouts = 0;
    const adapter: OffRampAdapter = {
      quote: async (amountUsd) => ({ amountUsd, arsOut: amountUsd * 1000, rate: 1000, spread: 0 }),
      convert: async (amountUsd): Promise<OffRampReceipt> => {
        payouts += 1;
        return { amountUsd, arsReceived: amountUsd * 1000, rate: 1000, txId: `payout-${payouts}` };
      },
    };
    return { adapter, payouts: () => payouts };
  }

  it("a retried convert with the same key returns the original receipt — no second payout", async () => {
    const { adapter, payouts } = countingAdapter();
    const guarded = withOffRampIdempotency(adapter);
    const first = await guarded.convert(100, { externalId: "op-1" });
    const second = await guarded.convert(100, { externalId: "op-1" });
    expect(second).toEqual(first);
    expect(payouts()).toBe(1); // executed exactly once despite two convert calls
  });

  it("concurrent converts with the same key share ONE payout", async () => {
    const { adapter, payouts } = countingAdapter();
    const guarded = withOffRampIdempotency(adapter);
    const [a, b] = await Promise.all([
      guarded.convert(100, { externalId: "op-2" }),
      guarded.convert(100, { externalId: "op-2" }),
    ]);
    expect(a).toEqual(b);
    expect(payouts()).toBe(1);
  });

  it("different keys still create distinct payouts", async () => {
    const { adapter, payouts } = countingAdapter();
    const guarded = withOffRampIdempotency(adapter);
    await guarded.convert(100, { externalId: "op-3" });
    await guarded.convert(100, { externalId: "op-4" });
    expect(payouts()).toBe(2);
  });

  it("rejects a missing idempotency key", async () => {
    const { adapter } = countingAdapter();
    const guarded = withOffRampIdempotency(adapter);
    await expect(
      guarded.convert(100, { externalId: "" }),
    ).rejects.toThrow(/externalId/);
  });
});
