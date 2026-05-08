// Smoke tests for the Vercel AI SDK 6 tools wrapper.
// Exercises that each tool runs end-to-end with realistic inputs (real keys
// + real mandates) and that misconfiguration returns helpful errors.

import { describe, it, expect } from "vitest";
import { ap2Tools, type Ap2ToolName } from "../src/ai-sdk";
import {
  generateAp2KeyPair,
  importPublicJwk,
  signCheckoutJwt,
  computeCheckoutHash,
  issueClosedCheckoutMandate,
  issueClosedPaymentMandate,
} from "../src";

const sampleCheckoutPayload = {
  order_id: "ord_aisdk",
  merchant: { id: "merchant_aisdk", name: "AI SDK Test" },
  line_items: [
    {
      id: "li_1",
      product: { id: "p1", title: "T", price: 100, currency: "USD" },
      quantity: 1,
    },
  ],
  total_price: 100,
  currency: "USD",
};

interface ToolLike {
  execute: (input: unknown, ctx: { toolCallId: string; messages: unknown[] }) => Promise<unknown>;
}

function getTool(tools: Record<string, unknown>, name: Ap2ToolName): ToolLike {
  const t = tools[name] as ToolLike | undefined;
  if (!t) throw new Error(`Tool ${name} not found`);
  return t;
}

const dummyCtx = { toolCallId: "test", messages: [] };

describe("ap2Tools — verify_closed_checkout_mandate", () => {
  it("returns ok with sdHash + checkout + closed", async () => {
    const merchant = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");

    const checkoutJwt = await signCheckoutJwt(sampleCheckoutPayload, merchant.privateKey);
    const checkoutHash = await computeCheckoutHash(checkoutJwt);
    const presentation = await issueClosedCheckoutMandate({
      mandate: {
        vct: "mandate.checkout.1",
        checkout_jwt: checkoutJwt,
        checkout_hash: checkoutHash,
      },
      signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
    });

    const tools = ap2Tools({
      agentPublicJwk: agent.publicJwk,
      merchantPublicJwk: merchant.publicJwk,
    });
    const result = (await getTool(tools, "verify_closed_checkout_mandate").execute(
      { presentation },
      dummyCtx,
    )) as { ok: boolean; sdHash?: string; checkout?: { order_id: string } };
    expect(result.ok).toBe(true);
    expect(result.sdHash).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.checkout?.order_id).toBe("ord_aisdk");
  });

  it("returns misconfiguration error when keys missing", async () => {
    const tools = ap2Tools({});
    const result = (await getTool(tools, "verify_closed_checkout_mandate").execute(
      { presentation: "irrelevant" },
      dummyCtx,
    )) as { ok: boolean; code: string };
    expect(result.ok).toBe(false);
    expect(result.code).toBe("tool_misconfigured");
  });
});

describe("ap2Tools — verify_closed_payment_mandate", () => {
  it("returns ok when transaction_id matches", async () => {
    const agent = await generateAp2KeyPair("ES256");
    const presentation = await issueClosedPaymentMandate({
      mandate: {
        vct: "mandate.payment.1",
        transaction_id: "abc-checkout-hash",
        payee: { id: "merchant_x" },
        payment_amount: { amount: 1000, currency: "USD" },
        payment_instrument: { id: "card_1", type: "card" },
      },
      signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
    });
    const tools = ap2Tools({ agentPublicJwk: agent.publicJwk });
    const result = (await getTool(tools, "verify_closed_payment_mandate").execute(
      { presentation, expectedTransactionId: "abc-checkout-hash" },
      dummyCtx,
    )) as { ok: boolean; sdHash?: string };
    expect(result.ok).toBe(true);
    expect(result.sdHash).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns failure on transaction_id mismatch", async () => {
    const agent = await generateAp2KeyPair("ES256");
    const presentation = await issueClosedPaymentMandate({
      mandate: {
        vct: "mandate.payment.1",
        transaction_id: "real_hash",
        payee: { id: "x" },
        payment_amount: { amount: 100, currency: "USD" },
        payment_instrument: { id: "c", type: "card" },
      },
      signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
    });
    const tools = ap2Tools({ agentPublicJwk: agent.publicJwk });
    const result = (await getTool(tools, "verify_closed_payment_mandate").execute(
      { presentation, expectedTransactionId: "DIFFERENT_hash" },
      dummyCtx,
    )) as { ok: boolean; code: string };
    expect(result.ok).toBe(false);
    expect(result.code).toBe("invalid_mandate");
  });
});

