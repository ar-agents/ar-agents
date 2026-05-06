import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import "./setup";
import {
  InMemoryStateAdapter,
  MercadoPagoClient,
  mercadoPagoTools,
} from "../src";

const SECRET = "test-webhook-secret";

function buildSetup() {
  const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });
  const tools = mercadoPagoTools(client, {
    state: new InMemoryStateAdapter(),
    backUrl: "https://app.test/done",
    webhookSecret: SECRET,
    oauth: {
      clientId: "MP_APP_ID",
      clientSecret: "MP_SECRET",
    },
  });
  return { client, tools };
}

function signWebhook(params: {
  dataId: string;
  requestId: string;
  ts: string;
  secret: string;
}): string {
  const manifest = `id:${params.dataId};request-id:${params.requestId};ts:${params.ts};`;
  const v1 = createHmac("sha256", params.secret).update(manifest).digest("hex");
  return `ts=${params.ts},v1=${v1}`;
}

describe("handle_webhook tool (v0.5)", () => {
  it("verifies + parses a payment webhook (no auto-fetch)", async () => {
    const { tools } = buildSetup();
    const dataId = "1234567890";
    const requestId = "req-abc-123";
    const ts = "1700000000";
    const rawBody = JSON.stringify({
      action: "payment.updated",
      type: "payment",
      data: { id: dataId },
      date_created: "2026-05-06T12:00:00Z",
    });
    const signatureHeader = signWebhook({ dataId, requestId, ts, secret: SECRET });

    const result = (await tools.handle_webhook!.execute!(
      {
        raw_body: rawBody,
        signature_header: signatureHeader,
        request_id_header: requestId,
        auto_fetch: false,
      },
      { toolCallId: "t1", messages: [] } as never,
    )) as {
      verified: boolean;
      event: { topic: string; dataId: string };
      resource: unknown;
    };

    expect(result.verified).toBe(true);
    expect(result.event.topic).toBe("payment");
    expect(result.event.dataId).toBe(dataId);
    expect(result.resource).toBeNull();
  });

  it("auto-fetches the payment when auto_fetch=true and payment exists", async () => {
    const { client, tools } = buildSetup();
    // Pre-create a payment so MSW handler returns it
    const created = await client.createPayment({
      transaction_amount: 1000,
      payment_method_id: "visa",
      payer: { email: "buyer@test.com" },
      token: "fake-token",
      description: "test",
    });
    const dataId = created.id;
    const requestId = "req-fetch-123";
    const ts = "1700000000";
    const rawBody = JSON.stringify({ type: "payment", data: { id: dataId } });
    const signatureHeader = signWebhook({ dataId, requestId, ts, secret: SECRET });

    const result = (await tools.handle_webhook!.execute!(
      {
        raw_body: rawBody,
        signature_header: signatureHeader,
        request_id_header: requestId,
        auto_fetch: true,
      },
      { toolCallId: "t-fetch", messages: [] } as never,
    )) as {
      verified: boolean;
      resource: { id: string } | null;
      resource_error: string | null;
    };

    expect(result.verified).toBe(true);
    expect(result.resource).not.toBeNull();
    expect(result.resource?.id).toBe(dataId);
  });

  it("returns verified=false when signature mismatches", async () => {
    const { tools } = buildSetup();
    const rawBody = JSON.stringify({
      type: "payment",
      data: { id: "999" },
    });
    const result = (await tools.handle_webhook!.execute!(
      {
        raw_body: rawBody,
        signature_header: "ts=1700000000,v1=BAD_SIGNATURE_HEX",
        request_id_header: "req-abc-123",
        auto_fetch: true,
      },
      { toolCallId: "t2", messages: [] } as never,
    )) as { verified: boolean; error: string };

    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/signature mismatch|HTTP 401/);
  });

  it("returns verified=false when raw_body is not JSON", async () => {
    const { tools } = buildSetup();
    const result = (await tools.handle_webhook!.execute!(
      {
        raw_body: "<html>not json</html>",
        signature_header: "ts=1,v1=x",
        request_id_header: "r1",
        auto_fetch: false,
      },
      { toolCallId: "t3", messages: [] } as never,
    )) as { verified: boolean; error: string };
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/not valid JSON/);
  });

  it("returns error when webhookSecret is missing", async () => {
    const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });
    const tools = mercadoPagoTools(client, {
      state: new InMemoryStateAdapter(),
      backUrl: "https://app.test/done",
      // no webhookSecret
    });
    const result = (await tools.handle_webhook!.execute!(
      {
        raw_body: JSON.stringify({ type: "payment", data: { id: "1" } }),
        signature_header: "ts=1,v1=x",
        request_id_header: "r1",
        auto_fetch: false,
      },
      { toolCallId: "t4", messages: [] } as never,
    )) as { verified: boolean; error: string };
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/webhookSecret not configured/);
  });

  it("skips auto_fetch when set to false", async () => {
    const { tools } = buildSetup();
    const dataId = "111222333";
    const requestId = "req-xyz";
    const ts = "1700000000";
    const result = (await tools.handle_webhook!.execute!(
      {
        raw_body: JSON.stringify({ type: "payment", data: { id: dataId } }),
        signature_header: signWebhook({ dataId, requestId, ts, secret: SECRET }),
        request_id_header: requestId,
        auto_fetch: false,
      },
      { toolCallId: "t5", messages: [] } as never,
    )) as { verified: boolean; resource: unknown };
    expect(result.verified).toBe(true);
    expect(result.resource).toBeNull();
  });
});

