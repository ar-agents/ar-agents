import { describe, expect, it } from "vitest";
import "./setup";
import { MercadoPagoClient } from "../src";

const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });

describe("Order Management API (v0.5)", () => {
  it("creates a basic online Order", async () => {
    const order = await client.createOrder({
      type: "online",
      currency_id: "ARS",
      total_amount: 5000,
      external_reference: "test-order-1",
    });
    expect(order.id).toMatch(/^order_/);
    expect(order.status).toBe("created");
    expect(order.capture_mode).toBe("automatic");
  });

  it("creates an auth-only (manual capture) Order", async () => {
    const order = await client.createOrder({
      type: "online",
      total_amount: 1500,
      capture_mode: "manual",
    });
    expect(order.capture_mode).toBe("manual");
    expect(order.status).toBe("action_required");
  });

  it("creates an Order with marketplace split params", async () => {
    const order = await client.createOrder({
      type: "online",
      total_amount: 10000,
      marketplace: "MyMarketplace",
      marketplace_fee: 500,
      collector_id: "987654321",
    });
    expect(order.id).toMatch(/^order_/);
  });

  it("fetches an Order by id", async () => {
    const order = await client.getOrder("order_test_123");
    expect(order.id).toBe("order_test_123");
    expect(order.total_amount).toBe(1000);
  });

  it("captures an authorized Order", async () => {
    const order = await client.captureOrder("order_test_123", 750);
    expect(order.status).toBe("processed");
    expect(order.total_amount).toBe(750);
  });

  it("captures the full authorized amount when amount omitted", async () => {
    const order = await client.captureOrder("order_test_456");
    expect(order.status).toBe("processed");
  });

  it("cancels an Order", async () => {
    const order = await client.cancelOrder("order_test_789");
    expect(order.status).toBe("canceled");
  });

  it("updates an Order", async () => {
    const order = await client.updateOrder("order_test_999", {
      external_reference: "updated-ref",
    });
    expect(order.id).toBe("order_test_999");
  });
});

describe("Marketplace split params on Preference (v0.5)", () => {
  it("forwards marketplace fields to /checkout/preferences", async () => {
    // Capture body via a custom fetch wrapper
    let capturedBody: Record<string, unknown> = {};
    const customClient = new MercadoPagoClient({
      accessToken: "TEST-fake-token",
      fetch: ((async (url: string, init: RequestInit) => {
        if (typeof init.body === "string") {
          capturedBody = JSON.parse(init.body);
        }
        return new Response(
          JSON.stringify({
            id: "pref-marketplace-test",
            init_point: "https://mp.test/init",
            sandbox_init_point: "https://mp.test/sandbox",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }) as unknown) as typeof fetch,
    });
    await customClient.createPreference({
      items: [{ title: "Test", quantity: 1, unit_price: 1000 }],
      marketplace: "MyMarketplace",
      marketplaceFee: 100,
      collectorId: "987654321",
    });
    expect(capturedBody.marketplace).toBe("MyMarketplace");
    expect(capturedBody.marketplace_fee).toBe(100);
    expect(capturedBody.collector_id).toBe("987654321");
  });
});
