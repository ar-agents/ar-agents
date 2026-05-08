import { describe, it, expect } from "vitest";
import {
  InMemoryBudgetTracker,
  evaluateBudgetWithRecurrence,
  isWithinRecurrenceWindow,
} from "../src";

describe("InMemoryBudgetTracker", () => {
  it("inspect returns zeroed snapshot for unknown digest", async () => {
    const t = new InMemoryBudgetTracker();
    const snap = await t.inspect("unknown_digest");
    expect(snap.totalSpentMinor).toBe(0);
    expect(snap.occurrences).toBe(0);
    expect(snap.lastExecutedAt).toBeUndefined();
  });

  it("recordPresentation accumulates spend + occurrences", async () => {
    const t = new InMemoryBudgetTracker();
    await t.recordPresentation({
      openMandateDigest: "digest_1",
      amountMinor: 1000,
      currency: "USD",
      executedAt: 1717000000,
    });
    await t.recordPresentation({
      openMandateDigest: "digest_1",
      amountMinor: 500,
      currency: "USD",
      executedAt: 1717100000,
    });
    const snap = await t.inspect("digest_1");
    expect(snap.totalSpentMinor).toBe(1500);
    expect(snap.occurrences).toBe(2);
    expect(snap.lastExecutedAt).toBe(1717100000);
  });

  it("scopes state by digest", async () => {
    const t = new InMemoryBudgetTracker();
    await t.recordPresentation({
      openMandateDigest: "a",
      amountMinor: 100,
      currency: "USD",
    });
    await t.recordPresentation({
      openMandateDigest: "b",
      amountMinor: 200,
      currency: "USD",
    });
    expect((await t.inspect("a")).totalSpentMinor).toBe(100);
    expect((await t.inspect("b")).totalSpentMinor).toBe(200);
  });

  it("clear() removes the digest's state", async () => {
    const t = new InMemoryBudgetTracker();
    await t.recordPresentation({
      openMandateDigest: "x",
      amountMinor: 100,
      currency: "USD",
    });
    await t.clear?.("x");
    expect((await t.inspect("x")).totalSpentMinor).toBe(0);
  });
});

describe("isWithinRecurrenceWindow", () => {
  it("ON_DEMAND always passes", () => {
    expect(isWithinRecurrenceWindow("ON_DEMAND", undefined, 0)).toBe(true);
    expect(isWithinRecurrenceWindow("ON_DEMAND", 1717000000, 1717000010)).toBe(true);
  });

  it("first execution always passes", () => {
    expect(isWithinRecurrenceWindow("MONTHLY", undefined, 1717000000)).toBe(true);
  });

  it("DAILY blocks within 24h", () => {
    expect(
      isWithinRecurrenceWindow("DAILY", 1717000000, 1717000000 + 23 * 3600),
    ).toBe(false);
  });

  it("DAILY allows after 24h", () => {
    expect(
      isWithinRecurrenceWindow("DAILY", 1717000000, 1717000000 + 24 * 3600 + 1),
    ).toBe(true);
  });

  it("MONTHLY blocks within ~30 days", () => {
    expect(
      isWithinRecurrenceWindow("MONTHLY", 1717000000, 1717000000 + 29 * 24 * 3600),
    ).toBe(false);
  });

  it("MONTHLY allows after ~30 days", () => {
    expect(
      isWithinRecurrenceWindow("MONTHLY", 1717000000, 1717000000 + 31 * 24 * 3600),
    ).toBe(true);
  });
});

