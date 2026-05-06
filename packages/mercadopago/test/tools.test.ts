import { describe, expect, it } from "vitest";
import {
  InMemoryStateAdapter,
  MercadoPagoClient,
  mercadoPagoTools,
} from "../src";

function buildSetup() {
  const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });
  const state = new InMemoryStateAdapter();
  const tools = mercadoPagoTools(client, {
    state,
    backUrl: "https://example.com/done",
  });
  return { client, state, tools };
}

describe("mercadoPagoTools", () => {
  it("exposes the full v0.9 tool surface (82 tools)", () => {
    const { tools } = buildSetup();
    expect(Object.keys(tools).sort()).toEqual([
      "analyze_payment_3ds",
      "calculate_installments",
      "cancel_order",
      "cancel_payment",
      "cancel_point_payment_intent",
      "cancel_qr_payment",
      "cancel_subscription",
      "capture_order",
      "capture_payment",
      "charge_saved_card",
      "compute_marketplace_fee",
      "create_customer",
      "create_customer_card",
      "create_order",
      "create_payment",
      "create_payment_preference",
      "create_point_payment_intent",
      "create_pos",
      "create_qr_payment",
      "create_store",
      "create_subscription",
      "create_subscription_plan",
      "create_webhook",
      "delete_customer_card",
      "delete_pos",
      "delete_store",
      "delete_webhook",
      "explain_payment_status",
      "find_customer_by_email",
      "get_account_balance",
      "get_account_info",
      "get_customer",
      "get_customer_card",
      "get_dispute",
      "get_merchant_order",
      "get_order",
      "get_payment",
      "get_payment_preference",
      "get_point_payment_intent",
      "get_pos",
      "get_refund",
      "get_settlement",
      "get_store",
      "get_subscription_plan",
      "get_subscription_status",
      "get_test_cards",
      "handle_webhook",
      "list_account_movements",
      "list_bank_accounts",
      "list_customer_cards",
      "list_identification_types",
      "list_issuers",
      "list_payment_disputes",
      "list_payment_methods",
      "list_point_devices",
      "list_pos",
      "list_refunds",
      "list_settlements",
      "list_stores",
      "list_subscription_payments",
      "list_subscription_plans",
      "list_webhooks",
      "mp_health_check",
      "oauth_authorize_url",
      "oauth_exchange_code",
      "oauth_refresh_token",
      "pause_subscription",
      "refund_payment",
      "register_bank_account",
      "resume_subscription",
      "search_merchant_orders",
      "search_payments",
      "search_subscriptions",
      "subscribe_to_plan",
      "update_customer",
      "update_merchant_order",
      "update_order",
      "update_payment_preference",
      "update_point_device_mode",
      "update_pos",
      "update_store",
      "update_subscription",
      "update_subscription_plan",
      "update_webhook",
    ]);
  });

  describe("create_subscription", () => {
    it("creates a subscription via MP and persists state", async () => {
      const { state, tools } = buildSetup();
      const create = tools.create_subscription!;
      const result = (await create.execute!(
        {
          customer_email: "buyer@test.com",
          amount_ars: 100,
          frequency_months: 1,
          reason: "Plan test",
        },
        { toolCallId: "t1", messages: [] } as never,
      )) as {
        subscription_id: string;
        status: string;
        init_point_url: string;
        next_step: string;
      };

      expect(result.subscription_id).toMatch(/^fake_/);
      expect(result.status).toBe("pending");
      expect(result.init_point_url).toContain("preapproval_id=");

      const stored = await state.get(result.subscription_id);
      expect(stored).toMatchObject({
        status: "pending",
        payerEmail: "buyer@test.com",
        amount: 100,
        currency: "ARS",
        frequency: 1,
        frequencyType: "months",
      });
      expect(stored?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it("uses the configured backUrl, rejects when caller gives bad backUrl in opts", async () => {
      const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });
      const state = new InMemoryStateAdapter();
      const tools = mercadoPagoTools(client, {
        state,
        backUrl: "http://localhost:3000/done", // intentionally invalid
      });
      const create = tools.create_subscription!;
      await expect(
        create.execute!(
          {
            customer_email: "buyer@test.com",
            amount_ars: 100,
            frequency_months: 1,
            reason: "Plan test",
          },
          { toolCallId: "t1", messages: [] } as never,
        ),
      ).rejects.toThrowError(/back_url/);
    });
  });

  describe("get_subscription_status", () => {
    it("returns merged MP + cached webhook state", async () => {
      const { state, tools } = buildSetup();
      const create = tools.create_subscription!;
      const created = (await create.execute!(
        {
          customer_email: "buyer@test.com",
          amount_ars: 100,
          frequency_months: 1,
          reason: "Plan",
        },
        { toolCallId: "t1", messages: [] } as never,
      )) as { subscription_id: string };

      // Simulate a webhook having updated the cache
      await state.set(created.subscription_id, {
        lastWebhookStatus: "authorized",
        lastWebhookAt: "2026-05-05T13:00:00Z",
      });

      const get = tools.get_subscription_status!;
      const status = (await get.execute!(
        { subscription_id: created.subscription_id },
        { toolCallId: "t2", messages: [] } as never,
      )) as {
        subscription_id: string;
        status: string;
        last_webhook_status: string | null;
        last_webhook_at: string | null;
      };

      expect(status.subscription_id).toBe(created.subscription_id);
      expect(status.status).toBe("pending");
      expect(status.last_webhook_status).toBe("authorized");
      expect(status.last_webhook_at).toBe("2026-05-05T13:00:00Z");
    });
  });

  describe("cancel_subscription", () => {
    it("cancels via MP and updates state with cancelledAt", async () => {
      const { state, tools } = buildSetup();
      const created = (await tools.create_subscription!.execute!(
        {
          customer_email: "buyer@test.com",
          amount_ars: 100,
          frequency_months: 1,
          reason: "Plan",
        },
        { toolCallId: "t1", messages: [] } as never,
      )) as { subscription_id: string };

      const result = (await tools.cancel_subscription!.execute!(
        { subscription_id: created.subscription_id },
        { toolCallId: "t2", messages: [] } as never,
      )) as { status: string };

      expect(result.status).toBe("cancelled");
      const stored = await state.get(created.subscription_id);
      expect(stored?.status).toBe("cancelled");
      expect(stored?.cancelledAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });
  });

  describe("custom descriptions", () => {
    it("overrides only the provided tool descriptions", () => {
      const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });
      const state = new InMemoryStateAdapter();
      const tools = mercadoPagoTools(client, {
        state,
        backUrl: "https://example.com/done",
        descriptions: {
          create_subscription: "Custom description for create.",
        },
      });
      expect(tools.create_subscription!.description).toBe(
        "Custom description for create.",
      );
      // Others untouched
      expect(tools.cancel_subscription!.description).toMatch(/irreversible/i);
    });
  });
});
