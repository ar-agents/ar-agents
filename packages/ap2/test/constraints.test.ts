import { describe, it, expect } from "vitest";
import {
  evaluateCheckoutConstraint,
  evaluatePaymentConstraint,
  InMemoryBudgetTracker,
  type Constraint,
} from "../src";
import type { CheckoutJwtPayload, ClosedCheckoutMandate } from "../src";
import type { ClosedPaymentMandate } from "../src";

const sampleCheckout: CheckoutJwtPayload = {
  order_id: "order_1",
  merchant: { id: "merchant_1", name: "Demo" },
  line_items: [
    {
      id: "li_1",
      product: { id: "shoe_red", title: "Red Shoe", price: 100, currency: "USD" },
      quantity: 2,
    },
    {
      id: "li_2",
      product: { id: "shoe_blue", title: "Blue Shoe", price: 100, currency: "USD" },
      quantity: 1,
    },
  ],
  total_price: 300,
  currency: "USD",
};

const sampleClosedCheckoutMandate: ClosedCheckoutMandate = {
  vct: "mandate.checkout.1",
  checkout_jwt: "stub.jwt.sig",
  checkout_hash: "stub-hash",
};

const sampleClosedPaymentMandate: ClosedPaymentMandate = {
  vct: "mandate.payment.1",
  transaction_id: "checkout-hash-abc",
  payee: { id: "merchant_1" },
  payment_amount: { amount: 30000, currency: "USD" },
  payment_instrument: { id: "card_x", type: "card" },
};

