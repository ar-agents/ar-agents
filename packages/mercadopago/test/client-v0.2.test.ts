import { describe, expect, it } from "vitest";
import "./setup";
import { MercadoPagoClient } from "../src";

const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });

describe("MercadoPagoClient — Payments (v0.2)", () => {
  describe("createPayment", () => {
    it("creates an account_money payment that approves immediately", async () => {
      const payment = await client.createPayment({
        transactionAmount: 1500,
        paymentMethodId: "account_money",
        payerEmail: "buyer@test.com",
        externalReference: "order-123",
        description: "Plan Pro mensual",
      });
      expect(payment.id).toMatch(/^pay_/);
      expect(payment.status).toBe("approved");
      expect(payment.transaction_amount).toBe(1500);
      expect(payment.currency_id).toBe("ARS");
      expect(payment.payment_method_id).toBe("account_money");
      expect(payment.external_reference).toBe("order-123");
    });

    it("creates a ticket payment in pending state (Rapipago)", async () => {
      const payment = await client.createPayment({
        transactionAmount: 5000,
        paymentMethodId: "rapipago",
        payerEmail: "buyer@test.com",
      });
      expect(payment.status).toBe("pending");
      expect(payment.payment_method_id).toBe("rapipago");
    });

    it("includes payer identification when provided (DNI/CUIT)", async () => {
      const payment = await client.createPayment({
        transactionAmount: 1000,
        paymentMethodId: "account_money",
        payerEmail: "buyer@test.com",
        identification: { type: "DNI", number: "12345678" },
      });
      expect(payment.payer?.identification?.number).toBe("12345678");
      expect(payment.payer?.identification?.type).toBe("DNI");
    });
  });

  describe("getPayment", () => {
    it("retrieves a previously-created payment by id", async () => {
      const created = await client.createPayment({
        transactionAmount: 500,
        paymentMethodId: "account_money",
        payerEmail: "buyer@test.com",
      });
      const fetched = await client.getPayment(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.transaction_amount).toBe(500);
    });
  });

  describe("searchPayments", () => {
    it("filters by external_reference", async () => {
      await client.createPayment({
        transactionAmount: 100,
        paymentMethodId: "account_money",
        payerEmail: "buyer1@test.com",
        externalReference: "order-search-1",
      });
      await client.createPayment({
        transactionAmount: 200,
        paymentMethodId: "account_money",
        payerEmail: "buyer2@test.com",
        externalReference: "order-search-2",
      });
      const result = await client.searchPayments({ externalReference: "order-search-1" });
      expect(result.results.length).toBe(1);
      expect(result.results[0]!.transaction_amount).toBe(100);
    });

    it("filters by status='approved'", async () => {
      await client.createPayment({
        transactionAmount: 100,
        paymentMethodId: "account_money",
        payerEmail: "b@test.com",
      });
      await client.createPayment({
        transactionAmount: 200,
        paymentMethodId: "rapipago",
        payerEmail: "b@test.com",
      });
      const approved = await client.searchPayments({ status: "approved" });
      expect(approved.results.every((p) => p.status === "approved")).toBe(true);
    });
  });

  describe("cancelPayment", () => {
    it("cancels a pending payment", async () => {
      const pending = await client.createPayment({
        transactionAmount: 100,
        paymentMethodId: "rapipago",
        payerEmail: "b@test.com",
      });
      const cancelled = await client.cancelPayment(pending.id);
      expect(cancelled.status).toBe("cancelled");
    });
  });
});

