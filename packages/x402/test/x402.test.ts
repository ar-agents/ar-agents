/**
 * x402 intake tests. The signature path uses REAL EIP-712 signing (viem) so we
 * prove the crypto end-to-end, not just the wire shape: sign an EIP-3009
 * authorization, then assert local verification recovers the signer. Every
 * ErrorReason branch + the facilitators + the receiver are covered. No network.
 */

import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildPaymentRequirements,
  build402Body,
  decodePaymentHeader,
  decodeSettlementHeader,
  encodePaymentHeader,
  encodeSettlementHeader,
  HostedFacilitatorClient,
  InMemoryFacilitator,
  signExactPayment,
  usdcToAtomic,
  atomicToUsdc,
  verifyPayment,
  X402Receiver,
  type PaymentPayload,
  type ResourcePrice,
} from "../src/index";

// Deterministic anvil test key -> 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
const TEST_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const account = privateKeyToAccount(TEST_KEY);
const PAYER = account.address;
const PAY_TO = getAddress("0x209693Bc6afc0C5328bA36FaF03C514EF312287C");
const FIXED_NOW = 1_750_000_000_000;
const NONCE = ("0x" + "11".repeat(32)) as `0x${string}`;

const price: ResourcePrice = {
  usdc: 0.01,
  network: "base-sepolia",
  payTo: PAY_TO,
  resource: "https://api.sociedad.ar/weather",
};
const reqs = buildPaymentRequirements(price);

function signed(now = FIXED_NOW, nonce = NONCE) {
  return signExactPayment({ account, requirements: reqs, now: () => now, nonce });
}

