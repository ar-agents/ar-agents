/**
 * Tests for the `@ar-agents/mercadopago/testing` subpath. Validates that the
 * factories produce shapes our schemas accept and that MockMercadoPagoClient
 * round-trips through create/get/cancel like a real client.
 */
import { describe, it, expect } from "vitest";

import {
  mockPayment,
  mockPreapproval,
  mockSubscriptionPayment,
  mockPreference,
  mockRefund,
  mockCustomer,
  mockWebhookHeaders,
  mockSignedWebhook,
  MockMercadoPagoClient,
  MockNotImplementedError,
} from "../src/testing";
import { verifyWebhookSignature } from "../src/webhook";

describe("testing — factories", () => {
  it("mockPayment defaults to an approved $1000 sale", () => {
    const p = mockPayment();
    expect(p.status).toBe("approved");
    expect(p.transaction_amount).toBe(1000);
    expect(p.currency_id).toBe("ARS");
    expect(p.id).toMatch(/^mock-/);
  });

  it("mockPayment respects overrides", () => {
    const p = mockPayment({ status: "rejected", transaction_amount: 5000 });
    expect(p.status).toBe("rejected");
    expect(p.transaction_amount).toBe(5000);
  });

  it("mockPreapproval has init_point + auto_recurring", () => {
    const sub = mockPreapproval();
    expect(sub.init_point).toContain("preapproval_id=");
    expect(sub.auto_recurring?.frequency_type).toBe("months");
  });

  it("mockSubscriptionPayment has preapproval_id", () => {
    const sp = mockSubscriptionPayment();
    expect(sp.preapproval_id).toMatch(/^mock-/);
  });

  it("mockPreference has both init_point and sandbox_init_point", () => {
    const pref = mockPreference();
    expect(pref.init_point).toContain("checkout/v1/redirect");
    expect(pref.sandbox_init_point).toContain("sandbox.mercadopago");
  });

  it("mockRefund + mockCustomer are well-formed", () => {
    expect(mockRefund().status).toBe("approved");
    expect(mockCustomer().email).toBe("buyer@example.com");
  });
});

describe("testing — mockSignedWebhook", () => {
  it("produces a signature that verifyWebhookSignature accepts", async () => {
    const secret = "test-secret-1234567890";
    const { headers, searchParams } = await mockSignedWebhook({
      topic: "payment",
      dataId: "abc123",
      secret,
    });

    const ok = await verifyWebhookSignature({
      requestId: headers.get("x-request-id"),
      dataId: searchParams.get("data.id")!,
      signatureHeader: headers.get("x-signature"),
      secret,
    });

    expect(ok).toBe(true);
  });

  it("rejects when the secret doesn't match", async () => {
    const { headers, searchParams } = await mockSignedWebhook({
      topic: "payment",
      dataId: "abc123",
      secret: "right-secret",
    });

    const ok = await verifyWebhookSignature({
      requestId: headers.get("x-request-id"),
      dataId: searchParams.get("data.id")!,
      signatureHeader: headers.get("x-signature"),
      secret: "wrong-secret",
    });

    expect(ok).toBe(false);
  });

  it("rejects when the timestamp is outside the replay window", async () => {
    const secret = "test-secret-1234567890";
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const { headers, searchParams } = await mockSignedWebhook({
      topic: "payment",
      dataId: "abc123",
      secret,
      ts: tenMinutesAgo,
    });

    const ok = await verifyWebhookSignature({
      requestId: headers.get("x-request-id"),
      dataId: searchParams.get("data.id")!,
      signatureHeader: headers.get("x-signature"),
      secret,
    });

    expect(ok).toBe(false);
  });
});

describe("testing — MockMercadoPagoClient", () => {
  it("seeds + searches payments", async () => {
    const mp = new MockMercadoPagoClient();
    mp.seed.payments([
      mockPayment({ status: "approved", external_reference: "ref-1" }),
      mockPayment({ status: "rejected", external_reference: "ref-2" }),
    ]);
    const got = await mp.searchPayments({ status: "approved" });
    expect(got.results).toHaveLength(1);
    expect(got.results[0]!.external_reference).toBe("ref-1");
  });

  it("create then get round-trips a Preapproval", async () => {
    const mp = new MockMercadoPagoClient();
    const created = await mp.createPreapproval({
      payer_email: "test@example.com",
    });
    const fetched = await mp.getPreapproval(created.id);
    expect(fetched.payer_email).toBe("test@example.com");
  });

  it("cancelPreapproval flips status to cancelled", async () => {
    const mp = new MockMercadoPagoClient();
    const sub = await mp.createPreapproval({});
    const cancelled = await mp.cancelPreapproval(sub.id);
    expect(cancelled.status).toBe("cancelled");
  });

  it("createRefund marks the underlying payment as refunded", async () => {
    const mp = new MockMercadoPagoClient();
    const payment = await mp.createPayment({ transaction_amount: 1500 });
    await mp.createRefund({ payment_id: String(payment.id) });
    const after = await mp.getPayment(String(payment.id));
    expect(after.status).toBe("refunded");
  });

  it("throws on unknown id", async () => {
    const mp = new MockMercadoPagoClient();
    await expect(mp.getPayment("missing")).rejects.toThrow("Payment not found");
  });

  it("MockNotImplementedError is a clear escape hatch", () => {
    expect(() => {
      throw new MockNotImplementedError("fancyMethod");
    }).toThrow(/MSW or a real sandbox/);
  });
});
