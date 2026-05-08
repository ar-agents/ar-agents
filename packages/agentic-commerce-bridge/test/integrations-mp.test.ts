import { describe, it, expect } from "vitest";
import {
  createMercadoPagoPaymentProvider,
  mercadoPagoPaymentHandler,
  sessionToPreferencePayload,
  parseMpPaymentIdFromWebhook,
  mpStatusToAcpOrderStatus,
  buildAcpEventFromMpWebhook,
  type MpPreferenceResponse,
  type MpPaymentResponse,
} from "../src/integrations";
import type { CheckoutSession } from "../src/schemas/checkout-session";
import type { Order } from "../src/schemas/order";

const baseSession: CheckoutSession = {
  id: "cs_abc",
  status: "ready_for_payment",
  currency: "ars",
  line_items: [
    {
      id: "li_1",
      item: { id: "MLA123", name: "Test Item", unit_amount: 19900 },
      quantity: 2,
      unit_amount: 19900,
      totals: [{ type: "subtotal", display_text: "Subtotal", amount: 39800 }],
    },
  ],
  fulfillment_options: [],
  totals: [{ type: "total", display_text: "Total", amount: 39800 }],
  messages: [],
  links: [],
  buyer: { email: "tere@example.com", first_name: "Tere", last_name: "Lopez" },
};

describe("sessionToPreferencePayload", () => {
  it("translates session to MP preference shape", () => {
    const p = sessionToPreferencePayload(baseSession);
    expect(p.external_reference).toBe("cs_abc");
    expect(p.items).toHaveLength(1);
    expect(p.items[0]?.title).toBe("Test Item");
    expect(p.items[0]?.quantity).toBe(2);
    expect(p.items[0]?.unit_price).toBe(199); // 19900 minor / 100 = 199.0
    expect(p.items[0]?.currency_id).toBe("ARS");
    expect(p.payer?.email).toBe("tere@example.com");
    expect(p.metadata?.["acp_session_id"]).toBe("cs_abc");
  });

  it("respects override divisors for zero-decimal currencies", () => {
    const session: CheckoutSession = {
      ...baseSession,
      currency: "clp",
      line_items: [
        {
          id: "li_1",
          item: { id: "MLC1", name: "X", unit_amount: 50000 },
          quantity: 1,
          unit_amount: 50000,
          totals: [{ type: "subtotal", display_text: "S", amount: 50000 }],
        },
      ],
      totals: [{ type: "total", display_text: "T", amount: 50000 }],
    };
    const p = sessionToPreferencePayload(session);
    expect(p.items[0]?.unit_price).toBe(50000); // 0-decimal: no division
    expect(p.items[0]?.currency_id).toBe("CLP");
  });
});

describe("createMercadoPagoPaymentProvider — onSessionCreated", () => {
  it("creates a preference and embeds the URL + id in metadata", async () => {
    const created: MpPreferenceResponse = {
      id: "pref_xyz",
      init_point: "https://mp.example.com/checkout/pref_xyz",
      sandbox_init_point: "https://sandbox.mp.example.com/checkout/pref_xyz",
      external_reference: "cs_abc",
    };
    const provider = createMercadoPagoPaymentProvider({
      createPreference: async () => created,
      lookupPayment: async () => null,
    });
    const out = await provider.onSessionCreated!(baseSession);
    expect(out?.metadata?.["mp_preference_id"]).toBe("pref_xyz");
    expect(out?.metadata?.["mp_checkout_url"]).toBe(
      "https://mp.example.com/checkout/pref_xyz",
    );
  });

  it("uses sandbox_init_point when sandbox=true", async () => {
    const provider = createMercadoPagoPaymentProvider({
      createPreference: async () => ({
        id: "p2",
        init_point: "https://prod",
        sandbox_init_point: "https://sandbox",
      }),
      lookupPayment: async () => null,
      sandbox: true,
    });
    const out = await provider.onSessionCreated!(baseSession);
    expect(out?.metadata?.["mp_checkout_url"]).toBe("https://sandbox");
  });
});

