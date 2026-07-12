/**
 * Unit tests for the unified signed audit log (ROADMAP.md M2-4c): both the
 * crypto leg (a wallet-cdp-shaped TransferReceipt) and the fiat leg (an
 * OffRampReceipt) append to the SAME hash-chained, HMAC-signed log with one
 * common schema. All data below is fictional (test fixtures only).
 */

import { describe, expect, it } from "vitest";
import {
  appendWalletTransfer,
  appendOffRampConversion,
  verifyAuditChain,
  GENESIS_PREV_HASH,
  USDC_DECIMALS,
  TreasuryAuditLog,
  type TreasuryAuditEntry,
  type WalletTransferReceiptLike,
} from "../src/audit";
import type { OffRampReceipt } from "../src/index";

const SECRET = "test-secret-do-not-use-in-prod";
const T0 = "2026-07-12T00:00:00.000Z";
const T1 = "2026-07-12T00:05:00.000Z";

const walletReceipt: WalletTransferReceiptLike = {
  to: "0x1111111111111111111111111111111111111111",
  amountAtomic: "1500000", // 1.5 USDC at 6 decimals
  transactionHash: "0xdeadbeef",
  idempotencyKey: "wallet-idem-001",
};

const offrampReceiptWithDeposit: OffRampReceipt = {
  amountUsd: 100,
  arsReceived: 99_000,
  rate: 990,
  txId: "mem-offramp-001",
  depositAddress: "0x2222222222222222222222222222222222222222",
};

const offrampReceiptNoDeposit: OffRampReceipt = {
  amountUsd: 50,
  arsReceived: 49_500,
  rate: 990,
  txId: "mem-offramp-002",
};

describe("appendWalletTransfer + appendOffRampConversion: shared chain", () => {
  it("produces seq 0/1, correct legs, and a linked prevHash", async () => {
    const e0 = await appendWalletTransfer(null, walletReceipt, { secret: SECRET, at: T0 });
    const e1 = await appendOffRampConversion(e0, offrampReceiptWithDeposit, {
      secret: SECRET,
      at: T1,
      externalId: "offramp-ext-001",
    });

    expect(e0.seq).toBe(0);
    expect(e0.leg).toBe("wallet_transfer");
    expect(e0.prevHash).toBe(GENESIS_PREV_HASH);

    expect(e1.seq).toBe(1);
    expect(e1.leg).toBe("offramp_conversion");
    expect(e1.prevHash).toBe(e0.hmac);
  });
});

describe("common schema: wallet leg", () => {
  it("derives amountUsd from amountAtomic, counterparty from `to`, no ars/rate", async () => {
    const e = await appendWalletTransfer(null, walletReceipt, { secret: SECRET, at: T0 });
    expect(e.amountUsd).toBeCloseTo(1.5, 10);
    expect(e.counterparty).toBe(walletReceipt.to);
    expect(e.arsReceived).toBeUndefined();
    expect(e.rate).toBeUndefined();
    expect(e.txId).toBe(walletReceipt.transactionHash);
    expect(e.idempotencyKey).toBe(walletReceipt.idempotencyKey);
    expect(e.receipt).toEqual(walletReceipt);
  });

  it("uses idempotencyKey as txId when transactionHash is absent", async () => {
    const noHash: WalletTransferReceiptLike = {
      to: "0x3333333333333333333333333333333333333333",
      amountAtomic: "2000000",
      idempotencyKey: "wallet-idem-002",
    };
    const e = await appendWalletTransfer(null, noHash, { secret: SECRET, at: T0 });
    expect(e.txId).toBe("wallet-idem-002");
  });

  it("respects a custom decimals override", async () => {
    const e = await appendWalletTransfer(null, { ...walletReceipt, amountAtomic: "150" }, {
      secret: SECRET,
      at: T0,
      decimals: 2,
    });
    expect(e.amountUsd).toBeCloseTo(1.5, 10);
    expect(USDC_DECIMALS).toBe(6);
  });
});

describe("common schema: offramp leg", () => {
  it("carries amountUsd/arsReceived/rate from the receipt and counterparty = depositAddress", async () => {
    const e = await appendOffRampConversion(null, offrampReceiptWithDeposit, {
      secret: SECRET,
      at: T0,
    });
    expect(e.amountUsd).toBe(offrampReceiptWithDeposit.amountUsd);
    expect(e.arsReceived).toBe(offrampReceiptWithDeposit.arsReceived);
    expect(e.rate).toBe(offrampReceiptWithDeposit.rate);
    expect(e.counterparty).toBe(offrampReceiptWithDeposit.depositAddress);
    expect(e.txId).toBe(offrampReceiptWithDeposit.txId);
  });

  it("leaves counterparty undefined when depositAddress is absent (Manteca-style)", async () => {
    const e = await appendOffRampConversion(null, offrampReceiptNoDeposit, {
      secret: SECRET,
      at: T0,
    });
    expect(e.counterparty).toBeUndefined();
  });
});

