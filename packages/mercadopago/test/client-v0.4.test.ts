import { describe, expect, it } from "vitest";
import "./setup";
import { MercadoPagoClient } from "../src";

const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });

describe("Subscription Plans (v0.4)", () => {
  it("creates a reusable plan", async () => {
    const plan = await client.createSubscriptionPlan({
      reason: "Plan Pro mensual",
      backUrl: "https://app.test/done",
      frequency: 1,
      frequencyType: "months",
      amount: 25000,
      currency: "ARS",
    });
    expect(plan.id).toMatch(/^plan_/);
    expect(plan.status).toBe("active");
    expect(plan.reason).toBe("Plan Pro mensual");
    expect(plan.auto_recurring.transaction_amount).toBe(25000);
  });

  it("supports free trial", async () => {
    const plan = await client.createSubscriptionPlan({
      reason: "Plan Pro con trial",
      backUrl: "https://app.test/done",
      frequency: 1,
      frequencyType: "months",
      amount: 25000,
      currency: "ARS",
      freeTrialFrequency: 14,
      freeTrialFrequencyType: "days",
    });
    expect(plan.id).toBeTruthy();
  });

  it("lists plans", async () => {
    const result = await client.listSubscriptionPlans();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.id).toBe("plan_test1");
  });

  it("gets a plan by id", async () => {
    const plan = await client.getSubscriptionPlan("plan_test1");
    expect(plan.id).toBe("plan_test1");
  });

  it("updates a plan amount", async () => {
    const updated = await client.updateSubscriptionPlan("plan_test1", { amount: 30000 });
    expect(updated.id).toBe("plan_test1");
  });

  it("subscribes a customer to a plan", async () => {
    // subscribeToPlan uses the existing /preapproval endpoint with preapproval_plan_id
    const sub = await client.subscribeToPlan({
      planId: "plan_test1",
      payerEmail: "buyer@test.com",
    });
    expect(sub.id).toBeTruthy();
    expect(sub.payer_email).toBe("buyer@test.com");
    expect(sub.init_point).toMatch(/^https:\/\//);
  });
});

describe("Subscription payment history", () => {
  it("lists authorized_payments under a preapproval", async () => {
    const result = await client.listSubscriptionPayments("preap_xyz");
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.preapproval_id).toBe("preap_xyz");
    expect(result.results[0]!.status).toBe("approved");
  });
});

describe("Stores + POS (v0.4)", () => {
  it("creates a store under the seller", async () => {
    const store = await client.createStore("999", {
      name: "Sucursal Centro",
      externalId: "centro_1",
      location: { addressLine: "Cabo Corrientes 468", cityName: "Monte Grande", countryId: "AR" },
    });
    expect(store.id).toMatch(/^store_/);
    expect(store.name).toBe("Sucursal Centro");
  });

  it("lists stores", async () => {
    const result = await client.listStores("999");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.id).toBe("store_test");
  });

  it("creates a POS under a store", async () => {
    const pos = await client.createPos({
      name: "Caja 1",
      externalId: "caja_1",
      storeId: "store_test",
    });
    expect(pos.id).toMatch(/^pos_/);
    expect(pos.external_id).toBe("caja_1");
  });

  it("lists POSes", async () => {
    const result = await client.listPos();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.id).toBe("pos_test");
  });
});

describe("Disputes (v0.4)", () => {
  it("lists disputes for a payment", async () => {
    const disputes = await client.listPaymentDisputes("p_with_dispute");
    expect(disputes).toHaveLength(1);
    expect(disputes[0]!.status).toBe("open");
    expect(disputes[0]!.reason).toMatch(/no recibido/i);
  });

  it("gets a single dispute", async () => {
    const d = await client.getDispute("p_x", "dispute_1");
    expect(d.id).toBe("dispute_1");
    expect(d.reason_description).toBeTruthy();
  });
});

describe("Identification Types + Issuers (v0.4)", () => {
  it("lists AR identification types", async () => {
    const types = await client.listIdentificationTypes();
    const ids = types.map((t) => t.id);
    expect(ids).toContain("DNI");
    expect(ids).toContain("CUIT");
    expect(ids).toContain("CUIL");
  });

  it("lists card issuers", async () => {
    const issuers = await client.listIssuers({ paymentMethodId: "visa" });
    expect(issuers.length).toBeGreaterThan(0);
    expect(issuers[0]!.name).toBeTruthy();
  });

  it("lists card issuers with bin filter", async () => {
    const issuers = await client.listIssuers({ paymentMethodId: "visa", bin: "450995" });
    expect(issuers.length).toBeGreaterThan(0);
  });
});

describe("Webhooks management (v0.4)", () => {
  it("lists configured webhooks", async () => {
    const hooks = await client.listWebhooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0]!.topic).toBe("payment");
  });

  it("creates a webhook subscription", async () => {
    const hook = await client.createWebhook({
      url: "https://app.test/api/wh",
      topic: "subscription_authorized_payment",
    });
    expect(hook.url).toBe("https://app.test/api/wh");
    expect(hook.topic).toBe("subscription_authorized_payment");
  });

  it("updates a webhook", async () => {
    const hook = await client.updateWebhook("1", { url: "https://app.test/new-wh" });
    expect(hook.url).toBe("https://app.test/new-wh");
  });

  it("deletes a webhook", async () => {
    await expect(client.deleteWebhook("1")).resolves.toBeUndefined();
  });
});
