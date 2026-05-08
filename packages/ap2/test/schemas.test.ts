import { describe, it, expect } from "vitest";
import {
  Amount,
  CurrencyCode,
  Merchant,
  PaymentInstrument,
  Pisp,
  Item,
  Frequency,
  divisorFor,
  ZERO_DECIMAL_CURRENCIES,
  Jwk,
  JwkEc,
  JwkOkp,
  Cnf,
  Constraint,
  KNOWN_CONSTRAINT_TYPES,
  ConstraintLineItems,
  ConstraintAmountRange,
  OpenCheckoutMandate,
  ClosedCheckoutMandate,
  CheckoutJwtPayload,
  OpenPaymentMandate,
  ClosedPaymentMandate,
  CheckoutReceipt,
  PaymentReceipt,
} from "../src";

describe("common", () => {
  it("Amount accepts integer minor units", () => {
    expect(Amount.safeParse({ amount: 19900, currency: "USD" }).success).toBe(true);
    expect(Amount.safeParse({ amount: 0, currency: "ARS" }).success).toBe(true);
    expect(Amount.safeParse({ amount: -1, currency: "ARS" }).success).toBe(false);
    expect(Amount.safeParse({ amount: 1.5, currency: "ARS" }).success).toBe(false);
  });

  it("CurrencyCode accepts both upper and lower case", () => {
    expect(CurrencyCode.safeParse("USD").success).toBe(true);
    expect(CurrencyCode.safeParse("ars").success).toBe(true);
    expect(CurrencyCode.safeParse("US").success).toBe(false);
  });

  it("divisorFor returns 1 for zero-decimal currencies", () => {
    expect(divisorFor("CLP")).toBe(1);
    expect(divisorFor("clp")).toBe(1);
    expect(divisorFor("PYG")).toBe(1);
    expect(divisorFor("USD")).toBe(100);
    expect(divisorFor("ARS")).toBe(100);
  });

  it("ZERO_DECIMAL_CURRENCIES contains expected entries", () => {
    expect(ZERO_DECIMAL_CURRENCIES.has("CLP")).toBe(true);
    expect(ZERO_DECIMAL_CURRENCIES.has("JPY")).toBe(true);
    expect(ZERO_DECIMAL_CURRENCIES.has("USD" as never)).toBe(false);
  });

  it("Merchant requires id", () => {
    expect(Merchant.safeParse({ id: "merchant_1" }).success).toBe(true);
    expect(Merchant.safeParse({ name: "X" }).success).toBe(false);
  });

  it("PaymentInstrument requires id + type", () => {
    expect(
      PaymentInstrument.safeParse({ id: "card_1", type: "card" }).success,
    ).toBe(true);
    expect(PaymentInstrument.safeParse({ id: "card_1" }).success).toBe(false);
  });

  it("Pisp accepts minimal id", () => {
    expect(Pisp.safeParse({ id: "pisp_1" }).success).toBe(true);
  });

  it("Item accepts minimal shape", () => {
    expect(Item.safeParse({ id: "item_x" }).success).toBe(true);
  });

  it("Frequency enum is closed", () => {
    expect(Frequency.safeParse("MONTHLY").success).toBe(true);
    expect(Frequency.safeParse("HOURLY").success).toBe(false);
  });
});

describe("JWK schemas", () => {
  it("accepts EC P-256 JWK", () => {
    const r = Jwk.safeParse({
      kty: "EC",
      crv: "P-256",
      x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
      y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
    });
    expect(r.success).toBe(true);
  });

  it("accepts OKP Ed25519 JWK (used in cnf for KB-JWT signing)", () => {
    const r = JwkOkp.safeParse({
      kty: "OKP",
      crv: "Ed25519",
      x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
    });
    expect(r.success).toBe(true);
  });

  it("rejects EC JWK with invalid crv", () => {
    const r = JwkEc.safeParse({ kty: "EC", crv: "P-1" as never, x: "a", y: "b" });
    expect(r.success).toBe(false);
  });

  it("Cnf wraps a JWK", () => {
    const r = Cnf.safeParse({
      jwk: { kty: "EC", crv: "P-256", x: "a", y: "b" },
    });
    expect(r.success).toBe(true);
  });
});