describe("evaluateBudgetWithRecurrence", () => {
  it("OK when projected total stays within budget", async () => {
    const t = new InMemoryBudgetTracker();
    await t.recordPresentation({
      openMandateDigest: "d",
      amountMinor: 30000, // 300 USD
      currency: "USD",
    });
    const r = await evaluateBudgetWithRecurrence({
      tracker: t,
      openMandateDigest: "d",
      amountMinor: 20000, // +200 USD = 500 USD
      currency: "USD",
      budget: { max: 1000, currency: "USD" }, // 1000 USD
      divisor: 100,
    });
    expect(r.ok).toBe(true);
  });

  it("FAILS when projected total exceeds budget", async () => {
    const t = new InMemoryBudgetTracker();
    await t.recordPresentation({
      openMandateDigest: "d",
      amountMinor: 80000, // 800 USD
      currency: "USD",
    });
    const r = await evaluateBudgetWithRecurrence({
      tracker: t,
      openMandateDigest: "d",
      amountMinor: 30000, // +300 USD = 1100 USD
      currency: "USD",
      budget: { max: 1000, currency: "USD" }, // cap 1000 USD
      divisor: 100,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_mandate");
    expect(r.reason).toContain("Budget exceeded");
  });

  it("FAILS on currency mismatch", async () => {
    const t = new InMemoryBudgetTracker();
    const r = await evaluateBudgetWithRecurrence({
      tracker: t,
      openMandateDigest: "d",
      amountMinor: 100,
      currency: "USD",
      budget: { max: 1000, currency: "ARS" },
      divisor: 100,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("currency");
  });

  it("FAILS when occurrences exhausted", async () => {
    const t = new InMemoryBudgetTracker();
    // Two prior presentations — max_occurrences is 2, so this 3rd would exceed.
    await t.recordPresentation({
      openMandateDigest: "d",
      amountMinor: 100,
      currency: "USD",
      executedAt: 1717000000,
    });
    await t.recordPresentation({
      openMandateDigest: "d",
      amountMinor: 100,
      currency: "USD",
      executedAt: 1717100000,
    });
    const r = await evaluateBudgetWithRecurrence({
      tracker: t,
      openMandateDigest: "d",
      amountMinor: 100,
      currency: "USD",
      budget: { max: 100, currency: "USD" },
      recurrence: { frequency: "ON_DEMAND", max_occurrences: 2 },
      divisor: 100,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("Recurrence exhausted");
  });

  it("FAILS when within recurrence window", async () => {
    const t = new InMemoryBudgetTracker();
    await t.recordPresentation({
      openMandateDigest: "d",
      amountMinor: 100,
      currency: "USD",
      executedAt: 1717000000,
    });
    const r = await evaluateBudgetWithRecurrence({
      tracker: t,
      openMandateDigest: "d",
      amountMinor: 100,
      currency: "USD",
      budget: { max: 1000, currency: "USD" },
      recurrence: { frequency: "DAILY", max_occurrences: 5 },
      divisor: 100,
      // 12 hours later — DAILY blocks until 24h elapsed.
      nowSeconds: 1717000000 + 12 * 3600,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("Recurrence window not yet elapsed");
  });

  it("OK after recurrence window has elapsed", async () => {
    const t = new InMemoryBudgetTracker();
    await t.recordPresentation({
      openMandateDigest: "d",
      amountMinor: 100,
      currency: "USD",
      executedAt: 1717000000,
    });
    const r = await evaluateBudgetWithRecurrence({
      tracker: t,
      openMandateDigest: "d",
      amountMinor: 100,
      currency: "USD",
      budget: { max: 1000, currency: "USD" },
      recurrence: { frequency: "DAILY", max_occurrences: 5 },
      divisor: 100,
      nowSeconds: 1717000000 + 25 * 3600, // 25h later
    });
    expect(r.ok).toBe(true);
  });

  it("respects 0-decimal currency divisor (CLP)", async () => {
    const t = new InMemoryBudgetTracker();
    const r = await evaluateBudgetWithRecurrence({
      tracker: t,
      openMandateDigest: "d",
      amountMinor: 5000,
      currency: "CLP",
      budget: { max: 50000, currency: "CLP" }, // 50,000 CLP exact (0-decimal)
      divisor: 1,
    });
    expect(r.ok).toBe(true);
  });
});