describe("ap2Tools — build_checkout_receipt", () => {
  it("signs a receipt JWT round-trip", async () => {
    const merchant = await generateAp2KeyPair("ES256");
    const tools = ap2Tools({
      merchantPrivateKey: merchant.privateKey,
      defaultIssuer: "merchant_x",
    });
    const result = (await getTool(tools, "build_checkout_receipt").execute(
      { sdHash: "sd-hash-x", orderId: "ord_y" },
      dummyCtx,
    )) as { ok: boolean; jwt?: string };
    expect(result.ok).toBe(true);
    expect(result.jwt).toMatch(/^eyJ.+\..+\..+$/);

    // Verify the receipt round-trips.
    const merchantPub = await importPublicJwk(merchant.publicJwk, "ES256");
    const { verifyCheckoutReceipt } = await import("../src");
    const verified = await verifyCheckoutReceipt(result.jwt!, merchantPub, {
      expectedIssuer: "merchant_x",
      expectedReference: "sd-hash-x",
    });
    expect(verified.order_id).toBe("ord_y");
  });

  it("returns misconfiguration error without merchantPrivateKey", async () => {
    const tools = ap2Tools({ defaultIssuer: "x" });
    const result = (await getTool(tools, "build_checkout_receipt").execute(
      { sdHash: "x", orderId: "y" },
      dummyCtx,
    )) as { ok: boolean; code: string };
    expect(result.ok).toBe(false);
    expect(result.code).toBe("tool_misconfigured");
  });
});

describe("ap2Tools — build_payment_receipt", () => {
  it("signs a receipt JWT round-trip with PSP confirmation", async () => {
    const mpp = await generateAp2KeyPair("ES256");
    const tools = ap2Tools({
      mppPrivateKey: mpp.privateKey,
      defaultIssuer: "mpp.test",
    });
    const result = (await getTool(tools, "build_payment_receipt").execute(
      {
        sdHash: "sd-hash-y",
        paymentId: "PAY-XYZ",
        pspConfirmationId: "psp-1",
      },
      dummyCtx,
    )) as { ok: boolean; jwt?: string };
    expect(result.ok).toBe(true);

    const mppPub = await importPublicJwk(mpp.publicJwk, "ES256");
    const { verifyPaymentReceipt } = await import("../src");
    const verified = await verifyPaymentReceipt(result.jwt!, mppPub);
    expect(verified.payment_id).toBe("PAY-XYZ");
    expect(verified.psp_confirmation_id).toBe("psp-1");
  });
});

describe("ap2Tools — compute_checkout_hash", () => {
  it("computes hash for a real checkout_jwt", async () => {
    const merchant = await generateAp2KeyPair("ES256");
    const checkoutJwt = await signCheckoutJwt(sampleCheckoutPayload, merchant.privateKey);
    const tools = ap2Tools({});
    const result = (await getTool(tools, "compute_checkout_hash").execute(
      { checkoutJwt },
      dummyCtx,
    )) as { ok: boolean; checkoutHash: string };
    expect(result.ok).toBe(true);
    expect(result.checkoutHash).toMatch(/^[A-Za-z0-9_-]+$/);
    // Cross-check against the lib's own implementation.
    const expected = await computeCheckoutHash(checkoutJwt);
    expect(result.checkoutHash).toBe(expected);
  });
});

describe("ap2Tools — inspect_mandate", () => {
  it("decodes a mandate without verification", async () => {
    const merchant = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");
    const checkoutJwt = await signCheckoutJwt(sampleCheckoutPayload, merchant.privateKey);
    const checkoutHash = await computeCheckoutHash(checkoutJwt);
    const presentation = await issueClosedCheckoutMandate({
      mandate: {
        vct: "mandate.checkout.1",
        checkout_jwt: checkoutJwt,
        checkout_hash: checkoutHash,
      },
      signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
    });
    const tools = ap2Tools({});
    const result = (await getTool(tools, "inspect_mandate").execute(
      { presentation },
      dummyCtx,
    )) as {
      ok: boolean;
      header?: { alg?: string };
      disclosureCount?: number;
    };
    expect(result.ok).toBe(true);
    expect(result.header?.alg).toBe("ES256");
    expect(result.disclosureCount).toBeGreaterThan(0);
  });

  it("returns parse_failed on garbage input", async () => {
    const tools = ap2Tools({});
    const result = (await getTool(tools, "inspect_mandate").execute(
      { presentation: "garbage-not-an-sdjwt" },
      dummyCtx,
    )) as { ok: boolean; code: string };
    expect(result.ok).toBe(false);
    expect(result.code).toBe("parse_failed");
  });
});

describe("ap2Tools — descriptions override", () => {
  it("respects custom descriptions", () => {
    const tools = ap2Tools({
      descriptions: {
        verify_closed_checkout_mandate: "Custom description for testing",
      },
    });
    const t = tools["verify_closed_checkout_mandate"] as { description: string };
    expect(t.description).toBe("Custom description for testing");
  });
});
