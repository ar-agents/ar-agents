import { describe, expect, it } from "vitest";
import { formatMoneyAuditSummary, type MoneyAuditEvent } from "../src/audit";

describe("formatMoneyAuditSummary — crypto leg", () => {
  const base: MoneyAuditEvent = {
    leg: "crypto",
    kind: "transfer",
    asset: "USDC",
    amountAtomic: "1000000",
    decimals: 6,
    counterparty: "0x1234567890123456789012345678901234567890",
    provider: "base-sepolia",
    outcome: "executed",
  };

  it("renders an executed transfer with the atomic amount as a human decimal, truncated address, and tx", () => {
    const summary = formatMoneyAuditSummary({
      ...base,
      ref: "0x9f95e747516c72be2e759279e92a6cbba82e0fa317832eef6c754237ac15fd7f",
    });
    expect(summary).toBe(
      "USDC 1.000000 -> 0x1234...7890 (base-sepolia) ejecutada, tx 0x9f95e7...15fd7f",
    );
  });

  it("renders a deferred transfer (above-threshold, awaiting approval) with no tx", () => {
    const summary = formatMoneyAuditSummary({
      ...base,
      amountAtomic: "50000000",
      outcome: "deferred",
    });
    expect(summary).toBe("USDC 50.000000 -> 0x1234...7890 (base-sepolia) diferida, pendiente de aprobacion");
  });

  it("renders a policy-denied transfer", () => {
    const summary = formatMoneyAuditSummary({
      ...base,
      amountAtomic: "999000000",
      outcome: "denied",
    });
    expect(summary).toBe("USDC 999.000000 -> 0x1234...7890 (base-sepolia) denegada por politica");
  });

  it("renders an upstream failure", () => {
    const summary = formatMoneyAuditSummary({ ...base, outcome: "failed" });
    expect(summary).toBe("USDC 1.000000 -> 0x1234...7890 (base-sepolia) fallida");
  });

  it("defaults decimals to 6 when omitted", () => {
    const { decimals: _decimals, ...rest } = base;
    const summary = formatMoneyAuditSummary(rest);
    expect(summary).toContain("USDC 1.000000");
  });

  it("falls back gracefully when counterparty/ref are absent", () => {
    const summary = formatMoneyAuditSummary({
      leg: "crypto",
      kind: "transfer",
      asset: "USDC",
      amountAtomic: "1000000",
      outcome: "executed",
    });
    expect(summary).toBe("USDC 1.000000 -> destinatario desconocido ejecutada");
  });

  it("never throws on a non-numeric amountAtomic; echoes it verbatim", () => {
    const summary = formatMoneyAuditSummary({ ...base, amountAtomic: "not-a-number" });
    expect(summary).toContain("USDC not-a-number ->");
  });

  it("caps the summary at 280 chars", () => {
    const summary = formatMoneyAuditSummary({
      ...base,
      counterparty: "0x" + "a".repeat(500),
      provider: "p".repeat(500),
    });
    expect(summary.length).toBeLessThanOrEqual(280);
  });
});

describe("formatMoneyAuditSummary — crypto leg (deposit, ROADMAP.md M2-4d)", () => {
  const base: MoneyAuditEvent = {
    leg: "crypto",
    kind: "deposit",
    asset: "USDC",
    amountAtomic: "5000000",
    decimals: 6,
    provider: "base-sepolia",
    outcome: "executed",
  };

  it("renders a detected deposit without a counterparty (incoming, not a send)", () => {
    const summary = formatMoneyAuditSummary(base);
    expect(summary).toBe("USDC 5.000000 recibido en la wallet (base-sepolia) ejecutada");
  });

  it("never prints 'destinatario desconocido' for a deposit (that phrasing is transfer-only)", () => {
    const summary = formatMoneyAuditSummary(base);
    expect(summary).not.toContain("destinatario desconocido");
    expect(summary).not.toContain("->");
  });

  it("includes the tx ref when known", () => {
    const summary = formatMoneyAuditSummary({ ...base, ref: "0x9f95e747516c72be2e759279e92a6cbba82e0fa317832eef6c754237ac15fd7f" });
    expect(summary).toBe(
      "USDC 5.000000 recibido en la wallet (base-sepolia) ejecutada, tx 0x9f95e7...15fd7f",
    );
  });

  it("caps the summary at 280 chars", () => {
    const summary = formatMoneyAuditSummary({ ...base, provider: "p".repeat(500) });
    expect(summary.length).toBeLessThanOrEqual(280);
  });
});

describe("formatMoneyAuditSummary — fiat leg (offramp_convert)", () => {
  const base: MoneyAuditEvent = {
    leg: "fiat",
    kind: "offramp_convert",
    asset: "USDC",
    amount: 100,
    counterAsset: "ARS",
    counterAmount: 148500,
    ref: "mem-offramp-obligacion-2026-07-100.00",
    outcome: "executed",
  };

  it("renders an executed conversion with both sides and the provider txId", () => {
    const summary = formatMoneyAuditSummary(base);
    expect(summary).toBe(
      "USDC 100.00 -> ARS 148500.00 ejecutada, ref mem-offram...100.00",
    );
  });

  it("renders a failed conversion with only the source amount (no settlement figure yet)", () => {
    const summary = formatMoneyAuditSummary({
      leg: "fiat",
      kind: "offramp_convert",
      asset: "USDC",
      amount: 100,
      ref: "obligacion-2026-07",
      outcome: "failed",
    });
    expect(summary).toBe("USDC 100.00 fallida, ref obligacion-2026-07");
  });

  it("includes the PSAV name as the provider when known", () => {
    const summary = formatMoneyAuditSummary({ ...base, provider: "Manteca" });
    expect(summary).toContain("via Manteca");
  });

  it("caps the summary at 280 chars", () => {
    const summary = formatMoneyAuditSummary({ ...base, ref: "r".repeat(500) });
    expect(summary.length).toBeLessThanOrEqual(280);
  });
});