describe("MercadoPagoClient — Refunds", () => {
  it("creates a full refund (no amount = full)", async () => {
    const payment = await client.createPayment({
      transactionAmount: 2000,
      paymentMethodId: "account_money",
      payerEmail: "b@test.com",
    });
    const refund = await client.createRefund({
      paymentId: payment.id,
      idempotencyKey: "refund-key-1",
    });
    expect(refund.payment_id).toBe(payment.id);
    expect(refund.amount).toBe(2000);
    expect(refund.status).toBe("approved");
  });

  it("creates a partial refund (with amount)", async () => {
    const payment = await client.createPayment({
      transactionAmount: 2000,
      paymentMethodId: "account_money",
      payerEmail: "b@test.com",
    });
    const refund = await client.createRefund({
      paymentId: payment.id,
      amount: 500,
    });
    expect(refund.amount).toBe(500);
  });

  it("lists refunds for a payment", async () => {
    const payment = await client.createPayment({
      transactionAmount: 2000,
      paymentMethodId: "account_money",
      payerEmail: "b@test.com",
    });
    await client.createRefund({ paymentId: payment.id, amount: 500 });
    await client.createRefund({ paymentId: payment.id, amount: 300 });
    const refunds = await client.listRefunds(payment.id);
    expect(refunds.length).toBe(2);
  });
});

describe("MercadoPagoClient — Checkout Pro", () => {
  it("creates a payment preference with init_point + sandbox_init_point", async () => {
    const pref = await client.createPreference({
      items: [{ title: "Plan Pro", quantity: 1, unit_price: 25000, currency_id: "ARS" }],
      externalReference: "order-pref-1",
    });
    expect(pref.id).toMatch(/^pref_/);
    expect(pref.init_point).toMatch(/^https:\/\/www\.mercadopago/);
    expect(pref.sandbox_init_point).toMatch(/^https:\/\/sandbox\.mercadopago/);
    expect(pref.external_reference).toBe("order-pref-1");
  });

  it("retrieves a preference by id", async () => {
    const pref = await client.createPreference({
      items: [{ title: "X", quantity: 1, unit_price: 100, currency_id: "ARS" }],
    });
    const fetched = await client.getPreference(pref.id);
    expect(fetched.id).toBe(pref.id);
  });
});

describe("MercadoPagoClient — Customers + Cards", () => {
  it("creates a customer (idempotent on email)", async () => {
    const c1 = await client.createCustomer({
      email: "lautaro@test.com",
      firstName: "Lautaro",
    });
    const c2 = await client.createCustomer({ email: "lautaro@test.com" });
    expect(c1.id).toBe(c2.id);
    expect(c1.first_name).toBe("Lautaro");
  });

  it("searches customers by email", async () => {
    await client.createCustomer({ email: "find@test.com" });
    const result = await client.searchCustomers({ email: "find@test.com" });
    expect(result.results.length).toBe(1);
    expect(result.results[0]!.email).toBe("find@test.com");
  });

  it("returns empty array when listing cards for a customer with no cards", async () => {
    const customer = await client.createCustomer({ email: "nocards@test.com" });
    const cards = await client.listCustomerCards(customer.id);
    expect(cards).toEqual([]);
  });
});

describe("MercadoPagoClient — Payment Methods + Installments", () => {
  it("lists AR payment methods (visa, master, naranja, account_money, rapipago)", async () => {
    const methods = await client.listPaymentMethods();
    const ids = methods.map((m) => m.id);
    expect(ids).toContain("visa");
    expect(ids).toContain("naranja");
    expect(ids).toContain("account_money");
    expect(ids).toContain("rapipago");
  });

  it("returns installment offers with recommended_message strings", async () => {
    const offers = await client.getInstallments({
      amount: 12000,
      paymentMethodId: "visa",
    });
    expect(offers.length).toBeGreaterThan(0);
    const visaOffer = offers[0]!;
    const sixCuotas = visaOffer.payer_costs.find((pc) => pc.installments === 6);
    expect(sixCuotas).toBeDefined();
    expect(sixCuotas!.recommended_message).toMatch(/sin interés/i);
  });
});

describe("MercadoPagoClient — Account", () => {
  it("returns account info from /users/me", async () => {
    const me = await client.getMe();
    expect(me.country_id).toBe("AR");
    expect(me.site_id).toBe("MLA");
    expect(me.user_type).toBe("registered");
  });
});
