/**
 * Unit tests for ROADMAP.md M2-4c's money-audit summarizers: mapping each
 * money-moving tool's OWN args/result/thrown-error shape into
 * `@ar-agents/treasury`'s common `MoneyAuditEvent`, then rendering it via
 * `formatMoneyAuditSummary`. Exercised directly against realistic shapes
 * `@ar-agents/wallet-cdp/tools`'s `wallet_transfer_usdc` and
 * `@ar-agents/treasury/tools`'s `treasury_offramp_convert` actually
 * return/throw — no live CDP/PSAV credentials needed.
 */

import { afterEach, describe, expect, it } from "vitest";
import { ArAgentsError } from "@ar-agents/core";
import { WalletCdpPolicyDeniedError, WalletCdpUpstreamError } from "@ar-agents/wallet-cdp";
import { formatMoneyAuditSummary } from "@ar-agents/treasury";
import {
  MONEY_AUDIT_SUMMARIZERS,
  OFFRAMP_CONVERT_TOOL_NAME,
  WALLET_CHECK_BALANCE_TOOL_NAME,
  WALLET_TRANSFER_TOOL_NAME,
  treasuryOfframpConvertSummarizer,
  walletCheckBalanceSummarizer,
  walletTransferUsdcSummarizer,
} from "../src/lib/money-audit-summarizers";

const args = { to: "0x1234567890123456789012345678901234567890", amountAtomic: "1000000", idempotencyKey: "k1" };

afterEach(() => {
  delete process.env.CDP_NETWORK;
});

describe("walletTransferUsdcSummarizer — crypto leg (wallet_transfer_usdc)", () => {
  it("registers under the exact tool name @ar-agents/wallet-cdp/tools ships", () => {
    expect(MONEY_AUDIT_SUMMARIZERS[WALLET_TRANSFER_TOOL_NAME]).toBe(walletTransferUsdcSummarizer);
  });

  it("maps an executed transfer to a structured, formatted summary", () => {
    const result = {
      available: true,
      status: "executed",
      receipt: { to: args.to, amountAtomic: args.amountAtomic, idempotencyKey: "k1", transactionHash: "0xtx1" },
    };
    const event = walletTransferUsdcSummarizer.onSuccess?.(args, result);
    expect(event).toMatchObject({
      leg: "crypto",
      kind: "transfer",
      asset: "USDC",
      amountAtomic: "1000000",
      outcome: "executed",
      ref: "0xtx1",
      provider: "base-sepolia",
    });
    expect(formatMoneyAuditSummary(event!)).toBe(
      "USDC 1.000000 -> 0x1234...7890 (base-sepolia) ejecutada, tx 0xtx1",
    );
  });

  it("respects CDP_NETWORK for the provider field", () => {
    process.env.CDP_NETWORK = "base";
    const result = { available: true, status: "executed", receipt: { transactionHash: "0xtx2" } };
    const event = walletTransferUsdcSummarizer.onSuccess?.(args, result);
    expect(event?.provider).toBe("base");
  });

  it("maps a deferred (above-threshold, awaiting approval) transfer, with no ref", () => {
    const result = { available: true, status: "deferred", toolName: WALLET_TRANSFER_TOOL_NAME };
    const event = walletTransferUsdcSummarizer.onSuccess?.(args, result);
    expect(event).toMatchObject({ outcome: "deferred" });
    expect(event?.ref).toBeUndefined();
    expect(formatMoneyAuditSummary(event!)).toBe(
      "USDC 1.000000 -> 0x1234...7890 (base-sepolia) diferida, pendiente de aprobacion",
    );
  });

  it("returns null for {available:false} (no wallet configured) — falls through to the generic line", () => {
    const result = { available: false, reason: "No CDP wallet configured for this society." };
    expect(walletTransferUsdcSummarizer.onSuccess?.(args, result)).toBeNull();
  });

  it("maps a CDP policy denial (thrown WalletCdpPolicyDeniedError) to outcome 'denied'", () => {
    const err = new WalletCdpPolicyDeniedError("transferUsdc: policy denied -- forbidden");
    const event = walletTransferUsdcSummarizer.onError?.(args, err);
    expect(event).toMatchObject({ outcome: "denied" });
    expect(formatMoneyAuditSummary(event!)).toBe(
      "USDC 1.000000 -> 0x1234...7890 (base-sepolia) denegada por politica",
    );
  });

  it("maps a CDP upstream error (thrown WalletCdpUpstreamError) to outcome 'failed'", () => {
    const err = new WalletCdpUpstreamError("transferUsdc: network blip");
    const event = walletTransferUsdcSummarizer.onError?.(args, err);
    expect(event).toMatchObject({ outcome: "failed" });
    expect(formatMoneyAuditSummary(event!)).toBe("USDC 1.000000 -> 0x1234...7890 (base-sepolia) fallida");
  });

  it("returns null for a plain validation error — not a money outcome, falls through generic", () => {
    const err = new ArAgentsError("Invalid amountAtomic: bad", { code: "validation_failed" });
    expect(walletTransferUsdcSummarizer.onError?.(args, err)).toBeNull();
  });

  it("returns null for a non-ArAgentsError throw", () => {
    expect(walletTransferUsdcSummarizer.onError?.(args, new Error("boom"))).toBeNull();
  });
});