describe("createMercadoPagoPaymentProvider — processPayment", () => {
  function makeProvider(payment: MpPaymentResponse | null) {
    return createMercadoPagoPaymentProvider({
      createPreference: async () => ({ id: "p1" }),
      lookupPayment: async () => payment,
    });
  }

  const goodPayment: MpPaymentResponse = {
    id: 9001,
    status: "approved",
    currency_id: "ARS",
    transaction_amount: 398.0,
    external_reference: "cs_abc",
  };

  it("succeeds on approved payment with matching amount + currency + ext_ref", async () => {
    const provider = makeProvider(goodPayment);
    const r = await provider.processPayment({
      session: baseSession,
      paymentData: {
        handler_id: "mercadopago",
        instrument: {
          type: "card",
          credential: { type: "mp_payment_id", token: "9001" },
        },
      },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.paymentId).toBe("9001");
      expect(r.metadata?.["mp_status"]).toBe("approved");
    }
  });

  it("fails on missing credential", async () => {
    const provider = makeProvider(goodPayment);
    const r = await provider.processPayment({
      session: baseSession,
      paymentData: { handler_id: "mercadopago" },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe("invalid_payment_token");
  });

  it("fails on payment not found", async () => {
    const provider = makeProvider(null);
    const r = await provider.processPayment({
      session: baseSession,
      paymentData: {
        handler_id: "mercadopago",
        instrument: {
          type: "card",
          credential: { type: "mp_payment_id", token: "9999" },
        },
      },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe("invalid_payment_token");
  });

  it("fails on currency mismatch", async () => {
    const provider = makeProvider({ ...goodPayment, currency_id: "USD" });
    const r = await provider.processPayment({
      session: baseSession,
      paymentData: {
        handler_id: "mercadopago",
        instrument: {
          type: "card",
          credential: { type: "mp_payment_id", token: "9001" },
        },
      },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe("validation_failed");
  });

  it("fails on amount mismatch", async () => {
    const provider = makeProvider({ ...goodPayment, transaction_amount: 100 });
    const r = await provider.processPayment({
      session: baseSession,
      paymentData: {
        handler_id: "mercadopago",
        instrument: {
          type: "card",
          credential: { type: "mp_payment_id", token: "9001" },
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it("fails on external_reference mismatch", async () => {
    const provider = makeProvider({
      ...goodPayment,
      external_reference: "cs_DIFFERENT",
    });
    const r = await provider.processPayment({
      session: baseSession,
      paymentData: {
        handler_id: "mercadopago",
        instrument: {
          type: "card",
          credential: { type: "mp_payment_id", token: "9001" },
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it("fails on rejected status", async () => {
    const provider = makeProvider({ ...goodPayment, status: "rejected" });
    const r = await provider.processPayment({
      session: baseSession,
      paymentData: {
        handler_id: "mercadopago",
        instrument: {
          type: "card",
          credential: { type: "mp_payment_id", token: "9001" },
        },
      },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe("payment_declined");
  });

  it("accepts in_process when added to acceptableStatuses", async () => {
    const provider = createMercadoPagoPaymentProvider({
      createPreference: async () => ({ id: "p" }),
      lookupPayment: async () => ({ ...goodPayment, status: "in_process" }),
      acceptableStatuses: ["approved", "in_process"],
    });
    const r = await provider.processPayment({
      session: baseSession,
      paymentData: {
        handler_id: "mercadopago",
        instrument: {
          type: "card",
          credential: { type: "mp_payment_id", token: "9001" },
        },
      },
    });
    expect(r.success).toBe(true);
  });
});

describe("mercadoPagoPaymentHandler", () => {
  it("returns a fully-formed PaymentHandler declaration", () => {
    const h = mercadoPagoPaymentHandler({});
    expect(h.id).toBe("mercadopago");
    expect(h.psp).toBe("mercadopago");
    expect(h.config["environment"]).toBe("production");
  });
});

describe("MP webhook bridge", () => {
  it("parses v2 webhook envelope", () => {
    const id = parseMpPaymentIdFromWebhook({
      type: "payment",
      action: "payment.updated",
      data: { id: 1234 },
    });
    expect(id).toBe("1234");
  });

  it("parses v1 webhook with topic + id", () => {
    const id = parseMpPaymentIdFromWebhook({ topic: "payment", id: 4321 });
    expect(id).toBe("4321");
  });

  it("parses v1 webhook with resource URL", () => {
    const id = parseMpPaymentIdFromWebhook({
      topic: "payment",
      resource: "https://api.mercadopago.com/v1/payments/777",
    });
    expect(id).toBe("777");
  });

  it("returns null on unknown shape", () => {
    expect(parseMpPaymentIdFromWebhook({ topic: "merchant_order" })).toBeNull();
  });

  it("maps MP statuses to ACP order statuses", () => {
    expect(mpStatusToAcpOrderStatus("approved")).toBe("confirmed");
    expect(mpStatusToAcpOrderStatus("rejected")).toBe("canceled");
    expect(mpStatusToAcpOrderStatus("in_process")).toBe("processing");
    expect(mpStatusToAcpOrderStatus("refunded")).toBe("refunded");
    expect(mpStatusToAcpOrderStatus("xxxx")).toBe("processing");
  });

  it("buildAcpEventFromMpWebhook returns null when payment id missing", async () => {
    const r = await buildAcpEventFromMpWebhook(
      { topic: "merchant_order" },
      {
        loadOrder: async () => null,
        lookupPayment: async () => null,
      },
    );
    expect(r).toBeNull();
  });

  it("buildAcpEventFromMpWebhook produces order_update on success", async () => {
    const order: Order = {
      type: "order",
      id: "ord_1",
      checkout_session_id: "cs_abc",
      permalink_url: "https://example.com/o/ord_1",
      status: "confirmed",
    };
    const r = await buildAcpEventFromMpWebhook(
      { type: "payment", data: { id: 9001 } },
      {
        loadOrder: async () => order,
        lookupPayment: async () => ({
          id: 9001,
          status: "approved",
          currency_id: "ARS",
          transaction_amount: 398,
          external_reference: "cs_abc",
        }),
      },
    );
    expect(r).not.toBeNull();
    expect(r!.type).toBe("order_update");
    expect(r!.data.id).toBe("ord_1");
    expect(r!.data.status).toBe("confirmed");
    expect(r!.data.metadata?.["mp_payment_id"]).toBe("9001");
  });
});