describe("OAuth tools (v0.5)", () => {
  it("oauth_authorize_url returns the URL with embedded state", async () => {
    const { tools } = buildSetup();
    const result = (await tools.oauth_authorize_url!.execute!(
      {
        redirect_uri: "https://app.test/oauth/callback",
        state: "session-token-abc-12345",
      },
      { toolCallId: "t1", messages: [] } as never,
    )) as { available: boolean; url: string };
    expect(result.available).toBe(true);
    expect(result.url).toContain("client_id=MP_APP_ID");
    expect(result.url).toContain("state=session-token-abc-12345");
  });

  it("oauth_exchange_code returns a token bundle", async () => {
    const { tools } = buildSetup();
    const result = (await tools.oauth_exchange_code!.execute!(
      {
        code: "TG-test-code",
        redirect_uri: "https://app.test/oauth/callback",
      },
      { toolCallId: "t2", messages: [] } as never,
    )) as {
      available: boolean;
      token: {
        access_token: string;
        refresh_token: string;
        user_id: string;
        expires_in: number;
      };
    };
    expect(result.available).toBe(true);
    expect(result.token.access_token).toMatch(/^APP_USR-/);
    expect(result.token.user_id).toBe("987654321");
  });

  it("oauth_refresh_token returns a fresh token", async () => {
    const { tools } = buildSetup();
    const result = (await tools.oauth_refresh_token!.execute!(
      { refresh_token: "TG-old-refresh" },
      { toolCallId: "t3", messages: [] } as never,
    )) as {
      available: boolean;
      token: { access_token: string; refresh_token: string };
    };
    expect(result.available).toBe(true);
    expect(result.token.access_token).toBe("APP_USR-refreshed-access-token");
    expect(result.token.refresh_token).toBe("TG-test-refresh-token-rotated");
  });

  it("oauth_exchange_code returns 'not configured' when oauth opts omitted", async () => {
    const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });
    const tools = mercadoPagoTools(client, {
      state: new InMemoryStateAdapter(),
      backUrl: "https://app.test/done",
      // no oauth
    });
    const result = (await tools.oauth_exchange_code!.execute!(
      { code: "x", redirect_uri: "https://app.test/cb" },
      { toolCallId: "t4", messages: [] } as never,
    )) as { available: boolean; error: string };
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/OAuth not configured/);
  });

  it("oauth_exchange_code surfaces upstream errors", async () => {
    const { tools } = buildSetup();
    const result = (await tools.oauth_exchange_code!.execute!(
      { code: "BAD_CODE", redirect_uri: "https://app.test/cb" },
      { toolCallId: "t5", messages: [] } as never,
    )) as { available: boolean; error: string; token: unknown };
    expect(result.available).toBe(true);
    expect(result.token).toBeNull();
    expect(result.error).toMatch(/MP OAuth 400/);
  });
});

describe("Order tools (v0.5)", () => {
  it("create_order returns order_id + status", async () => {
    const { tools } = buildSetup();
    const result = (await tools.create_order!.execute!(
      {
        type: "online",
        currency_id: "ARS",
        total_amount: 5000,
        external_reference: "test-order-1",
      },
      { toolCallId: "t1", messages: [] } as never,
    )) as { order_id: string; status: string; capture_mode: string };
    expect(result.order_id).toMatch(/^order_/);
    expect(result.capture_mode).toBe("automatic");
  });

  it("create_order with manual capture mode", async () => {
    const { tools } = buildSetup();
    const result = (await tools.create_order!.execute!(
      {
        type: "online",
        total_amount: 1500,
        capture_mode: "manual",
      },
      { toolCallId: "t2", messages: [] } as never,
    )) as { capture_mode: string; status: string };
    expect(result.capture_mode).toBe("manual");
    expect(result.status).toBe("action_required");
  });

  it("create_order with marketplace split", async () => {
    const { tools } = buildSetup();
    const result = (await tools.create_order!.execute!(
      {
        type: "online",
        total_amount: 10000,
        marketplace: "MyMarketplace",
        marketplace_fee: 500,
        collector_id: "987654321",
      },
      { toolCallId: "t3", messages: [] } as never,
    )) as { order_id: string };
    expect(result.order_id).toMatch(/^order_/);
  });

  it("get_order returns the order", async () => {
    const { tools } = buildSetup();
    const result = (await tools.get_order!.execute!(
      { order_id: "order_abc" },
      { toolCallId: "t4", messages: [] } as never,
    )) as { id: string };
    expect(result.id).toBe("order_abc");
  });

  it("capture_order processes the order", async () => {
    const { tools } = buildSetup();
    const result = (await tools.capture_order!.execute!(
      { order_id: "order_xyz", amount: 750 },
      { toolCallId: "t5", messages: [] } as never,
    )) as { order_id: string; status: string; captured_amount: number };
    expect(result.status).toBe("processed");
    expect(result.captured_amount).toBe(750);
  });

  it("cancel_order returns canceled status", async () => {
    const { tools } = buildSetup();
    const result = (await tools.cancel_order!.execute!(
      { order_id: "order_canc" },
      { toolCallId: "t6", messages: [] } as never,
    )) as { status: string };
    expect(result.status).toBe("canceled");
  });
});