describe("treasuryOfframpConvertSummarizer — fiat leg (treasury_offramp_convert)", () => {
  const convertArgs = { amountUsd: 100, operationRef: "obligacion-2026-07" };

  it("registers under the exact tool name @ar-agents/treasury/tools ships", () => {
    expect(MONEY_AUDIT_SUMMARIZERS[OFFRAMP_CONVERT_TOOL_NAME]).toBe(treasuryOfframpConvertSummarizer);
  });

  it("maps an executed conversion (OffRampReceipt shape) to a structured, formatted summary", () => {
    const result = { available: true, amountUsd: 100, arsReceived: 148500, rate: 1500, txId: "mem-offramp-1-100.00" };
    const event = treasuryOfframpConvertSummarizer.onSuccess?.(convertArgs, result);
    expect(event).toMatchObject({
      leg: "fiat",
      kind: "offramp_convert",
      asset: "USDC",
      amount: 100,
      counterAsset: "ARS",
      counterAmount: 148500,
      outcome: "executed",
      ref: "mem-offramp-1-100.00",
    });
    expect(formatMoneyAuditSummary(event!)).toBe(
      "USDC 100.00 -> ARS 148500.00 ejecutada, ref mem-offram...100.00",
    );
  });

  it("returns null for {available:false} (no off-ramp configured)", () => {
    const result = { available: false, reason: "No off-ramp configured." };
    expect(treasuryOfframpConvertSummarizer.onSuccess?.(convertArgs, result)).toBeNull();
  });

  it("maps a thrown convert() failure to outcome 'failed' using the tool's own args", () => {
    const event = treasuryOfframpConvertSummarizer.onError?.(convertArgs, new Error("PSAV timeout"));
    expect(event).toMatchObject({ leg: "fiat", kind: "offramp_convert", amount: 100, outcome: "failed" });
    expect(formatMoneyAuditSummary(event!)).toBe("USDC 100.00 fallida, ref obligacion-2026-07");
  });

  it("returns null when args don't even have a numeric amountUsd", () => {
    expect(treasuryOfframpConvertSummarizer.onError?.({}, new Error("x"))).toBeNull();
  });
});

describe("walletCheckBalanceSummarizer — crypto leg (wallet_check_balance, ROADMAP.md M2-4d)", () => {
  it("registers under the exact tool name @ar-agents/wallet-cdp/tools ships", () => {
    expect(MONEY_AUDIT_SUMMARIZERS[WALLET_CHECK_BALANCE_TOOL_NAME]).toBe(walletCheckBalanceSummarizer);
  });

  it("maps a detected deposit to a structured, formatted summary", () => {
    const result = {
      available: true,
      asset: "USDC",
      decimals: 6,
      address: "0xAA",
      network: "base-sepolia",
      previousAtomic: "1000000",
      currentAtomic: "4000000",
      deltaAtomic: "3000000",
      direction: "increase",
      firstCheck: false,
      depositDetected: true,
    };
    const event = walletCheckBalanceSummarizer.onSuccess?.({}, result);
    expect(event).toMatchObject({
      leg: "crypto",
      kind: "deposit",
      asset: "USDC",
      amountAtomic: "3000000",
      outcome: "executed",
      provider: "base-sepolia",
    });
    expect(formatMoneyAuditSummary(event!)).toBe("USDC 3.000000 recibido en la wallet (base-sepolia) ejecutada");
  });

  it("respects CDP_NETWORK for the provider field", () => {
    process.env.CDP_NETWORK = "base";
    const result = { available: true, direction: "increase", deltaAtomic: "1000000", depositDetected: true };
    const event = walletCheckBalanceSummarizer.onSuccess?.({}, result);
    expect(event?.provider).toBe("base");
  });

  it("returns null for {available:false} (no wallet configured)", () => {
    const result = { available: false, reason: "No CDP wallet configured for this society." };
    expect(walletCheckBalanceSummarizer.onSuccess?.({}, result)).toBeNull();
  });

  it("returns null on the FIRST check ever, even though the balance is positive (baseline, not a deposit)", () => {
    const result = {
      available: true,
      direction: "increase",
      deltaAtomic: "5000000",
      firstCheck: true,
      depositDetected: false,
    };
    expect(walletCheckBalanceSummarizer.onSuccess?.({}, result)).toBeNull();
  });

  it("returns null on no-change or a decrease — a plain read isn't a money event", () => {
    expect(
      walletCheckBalanceSummarizer.onSuccess?.({}, { available: true, direction: "none", depositDetected: false }),
    ).toBeNull();
    expect(
      walletCheckBalanceSummarizer.onSuccess?.(
        {},
        { available: true, direction: "decrease", depositDetected: false },
      ),
    ).toBeNull();
  });

  it("has no onError mapping — a balance-read failure is a generic failure, not a money outcome", () => {
    expect(walletCheckBalanceSummarizer.onError).toBeUndefined();
  });
});