describe("Constraint schemas", () => {
  it("accepts checkout.line_items shape", () => {
    const r = ConstraintLineItems.safeParse({
      type: "checkout.line_items",
      items: [
        {
          id: "line_1",
          acceptable_items: [{ id: "item_a" }, { id: "item_b" }],
          quantity: 2,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts payment.amount_range with optional min", () => {
    const r = ConstraintAmountRange.safeParse({
      type: "payment.amount_range",
      currency: "USD",
      max: 5000,
    });
    expect(r.success).toBe(true);
  });

  it("Constraint discriminated union dispatches by type", () => {
    expect(
      Constraint.safeParse({
        type: "payment.execution_date",
        not_before: "2026-04-28T00:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      Constraint.safeParse({ type: "unknown" } as unknown as Record<string, unknown>).success,
    ).toBe(false);
  });

  it("KNOWN_CONSTRAINT_TYPES enumerates all 10 types", () => {
    // 8 sleeping + payment.budget + payment.agent_recurrence
    expect(KNOWN_CONSTRAINT_TYPES.length).toBe(10);
    expect(KNOWN_CONSTRAINT_TYPES).toContain("checkout.line_items");
    expect(KNOWN_CONSTRAINT_TYPES).toContain("payment.reference");
  });
});

describe("Mandate schemas", () => {
  it("OpenCheckoutMandate requires vct match + cnf + constraints", () => {
    const r = OpenCheckoutMandate.safeParse({
      vct: "mandate.checkout.open.1",
      constraints: [
        {
          type: "checkout.allowed_merchants",
          allowed: [{ id: "merchant_1" }],
        },
      ],
      cnf: { jwk: { kty: "EC", crv: "P-256", x: "a", y: "b" } },
    });
    expect(r.success).toBe(true);
  });

  it("rejects pre-v0.2 vct", () => {
    const r = OpenCheckoutMandate.safeParse({
      vct: "mandate.intent.open.1", // dead in v0.2
      constraints: [
        { type: "checkout.allowed_merchants", allowed: [{ id: "x" }] },
      ],
      cnf: { jwk: { kty: "EC", crv: "P-256", x: "a", y: "b" } },
    });
    expect(r.success).toBe(false);
  });

  it("ClosedCheckoutMandate requires checkout_jwt + checkout_hash", () => {
    const r = ClosedCheckoutMandate.safeParse({
      vct: "mandate.checkout.1",
      checkout_jwt: "eyJ.eyJ.sig",
      checkout_hash: "FzLox-base64url",
    });
    expect(r.success).toBe(true);
  });

  it("CheckoutJwtPayload matches the AP2 reference example shape", () => {
    const r = CheckoutJwtPayload.safeParse({
      order_id: "order_1",
      merchant: { id: "merchant_1", name: "Demo" },
      line_items: [
        {
          id: "line_1",
          product: {
            id: "supershoe",
            title: "Shoe",
            price: 199.0,
            currency: "USD",
          },
          quantity: 1,
        },
      ],
      total_price: 199.0,
      currency: "USD",
    });
    expect(r.success).toBe(true);
  });

  it("ClosedPaymentMandate requires transaction_id + payee + amount + instrument", () => {
    const r = ClosedPaymentMandate.safeParse({
      vct: "mandate.payment.1",
      transaction_id: "abc-checkout-hash",
      payee: { id: "merchant_1" },
      payment_amount: { amount: 19900, currency: "USD" },
      payment_instrument: { id: "card_x", type: "card" },
    });
    expect(r.success).toBe(true);
  });

  it("OpenPaymentMandate requires constraints (with payment.reference) + cnf", () => {
    const r = OpenPaymentMandate.safeParse({
      vct: "mandate.payment.open.1",
      constraints: [
        {
          type: "payment.reference",
          conditional_transaction_id: "open-checkout-digest",
        },
        {
          type: "payment.amount_range",
          currency: "USD",
          max: 50000,
        },
      ],
      cnf: { jwk: { kty: "EC", crv: "P-256", x: "a", y: "b" } },
    });
    expect(r.success).toBe(true);
  });
});

describe("Receipt schemas", () => {
  it("CheckoutReceipt success shape", () => {
    const r = CheckoutReceipt.safeParse({
      status: "Success",
      iss: "merchant.example",
      iat: 1717000000,
      reference: "FzLox-sd-hash",
      order_id: "order_1",
    });
    expect(r.success).toBe(true);
  });

  it("PaymentReceipt requires payment_id always", () => {
    const r = PaymentReceipt.safeParse({
      status: "Success",
      iss: "mpp.acme",
      iat: 1717000000,
      reference: "abc",
      payment_id: "PAY-001",
    });
    expect(r.success).toBe(true);
    const r2 = PaymentReceipt.safeParse({
      status: "Success",
      iss: "mpp.acme",
      iat: 1717000000,
      reference: "abc",
    });
    expect(r2.success).toBe(false);
  });
});
