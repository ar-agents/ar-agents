import { describe, it, expect } from "vitest";
import {
  Currency,
  CurrencyUpper,
  Amount,
  ApiVersion,
  Address,
  Buyer,
  Total,
  LineItem,
  FulfillmentOption,
  PaymentData,
  CheckoutSession,
  CheckoutSessionCreateRequest,
  CheckoutSessionCompleteRequest,
  WebhookEvent,
  AcpError,
  Cart,
} from "../src/schemas";

describe("common primitives", () => {
  it("accepts lowercase ISO 4217 currencies", () => {
    expect(Currency.safeParse("usd").success).toBe(true);
    expect(Currency.safeParse("ars").success).toBe(true);
    expect(Currency.safeParse("brl").success).toBe(true);
  });

  it("rejects uppercase / wrong-length currencies in Currency", () => {
    expect(Currency.safeParse("USD").success).toBe(false);
    expect(Currency.safeParse("ar").success).toBe(false);
    expect(Currency.safeParse("usds").success).toBe(false);
  });

  it("CurrencyUpper accepts uppercase", () => {
    expect(CurrencyUpper.safeParse("USD").success).toBe(true);
    expect(CurrencyUpper.safeParse("usd").success).toBe(false);
  });

  it("Amount only allows non-negative integers", () => {
    expect(Amount.safeParse(0).success).toBe(true);
    expect(Amount.safeParse(199_00).success).toBe(true);
    expect(Amount.safeParse(-1).success).toBe(false);
    expect(Amount.safeParse(1.5).success).toBe(false);
  });

  it("ApiVersion only accepts YYYY-MM-DD", () => {
    expect(ApiVersion.safeParse("2026-04-17").success).toBe(true);
    expect(ApiVersion.safeParse("v2").success).toBe(false);
    expect(ApiVersion.safeParse("2026-4-17").success).toBe(false);
  });
});

