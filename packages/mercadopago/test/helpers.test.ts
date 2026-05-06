import { describe, expect, it } from "vitest";
import { computeMarketplaceFee, explainPaymentStatus } from "../src/helpers";
import type { Payment } from "../src/types";

describe("computeMarketplaceFee", () => {
  it("returns 0 for zero amount", () => {
    expect(computeMarketplaceFee(0, { percent: 5 })).toBe(0);
  });

  it("computes flat fee", () => {
    expect(computeMarketplaceFee(10_000, { flatArs: 200 })).toBe(200);
  });

  it("computes percentage fee", () => {
    expect(computeMarketplaceFee(10_000, { percent: 5 })).toBe(500);
  });

  it("combines flat + percentage", () => {
    expect(computeMarketplaceFee(10_000, { flatArs: 200, percent: 2 })).toBe(400);
  });

  it("respects min floor", () => {
    expect(computeMarketplaceFee(500, { percent: 5, minArs: 50 })).toBe(50);
  });

  it("respects max ceiling", () => {
    expect(computeMarketplaceFee(1_000_000, { percent: 5, maxArs: 5000 })).toBe(5000);
  });

  it("never charges more than the transaction amount", () => {
    expect(computeMarketplaceFee(100, { flatArs: 500 })).toBe(100);
  });

  it("rounds by default", () => {
    expect(computeMarketplaceFee(123, { percent: 3 })).toBe(4); // 3.69 → 4
  });

  it("can disable rounding", () => {
    expect(computeMarketplaceFee(123, { percent: 3, round: false })).toBeCloseTo(3.69);
  });
});

const basePayment: Payment = {
  id: "1",
  status: "approved",
  status_detail: "accredited",
  transaction_amount: 1000,
  currency_id: "ARS",
} as Payment;

describe("explainPaymentStatus", () => {
  it("returns paid=true + final=true for approved+accredited", () => {
    const e = explainPaymentStatus(basePayment);
    expect(e.paid).toBe(true);
    expect(e.final).toBe(true);
    expect(e.summary).toMatch(/aprobado/i);
  });

  it("returns retryable=true for cc_rejected_bad_filled_security_code", () => {
    const e = explainPaymentStatus({
      ...basePayment,
      status: "rejected",
      status_detail: "cc_rejected_bad_filled_security_code",
    } as Payment);
    expect(e.paid).toBe(false);
    expect(e.final).toBe(true);
    expect(e.retryable).toBe(true);
    expect(e.summary).toMatch(/CVV/);
  });

  it("returns retryable=false for cc_rejected_blacklist", () => {
    const e = explainPaymentStatus({
      ...basePayment,
      status: "rejected",
      status_detail: "cc_rejected_blacklist",
    } as Payment);
    expect(e.retryable).toBe(false);
    expect(e.summary).toMatch(/blacklist/i);
  });

  it("flags pending_challenge with the 3DS hint", () => {
    const e = explainPaymentStatus({
      ...basePayment,
      status: "pending",
      status_detail: "pending_challenge",
    } as Payment);
    expect(e.summary).toMatch(/3DS/);
    expect(e.recommendedAction).toMatch(/analyze_payment_3ds/);
  });

  it("falls back to top-level status when status_detail unknown", () => {
    const e = explainPaymentStatus({
      ...basePayment,
      status: "in_process",
      status_detail: "some_new_unknown_code",
    } as Payment);
    expect(e.final).toBe(false);
    expect(e.summary).toMatch(/proceso/);
  });

  it("handles authorized (auth-only) status", () => {
    const e = explainPaymentStatus({
      ...basePayment,
      status: "authorized",
      status_detail: "pending_capture",
    } as Payment);
    expect(e.summary).toMatch(/autorizado/);
    expect(e.recommendedAction).toMatch(/capture_payment/);
  });
});