describe("evaluateCheckoutConstraint", () => {
  it("checkout.allowed_merchants OK when merchant in list", () => {
    const r = evaluateCheckoutConstraint(
      {
        type: "checkout.allowed_merchants",
        allowed: [{ id: "merchant_1" }, { id: "merchant_2" }],
      },
      { checkoutPayload: sampleCheckout, closedMandate: sampleClosedCheckoutMandate },
    );
    expect(r.ok).toBe(true);
  });

  it("checkout.allowed_merchants FAILS when merchant absent", () => {
    const r = evaluateCheckoutConstraint(
      { type: "checkout.allowed_merchants", allowed: [{ id: "other" }] },
      { checkoutPayload: sampleCheckout, closedMandate: sampleClosedCheckoutMandate },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_mandate");
  });

  it("rejects payment-side constraint in checkout context", () => {
    const r = evaluateCheckoutConstraint(
      {
        type: "payment.amount_range",
        currency: "USD",
        max: 10000,
      },
      { checkoutPayload: sampleCheckout, closedMandate: sampleClosedCheckoutMandate },
    );
    expect(r.ok).toBe(false);
  });

  it("checkout.line_items: simple satisfiable case", () => {
    const r = evaluateCheckoutConstraint(
      {
        type: "checkout.line_items",
        items: [
          {
            id: "constraint_1",
            acceptable_items: [{ id: "shoe_red" }, { id: "shoe_blue" }],
            quantity: 3,
          },
        ],
      },
      { checkoutPayload: sampleCheckout, closedMandate: sampleClosedCheckoutMandate },
    );
    expect(r.ok).toBe(true);
  });

  it("checkout.line_items: insufficient cart quantity FAILS", () => {
    const r = evaluateCheckoutConstraint(
      {
        type: "checkout.line_items",
        items: [
          {
            id: "constraint_1",
            acceptable_items: [{ id: "shoe_red" }],
            quantity: 5, // cart only has 2 red shoes
          },
        ],
      },
      { checkoutPayload: sampleCheckout, closedMandate: sampleClosedCheckoutMandate },
    );
    expect(r.ok).toBe(false);
  });

  it("checkout.line_items: max-flow handles multiple constraints sharing accepts", () => {
    // Constraint 1 wants 1 of {shoe_red, shoe_blue}; cart has 2 red, 1 blue.
    // Constraint 2 wants 2 of {shoe_red}; cart has 2 red.
    // Bipartite max-flow must hand 2 red to C2 and 1 blue to C1 → SATISFIES both.
    const r = evaluateCheckoutConstraint(
      {
        type: "checkout.line_items",
        items: [
          {
            id: "c1",
            acceptable_items: [{ id: "shoe_red" }, { id: "shoe_blue" }],
            quantity: 1,
          },
          {
            id: "c2",
            acceptable_items: [{ id: "shoe_red" }],
            quantity: 2,
          },
        ],
      },
      { checkoutPayload: sampleCheckout, closedMandate: sampleClosedCheckoutMandate },
    );
    expect(r.ok).toBe(true);
  });

  it("checkout.line_items: empty constraint list trivially passes", () => {
    const r = evaluateCheckoutConstraint(
      { type: "checkout.line_items", items: [] },
      { checkoutPayload: sampleCheckout, closedMandate: sampleClosedCheckoutMandate },
    );
    expect(r.ok).toBe(true);
  });
});

describe("evaluatePaymentConstraint", () => {
  it("payment.amount_range OK within max", async () => {
    const r = await evaluatePaymentConstraint(
      { type: "payment.amount_range", currency: "USD", max: 50000 },
      { closedMandate: sampleClosedPaymentMandate },
    );
    expect(r.ok).toBe(true);
  });

  it("payment.amount_range FAILS over max", async () => {
    const r = await evaluatePaymentConstraint(
      { type: "payment.amount_range", currency: "USD", max: 10000 },
      { closedMandate: sampleClosedPaymentMandate },
    );
    expect(r.ok).toBe(false);
  });

  it("payment.amount_range FAILS on currency mismatch", async () => {
    const r = await evaluatePaymentConstraint(
      { type: "payment.amount_range", currency: "ARS", max: 50000 },
      { closedMandate: sampleClosedPaymentMandate },
    );
    expect(r.ok).toBe(false);
  });

  it("payment.allowed_payees OK", async () => {
    const r = await evaluatePaymentConstraint(
      {
        type: "payment.allowed_payees",
        allowed: [{ id: "merchant_1" }, { id: "merchant_2" }],
      },
      { closedMandate: sampleClosedPaymentMandate },
    );
    expect(r.ok).toBe(true);
  });

  it("payment.allowed_payees FAILS when payee not allowed", async () => {
    const r = await evaluatePaymentConstraint(
      { type: "payment.allowed_payees", allowed: [{ id: "other" }] },
      { closedMandate: sampleClosedPaymentMandate },
    );
    expect(r.ok).toBe(false);
  });

  it("payment.allowed_payment_instruments OK by id", async () => {
    const r = await evaluatePaymentConstraint(
      {
        type: "payment.allowed_payment_instruments",
        allowed: [{ id: "card_x", type: "card" }],
      },
      { closedMandate: sampleClosedPaymentMandate },
    );
    expect(r.ok).toBe(true);
  });

  it("payment.allowed_pisps FAILS when no pisp is set on closed mandate", async () => {
    const r = await evaluatePaymentConstraint(
      {
        type: "payment.allowed_pisps",
        allowed: [{ id: "pisp_1" }],
      },
      { closedMandate: sampleClosedPaymentMandate },
    );
    expect(r.ok).toBe(false);
  });

  it("payment.execution_date OK within window", async () => {
    const r = await evaluatePaymentConstraint(
      {
        type: "payment.execution_date",
        not_before: "2026-01-01T00:00:00Z",
        not_after: "2027-01-01T00:00:00Z",
      },
      {
        closedMandate: {
          ...sampleClosedPaymentMandate,
          execution_date: "2026-06-15T12:00:00Z",
        },
      },
    );
    expect(r.ok).toBe(true);
  });

  it("payment.execution_date FAILS before not_before", async () => {
    const r = await evaluatePaymentConstraint(
      {
        type: "payment.execution_date",
        not_before: "2026-12-01T00:00:00Z",
      },
      {
        closedMandate: {
          ...sampleClosedPaymentMandate,
          execution_date: "2026-06-15T12:00:00Z",
        },
      },
    );
    expect(r.ok).toBe(false);
  });

  it("payment.reference OK when conditional_transaction_id matches digest", async () => {
    const r = await evaluatePaymentConstraint(
      {
        type: "payment.reference",
        conditional_transaction_id: "open-checkout-digest-xyz",
      },
      {
        closedMandate: sampleClosedPaymentMandate,
        linkedCheckoutMandateDigest: "open-checkout-digest-xyz",
      },
    );
    expect(r.ok).toBe(true);
  });

  it("payment.reference FAILS unresolved when caller didn't supply digest", async () => {
    const r = await evaluatePaymentConstraint(
      {
        type: "payment.reference",
        conditional_transaction_id: "x",
      },
      { closedMandate: sampleClosedPaymentMandate },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unresolved_constraint");
  });

  it("unknown constraint type fails with unresolved_constraint", async () => {
    const r = await evaluatePaymentConstraint(
      { type: "future.type" } as unknown as Constraint,
      { closedMandate: sampleClosedPaymentMandate },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unresolved_constraint");
  });

  it("payment.budget passes through when no tracker is wired (documented no-op)", async () => {
    const r = await evaluatePaymentConstraint(
      { type: "payment.budget", max: 1000, currency: "USD" },
      { closedMandate: sampleClosedPaymentMandate },
    );
    expect(r.ok).toBe(true);
  });

  it("payment.budget passes when tracker shows spend within cap", async () => {
    // Budget max 1000 USD = 100000 minor; prior spend 50000 + this 30000 = 80000 ≤ 100000.
    const tracker = new InMemoryBudgetTracker();
    await tracker.recordPresentation({
      openMandateDigest: "open_pm_digest",
      amountMinor: 50000,
      currency: "USD",
    });
    const r = await evaluatePaymentConstraint(
      { type: "payment.budget", max: 1000, currency: "USD" },
      {
        closedMandate: sampleClosedPaymentMandate, // payment_amount = 30000 minor
        tracker,
        openMandateDigest: "open_pm_digest",
      },
    );
    expect(r.ok).toBe(true);
  });

  it("payment.budget FAILS when tracker shows the charge exceeds the cap", async () => {
    // Budget max 1000 USD = 100000 minor; prior spend 90000 + this 30000 = 120000 > 100000.
    const tracker = new InMemoryBudgetTracker();
    await tracker.recordPresentation({
      openMandateDigest: "open_pm_digest",
      amountMinor: 90000,
      currency: "USD",
    });
    const r = await evaluatePaymentConstraint(
      { type: "payment.budget", max: 1000, currency: "USD" },
      {
        closedMandate: sampleClosedPaymentMandate, // payment_amount = 30000 minor
        tracker,
        openMandateDigest: "open_pm_digest",
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_mandate");
  });

  it("payment.budget FAILS closed when a tracker is supplied without an openMandateDigest", async () => {
    const tracker = new InMemoryBudgetTracker();
    const r = await evaluatePaymentConstraint(
      { type: "payment.budget", max: 1000, currency: "USD" },
      { closedMandate: sampleClosedPaymentMandate, tracker },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unresolved_constraint");
  });
});