describe("Address", () => {
  it("requires name, line_one, city, state, country (alpha-2), postal_code", () => {
    const ok = Address.safeParse({
      name: "Naza Clemente",
      line_one: "Calle Falsa 123",
      city: "Monte Grande",
      state: "Buenos Aires",
      country: "AR",
      postal_code: "1842",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects non-alpha-2 country", () => {
    const r = Address.safeParse({
      name: "X",
      line_one: "Y",
      city: "Z",
      state: "W",
      country: "ARG",
      postal_code: "1842",
    });
    expect(r.success).toBe(false);
  });
});

describe("Buyer", () => {
  it("requires only email", () => {
    const r = Buyer.safeParse({ email: "naza@helloastro.co" });
    expect(r.success).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(Buyer.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("accepts company.tax_id (used for AR CUIT)", () => {
    const r = Buyer.safeParse({
      email: "tere@example.com",
      company: { name: "Tere SRL", tax_id: "20-12345678-6" },
    });
    expect(r.success).toBe(true);
  });
});

describe("Total", () => {
  it("requires type, display_text, amount", () => {
    const r = Total.safeParse({
      type: "total",
      display_text: "Total",
      amount: 19900,
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown type", () => {
    const r = Total.safeParse({
      type: "frobnitz",
      display_text: "Total",
      amount: 100,
    });
    expect(r.success).toBe(false);
  });
});

describe("LineItem", () => {
  it("accepts minimal required shape", () => {
    const r = LineItem.safeParse({
      id: "li_1",
      item: { id: "item_123" },
      quantity: 1,
      totals: [{ type: "subtotal", display_text: "Subtotal", amount: 19900 }],
    });
    expect(r.success).toBe(true);
  });

  it("supports decimal quantity (B2B 2026-04-17)", () => {
    const r = LineItem.safeParse({
      id: "li_1",
      item: { id: "item_123" },
      quantity: 1.5,
      totals: [{ type: "subtotal", display_text: "Subtotal", amount: 19900 }],
    });
    expect(r.success).toBe(true);
  });
});

describe("FulfillmentOption discriminator", () => {
  it("accepts shipping variant with carrier", () => {
    const r = FulfillmentOption.safeParse({
      type: "shipping",
      id: "fo_1",
      title: "Standard",
      carrier: "Andreani",
      totals: [{ type: "fulfillment", display_text: "Shipping", amount: 100 }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts pickup variant with required location", () => {
    const r = FulfillmentOption.safeParse({
      type: "pickup",
      id: "fo_2",
      title: "In-store pickup",
      location: {
        name: "Sucursal Centro",
        address: {
          name: "Sucursal Centro",
          line_one: "Av. Corrientes 1234",
          city: "CABA",
          state: "CABA",
          country: "AR",
          postal_code: "C1043",
        },
      },
      totals: [{ type: "fulfillment", display_text: "Pickup", amount: 0 }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects pickup variant without location", () => {
    const r = FulfillmentOption.safeParse({
      type: "pickup",
      id: "fo_3",
      title: "In-store pickup",
      totals: [{ type: "fulfillment", display_text: "Pickup", amount: 0 }],
    });
    expect(r.success).toBe(false);
  });
});

describe("PaymentData refinement", () => {
  it("requires either (handler_id+instrument) or purchase_order_number", () => {
    const ok = PaymentData.safeParse({
      handler_id: "card_tokenized",
      instrument: {
        type: "card",
        credential: { type: "spt", token: "spt_123" },
      },
    });
    expect(ok.success).toBe(true);

    const okPO = PaymentData.safeParse({
      purchase_order_number: "PO-2026-001",
    });
    expect(okPO.success).toBe(true);
  });

  it("rejects when neither path is satisfied", () => {
    const r = PaymentData.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("CheckoutSessionCreateRequest", () => {
  it("matches spec example", () => {
    const r = CheckoutSessionCreateRequest.safeParse({
      currency: "usd",
      line_items: [{ id: "item_123", quantity: 1 }],
      capabilities: {
        interventions: {
          supported: ["3ds", "address_verification"],
          display_context: "webview",
          redirect_context: "in_app",
          max_redirects: 1,
          max_interaction_depth: 1,
        },
      },
      fulfillment_details: {
        name: "John Doe",
        phone_number: "15551234567",
        email: "johndoe@example.com",
        address: {
          name: "John Doe",
          line_one: "1234 Chat Road,",
          city: "San Francisco",
          state: "CA",
          country: "US",
          postal_code: "94131",
        },
      },
      order_notes: "Leave at front door if I'm not home.",
    });
    expect(r.success).toBe(true);
  });

  it("requires non-empty line_items", () => {
    const r = CheckoutSessionCreateRequest.safeParse({
      currency: "usd",
      line_items: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("CheckoutSessionCompleteRequest", () => {
  it("matches spec example with SPT credential", () => {
    const r = CheckoutSessionCompleteRequest.safeParse({
      buyer: {
        first_name: "John",
        last_name: "Smith",
        email: "johnsmith@mail.com",
        phone_number: "15552003434",
      },
      payment_data: {
        handler_id: "card_tokenized",
        instrument: {
          type: "card",
          credential: { type: "spt", token: "spt_123" },
        },
        billing_address: {
          name: "John Smith",
          line_one: "1234 Chat Road,",
          city: "San Francisco",
          state: "CA",
          country: "US",
          postal_code: "94131",
        },
      },
      marketing_consents: [
        { channel: "email", opted_in: true },
        { channel: "sms", opted_in: false },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("CheckoutSession (response)", () => {
  it("requires status, currency, line_items, totals, fulfillment_options, messages, links", () => {
    const r = CheckoutSession.safeParse({
      id: "checkout_session_123",
      status: "ready_for_payment",
      currency: "usd",
      line_items: [
        {
          id: "li_1",
          item: { id: "item_123" },
          quantity: 1,
          totals: [{ type: "subtotal", display_text: "Subtotal", amount: 300 }],
        },
      ],
      fulfillment_options: [],
      totals: [{ type: "total", display_text: "Total", amount: 480 }],
      messages: [],
      links: [],
    });
    expect(r.success).toBe(true);
  });
});

describe("WebhookEvent", () => {
  it("accepts order_update event with adjustments[]", () => {
    const r = WebhookEvent.safeParse({
      type: "order_update",
      data: {
        type: "order",
        id: "ord_123",
        checkout_session_id: "checkout_session_123",
        permalink_url: "https://example.com/orders/123",
        status: "shipped",
        adjustments: [],
        totals: [{ type: "total", display_text: "Total", amount: 11260 }],
      },
    });
    expect(r.success).toBe(true);
  });

  it("accepts unknown forward-compatible types", () => {
    const r = WebhookEvent.safeParse({
      type: "future_event_type_xyz",
      data: {
        type: "order",
        id: "ord_123",
        checkout_session_id: "cs_1",
        permalink_url: "https://example.com/orders/123",
      },
    });
    expect(r.success).toBe(true);
  });
});

describe("AcpError", () => {
  it("accepts well-known shape with supported_versions", () => {
    const r = AcpError.safeParse({
      type: "invalid_request",
      code: "unsupported_api_version",
      message: "API version '2025-01-01' is not supported",
      supported_versions: ["2026-04-17", "2026-01-30"],
    });
    expect(r.success).toBe(true);
  });
});

describe("Cart", () => {
  it("accepts minimal shape", () => {
    const r = Cart.safeParse({
      id: "cart_1",
      currency: "ars",
      line_items: [
        {
          id: "li_1",
          item: { id: "item_x" },
          quantity: 1,
          totals: [{ type: "subtotal", display_text: "Subtotal", amount: 5000 }],
        },
      ],
      totals: [{ type: "total", display_text: "Total", amount: 5000 }],
    });
    expect(r.success).toBe(true);
  });
});