describe("requirements + units", () => {
  it("builds 402 requirements with atomic amount + USDC asset/domain", () => {
    expect(reqs.maxAmountRequired).toBe("10000"); // 0.01 USDC, 6 dp
    expect(reqs.scheme).toBe("exact");
    expect(reqs.payTo).toBe(PAY_TO);
    expect(reqs.asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    expect(reqs.extra).toEqual({ name: "USDC", version: "2" });
  });
  it("build402Body wraps the accepts array", () => {
    const body = build402Body(price);
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toHaveLength(1);
    expect(body.accepts[0].maxAmountRequired).toBe("10000");
  });
  it("atomic<->usdc round-trips", () => {
    expect(usdcToAtomic(0.01)).toBe("10000");
    expect(atomicToUsdc("10000")).toBe(0.01);
  });
});

describe("codec round-trip", () => {
  it("encodes + decodes an X-PAYMENT header", async () => {
    const payload = await signed();
    const header = encodePaymentHeader(payload);
    expect(decodePaymentHeader(header)).toEqual(payload);
  });
  it("encodes + decodes an X-PAYMENT-RESPONSE header", () => {
    const settle = { success: true, transaction: NONCE, network: "base-sepolia", payer: PAYER };
    expect(decodeSettlementHeader(encodeSettlementHeader(settle))).toEqual(settle);
  });
});

describe("verifyPayment — real EIP-712", () => {
  it("accepts a correctly signed payment and recovers the payer", async () => {
    const v = await verifyPayment(await signed(), reqs, { now: () => FIXED_NOW });
    expect(v.isValid).toBe(true);
    expect(v.payer && getAddress(v.payer)).toBe(PAYER);
  });

  it("rejects a corrupted signature (invalid_exact_evm_payload_signature)", async () => {
    const p = await signed();
    const bad: PaymentPayload = {
      ...p,
      payload: { ...p.payload, signature: (p.payload.signature.slice(0, -4) + "dead") as `0x${string}` },
    };
    const v = await verifyPayment(bad, reqs, { now: () => FIXED_NOW });
    expect(v.isValid).toBe(false);
    expect(v.invalidReason).toBe("invalid_exact_evm_payload_signature");
  });

  it("rejects when value < required (authorization_value)", async () => {
    const v = await verifyPayment(await signed(), { ...reqs, maxAmountRequired: "20000" }, {
      now: () => FIXED_NOW,
    });
    expect(v.invalidReason).toBe("invalid_exact_evm_payload_authorization_value");
  });

  it("rejects a recipient mismatch", async () => {
    const v = await verifyPayment(await signed(), { ...reqs, payTo: getAddress("0x0000000000000000000000000000000000000001") }, {
      now: () => FIXED_NOW,
    });
    expect(v.invalidReason).toBe("invalid_exact_evm_payload_recipient_mismatch");
  });

  it("rejects a network mismatch", async () => {
    const p = await signed();
    const v = await verifyPayment({ ...p, network: "base" }, reqs, { now: () => FIXED_NOW });
    expect(v.invalidReason).toBe("invalid_network");
  });

  it("rejects an expired authorization (payment_expired)", async () => {
    const v = await verifyPayment(await signed(), reqs, { now: () => FIXED_NOW + 3_600_000 });
    expect(v.invalidReason).toBe("payment_expired");
  });

  it("rejects a not-yet-valid authorization (valid_after)", async () => {
    const v = await verifyPayment(await signed(), reqs, { now: () => FIXED_NOW - 3_600_000 });
    expect(v.invalidReason).toBe("invalid_exact_evm_payload_authorization_valid_after");
  });

  it("enforces an optional balance check", async () => {
    const poor = await verifyPayment(await signed(), reqs, {
      now: () => FIXED_NOW,
      balanceReader: async () => 5n,
    });
    expect(poor.invalidReason).toBe("insufficient_funds");
    const rich = await verifyPayment(await signed(), reqs, {
      now: () => FIXED_NOW,
      balanceReader: async () => 10_000_000n,
    });
    expect(rich.isValid).toBe(true);
  });
});

describe("InMemoryFacilitator", () => {
  it("verifies + settles a good payment, then blocks the replay", async () => {
    const fac = new InMemoryFacilitator({ now: () => FIXED_NOW });
    const payload = await signed();
    const s1 = await fac.settle(payload, reqs);
    expect(s1.success).toBe(true);
    expect(s1.transaction).toBe(NONCE);
    const s2 = await fac.settle(payload, reqs); // same nonce
    expect(s2.success).toBe(false);
    expect(s2.error).toBe("duplicate_settlement");
  });
  it("reports supported kinds", async () => {
    const kinds = await new InMemoryFacilitator().supported();
    expect(kinds).toContainEqual({ scheme: "exact", network: "base" });
  });
});

describe("HostedFacilitatorClient", () => {
  it("POSTs /verify + /settle with the documented body and parses the response", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(init.body as string) });
      const path = String(url);
      if (path.endsWith("/verify")) return new Response(JSON.stringify({ isValid: true, payer: PAYER }));
      return new Response(JSON.stringify({ success: true, transaction: "0xabc", network: "base-sepolia", payer: PAYER }));
    }) as unknown as typeof fetch;
    const fac = new HostedFacilitatorClient({ url: "https://fac.test", fetchImpl });
    const payload = await signed();
    const v = await fac.verify(payload, reqs);
    const s = await fac.settle(payload, reqs);
    expect(v.isValid).toBe(true);
    expect(s.transaction).toBe("0xabc");
    expect(calls[0].url).toBe("https://fac.test/verify");
    expect(calls[0].body).toMatchObject({ x402Version: 1, paymentPayload: { scheme: "exact" } });
    expect(calls[1].url).toBe("https://fac.test/settle");
  });
  it("maps a non-2xx to unexpected_settle_error", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const fac = new HostedFacilitatorClient({ url: "https://fac.test", fetchImpl });
    const s = await fac.settle(await signed(), reqs);
    expect(s.success).toBe(false);
    expect(s.error).toBe("unexpected_settle_error");
  });
  // Regression: the LIVE x402.org facilitator's dialect, captured from a real Base
  // Sepolia probe (2026-06-24). It carries the failure cause in `errorReason` (the
  // verify path uses a facilitator-specific reason; the settle path returns the raw
  // on-chain revert string), NOT in `error`. The adapter must surface that cause,
  // not flatten it to "unexpected_*", or a failed live settle becomes undiagnosable.
  it("normalizes the live facilitator's verify dialect (errorReason + payer)", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          isValid: false,
          invalidReason: "invalid_exact_evm_insufficient_balance",
          payer: PAYER,
        }),
      )) as unknown as typeof fetch;
    const fac = new HostedFacilitatorClient({ url: "https://fac.test", fetchImpl });
    const v = await fac.verify(await signed(), reqs);
    expect(v.isValid).toBe(false);
    expect(v.invalidReason).toBe("invalid_exact_evm_insufficient_balance");
    expect(v.payer).toBe(PAYER);
  });
  it("surfaces the live facilitator's settle revert (errorReason, not error)", async () => {
    const revert = "transferWithAuthorization reverted: ERC20: transfer amount exceeds balance";
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ success: false, errorReason: revert }))) as unknown as typeof fetch;
    const fac = new HostedFacilitatorClient({ url: "https://fac.test", fetchImpl });
    const s = await fac.settle(await signed(), reqs);
    expect(s.success).toBe(false);
    expect(s.error).toBe(revert); // NOT swallowed to "unexpected_settle_error"
  });
});

describe("X402Receiver", () => {
  const receiver = new X402Receiver({
    facilitator: new InMemoryFacilitator({ now: () => FIXED_NOW }),
    now: () => FIXED_NOW,
  });

  it("returns a 402 with requirements when unpaid", () => {
    const { status, body } = receiver.paymentRequired(price);
    expect(status).toBe(402);
    expect(body.accepts[0].maxAmountRequired).toBe("10000");
  });

  it("processes a real payment end-to-end and yields a treasury-ready receipt", async () => {
    const header = encodePaymentHeader(await signed());
    const r = await receiver.process(header, reqs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.receipt.amountUsdc).toBe(0.01);
    expect(getAddress(r.receipt.payer)).toBe(PAYER);
    expect(r.receipt.txId).toBe(NONCE);
    expect(r.headerName).toBe("X-PAYMENT-RESPONSE");
    // the settlement header decodes back to a success receipt
    expect(decodeSettlementHeader(r.headerValue).success).toBe(true);
  });

  it("rejects a missing header", async () => {
    const r = await receiver.process(null, reqs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_payload");
  });

  it("rejects a malformed header", async () => {
    const r = await receiver.process("!!!not-base64-json!!!", reqs);
    expect(r.ok).toBe(false);
  });

  it("propagates a verify failure as the reason", async () => {
    const header = encodePaymentHeader(await signed());
    const r = await receiver.process(header, { ...reqs, maxAmountRequired: "999999" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_exact_evm_payload_authorization_value");
  });
});