describe("idempotencyKey mapping", () => {
  it("wallet leg uses receipt.idempotencyKey", async () => {
    const e = await appendWalletTransfer(null, walletReceipt, { secret: SECRET, at: T0 });
    expect(e.idempotencyKey).toBe(walletReceipt.idempotencyKey);
  });

  it("offramp leg uses opts.externalId when given", async () => {
    const e = await appendOffRampConversion(null, offrampReceiptWithDeposit, {
      secret: SECRET,
      at: T0,
      externalId: "explicit-external-id",
    });
    expect(e.idempotencyKey).toBe("explicit-external-id");
  });

  it("offramp leg falls back to receipt.txId when externalId is not given", async () => {
    const e = await appendOffRampConversion(null, offrampReceiptWithDeposit, {
      secret: SECRET,
      at: T0,
    });
    expect(e.idempotencyKey).toBe(offrampReceiptWithDeposit.txId);
  });
});

describe("verifyAuditChain", () => {
  it("returns valid:true, brokenAt:null for an untampered chain", async () => {
    const e0 = await appendWalletTransfer(null, walletReceipt, { secret: SECRET, at: T0 });
    const e1 = await appendOffRampConversion(e0, offrampReceiptWithDeposit, {
      secret: SECRET,
      at: T1,
      externalId: "offramp-ext-001",
    });
    const result = await verifyAuditChain([e0, e1], SECRET);
    expect(result).toEqual({ valid: true, brokenAt: null });
  });

  it("detects tampering: a mutated field without re-signing", async () => {
    const e0 = await appendWalletTransfer(null, walletReceipt, { secret: SECRET, at: T0 });
    const e1 = await appendOffRampConversion(e0, offrampReceiptWithDeposit, {
      secret: SECRET,
      at: T1,
      externalId: "offramp-ext-001",
    });
    const tampered: TreasuryAuditEntry = { ...e1, amountUsd: 999_999 };
    const result = await verifyAuditChain([e0, tampered], SECRET);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("detects tampering: a mutated embedded receipt without re-signing", async () => {
    const e0 = await appendWalletTransfer(null, walletReceipt, { secret: SECRET, at: T0 });
    const tampered: TreasuryAuditEntry = {
      ...e0,
      receipt: { ...(e0.receipt as WalletTransferReceiptLike), amountAtomic: "999999999" },
    };
    const result = await verifyAuditChain([tampered], SECRET);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });

  it("detects a broken chain link (prevHash swapped/replaced)", async () => {
    const e0 = await appendWalletTransfer(null, walletReceipt, { secret: SECRET, at: T0 });
    const e1 = await appendOffRampConversion(e0, offrampReceiptWithDeposit, {
      secret: SECRET,
      at: T1,
      externalId: "offramp-ext-001",
    });
    const brokenLink: TreasuryAuditEntry = { ...e1, prevHash: "not-the-real-prev-hash" };
    const result = await verifyAuditChain([e0, brokenLink], SECRET);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("detects a wrong seq", async () => {
    const e0 = await appendWalletTransfer(null, walletReceipt, { secret: SECRET, at: T0 });
    const wrongSeq: TreasuryAuditEntry = { ...e0, seq: 5 };
    const result = await verifyAuditChain([wrongSeq], SECRET);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });
});

describe("TreasuryAuditLog convenience class", () => {
  it("records both legs in order, verifies, and entries() is a copy", async () => {
    const log = new TreasuryAuditLog(SECRET);
    const e0 = await log.recordWalletTransfer(walletReceipt, T0);
    const e1 = await log.recordOffRampConversion(offrampReceiptWithDeposit, T1, "offramp-ext-001");

    const entries = log.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual(e0);
    expect(entries[1]).toEqual(e1);

    const verified = await log.verify();
    expect(verified).toEqual({ valid: true, brokenAt: null });

    // Mutating the returned array must not affect the log's internal state.
    (entries as TreasuryAuditEntry[]).pop();
    expect(log.entries()).toHaveLength(2);
  });
});

describe("determinism", () => {
  it("signing the same inputs twice yields the same hmac", async () => {
    const a = await appendWalletTransfer(null, walletReceipt, { secret: SECRET, at: T0 });
    const b = await appendWalletTransfer(null, walletReceipt, { secret: SECRET, at: T0 });
    expect(a.hmac).toBe(b.hmac);
  });

  it("a different secret yields a different hmac", async () => {
    const a = await appendWalletTransfer(null, walletReceipt, { secret: SECRET, at: T0 });
    const b = await appendWalletTransfer(null, walletReceipt, { secret: "different-secret", at: T0 });
    expect(a.hmac).not.toBe(b.hmac);
  });
});
