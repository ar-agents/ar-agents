import { describe, expect, it } from "vitest";
import "./setup";
import { MercadoPagoClient } from "../src";

const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });

describe("Customer + Card extensions (v0.7)", () => {
  it("getCustomer returns the customer", async () => {
    const c = await client.getCustomer("cust-abc");
    expect(c.id).toBe("cust-abc");
    expect(c.email).toContain("cust-abc");
  });

  it("updateCustomer merges patch into the customer", async () => {
    const c = await client.updateCustomer("cust-xyz", { first_name: "New", last_name: "Name" });
    expect(c.id).toBe("cust-xyz");
  });

  it("createCustomerCard saves a card via token", async () => {
    const card = await client.createCustomerCard("cust-1", "TOKEN_FAKE_123");
    expect(card.id).toMatch(/^card-/);
    expect(card.last_four_digits).toBe("1234");
  });
});

describe("Subscription update + search (v0.7)", () => {
  it("updatePreapproval sends PUT /preapproval/:id", async () => {
    let capturedBody: Record<string, unknown> = {};
    const customClient = new MercadoPagoClient({
      accessToken: "TEST-fake-token",
      fetch: ((async (_url: string, init: RequestInit) => {
        if (init.method === "PUT") {
          capturedBody = JSON.parse(init.body as string);
        }
        return new Response(
          JSON.stringify({
            id: "sub-1",
            status: "paused",
            payer_email: "buyer@test.com",
            init_point: "https://mp.test/sub-1",
            date_created: "2026-04-01T00:00:00Z",
            last_modified: "2026-05-06T00:00:00Z",
            auto_recurring: {
              frequency: 1,
              frequency_type: "months",
              transaction_amount: 1500,
              currency_id: "ARS",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as unknown) as typeof fetch,
    });
    const sub = await customClient.updatePreapproval("sub-1", {
      transaction_amount: 1500,
      status: "paused",
    });
    expect(sub.id).toBe("sub-1");
    expect(capturedBody.transaction_amount).toBe(1500);
    expect(capturedBody.status).toBe("paused");
  });

  it("searchPreapprovals returns paginated results", async () => {
    const r = await client.searchPreapprovals({ status: "authorized", limit: 25 });
    expect(r.results).toHaveLength(2);
    expect(r.results[0]!.status).toBe("authorized");
    expect(r.paging.total).toBe(2);
  });
});

describe("Refund get (v0.7)", () => {
  it("getRefund returns a single refund", async () => {
    const r = await client.getRefund("payment-1", "refund-99");
    expect(r.id).toBe("refund-99");
    expect(r.amount).toBe(500);
  });
});

describe("Merchant Orders (v0.7)", () => {
  it("getMerchantOrder returns the order with payments", async () => {
    const mo = await client.getMerchantOrder("mo-abc");
    expect(mo.id).toBe("mo-abc");
    expect(mo.payments).toHaveLength(1);
    expect(mo.paid_amount).toBe(1000);
  });

  it("searchMerchantOrders returns elements + paging", async () => {
    const r = await client.searchMerchantOrders({ preferenceId: "pref-1" });
    expect(r.elements).toHaveLength(1);
    expect(r.elements[0]!.preference_id).toBe("pref-1");
  });

  it("updateMerchantOrder PUTs the patch", async () => {
    const mo = await client.updateMerchantOrder("mo-1", { custom_field: "value" });
    expect(mo.id).toBe("mo-1");
  });
});

describe("Stores + POS CRUD (v0.7)", () => {
  it("getStore returns single store", async () => {
    const s = await client.getStore("user-1", "42");
    expect(String(s.id)).toBe("42");
  });

  it("updateStore merges patch", async () => {
    const s = await client.updateStore("user-1", "42", { name: "New Name" });
    expect(String(s.id)).toBe("42");
  });

  it("deleteStore returns void", async () => {
    await expect(client.deleteStore("user-1", "42")).resolves.not.toThrow();
  });

  it("getPos returns single POS", async () => {
    const p = await client.getPos("777");
    expect(p.id).toBe("777");
  });

  it("updatePos merges patch", async () => {
    const p = await client.updatePos("777", { name: "Updated POS" });
    expect(p.id).toBe("777");
  });

  it("deletePos returns void", async () => {
    await expect(client.deletePos("777")).resolves.not.toThrow();
  });
});

describe("Bank Accounts (v0.7)", () => {
  it("listBankAccounts returns the seller's CBUs", async () => {
    const accounts = await client.listBankAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.is_default).toBe(true);
    expect(accounts[0]!.bank_name).toBe("Banco Galicia");
  });

  it("registerBankAccount sends POST with CBU", async () => {
    const ba = await client.registerBankAccount({
      cbu: "0070123145678901234564",
      alias: "naza.alias",
    });
    expect(ba.cbu).toBe("0070123145678901234564");
  });
});

describe("Point Devices físicos (v0.7)", () => {
  it("listPointDevices returns devices + paging", async () => {
    const r = await client.listPointDevices();
    expect(r.devices).toHaveLength(1);
    expect(r.devices[0]!.operating_mode).toBe("PDV");
  });

  it("updatePointDeviceOperatingMode sends PATCH", async () => {
    const d = await client.updatePointDeviceOperatingMode("dev-1", "STANDALONE");
    expect(d.operating_mode).toBe("STANDALONE");
  });

  it("createPointPaymentIntent posts to device endpoint", async () => {
    const intent = await client.createPointPaymentIntent("dev-1", { amount: 10_000 });
    expect(intent.id).toMatch(/^pi-/);
    expect(intent.state).toBe("OPEN");
    expect(intent.amount).toBe(10_000);
  });

  it("getPointPaymentIntent returns the intent state", async () => {
    const intent = await client.getPointPaymentIntent("pi-test");
    expect(intent.id).toBe("pi-test");
    expect(intent.state).toBe("FINISHED");
  });

  it("cancelPointPaymentIntent returns canceled flag", async () => {
    const r = await client.cancelPointPaymentIntent("dev-1", "pi-test");
    expect(r.canceled).toBe(true);
  });
});
