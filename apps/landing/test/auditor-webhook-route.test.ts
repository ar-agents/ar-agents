import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

/**
 * Route-level tests for POST /api/auditor/webhook (the Mercado Pago
 * subscription lifecycle sink):
 *  - x-signature verification (valid accepted, invalid/missing rejected,
 *    fail-open only when MP is not configured at all, fail-closed when a prod
 *    MP token is set without the webhook secret), and
 *  - the MP preapproval status to entitlement status mapping (STATUS_MAP)
 *    that /api/auditor/log gates on.
 *
 * The routes call @vercel/kv directly for the sub/key records; the audit lib is
 * env-gated (KV_REST_API_* absent, so in-memory). Fixtures use only fictional
 * PII (Juan Perez, CUIT 20-12345678-6).
 */

const { kvStore } = vi.hoisted(() => ({ kvStore: new Map<string, unknown>() }));
vi.mock("@vercel/kv", () => ({
  kv: {
    get: async (k: string) => kvStore.get(k) ?? null,
    set: async (k: string, v: unknown, o?: { nx?: boolean; ex?: number }) => {
      void o?.ex;
      if (o?.nx && kvStore.has(k)) return null;
      kvStore.set(k, v);
      return "OK";
    },
    del: async (k: string) => (kvStore.delete(k) ? 1 : 0),
  },
}));

import { POST as webhook } from "../src/app/api/auditor/webhook/route";

const SECRET = "test-webhook-secret-abc123";
const API_KEY = "arag_live_" + "c".repeat(48);

beforeEach(() => {
  kvStore.clear();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-seller";
  process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
});

/** Seed the sub + entitlement rows the webhook resolves. */
function seedEntitlement(preapprovalId: string, status: string): void {
  kvStore.set(`auditor:sub:${preapprovalId}`, {
    apiKey: API_KEY,
    sessionId: "sess-webhook-test",
  });
  kvStore.set(`auditor:key:${API_KEY}`, {
    preapprovalId,
    payerEmail: "juan.perez@example.com",
    plan: "mensual",
    sessionId: "sess-webhook-test",
    createdAt: "2026-01-01T00:00:00.000Z",
    status,
  });
}

function entitlementStatus(): string {
  return (kvStore.get(`auditor:key:${API_KEY}`) as { status: string }).status;
}

/** MP's authoritative preapproval status the mocked re-fetch returns. */
function mockMpStatus(status: string): void {
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    if (u.startsWith("https://api.mercadopago.com/preapproval/")) {
      return new Response(JSON.stringify({ status }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as typeof fetch;
}

/** The exact manifest MP signs: id:<data.id>;request-id:<x-request-id>;ts:<ts>; */
function signValid(dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hex = createHmac("sha256", SECRET).update(manifest).digest("hex");
  return `ts=${ts},v1=${hex}`;
}

function callWebhook(
  dataId: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return webhook(
    new Request("https://ar-agents.ar/api/auditor/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ type: "subscription_preapproval", data: { id: dataId } }),
    }),
  );
}

describe("auditor/webhook signature verification", () => {
  it("accepts a valid x-signature (HMAC over the MP manifest)", async () => {
    const id = "pre_sig_ok";
    seedEntitlement(id, "paused");
    mockMpStatus("authorized");
    const ts = "1720000000";
    const res = await callWebhook(id, {
      "x-request-id": "req-1",
      "x-signature": signValid(id, "req-1", ts),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; entitlementStatus: string };
    expect(body.ok).toBe(true);
    expect(body.entitlementStatus).toBe("active");
  });

  it("rejects an invalid v1 signature with 401 and does not touch the entitlement", async () => {
    const id = "pre_sig_bad";
    seedEntitlement(id, "active");
    mockMpStatus("cancelled");
    const res = await callWebhook(id, {
      "x-request-id": "req-2",
      "x-signature": "ts=1720000000,v1=" + "0".repeat(64),
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_signature");
    expect(entitlementStatus()).toBe("active"); // unchanged
  });

  it("rejects a missing x-signature with 401 when the secret is configured", async () => {
    const id = "pre_sig_missing";
    seedEntitlement(id, "active");
    mockMpStatus("cancelled");
    const res = await callWebhook(id);
    expect(res.status).toBe(401);
    expect(entitlementStatus()).toBe("active");
  });

  it("rejects a signature whose ts was tampered (manifest mismatch)", async () => {
    const id = "pre_sig_tamper";
    seedEntitlement(id, "active");
    mockMpStatus("cancelled");
    const good = signValid(id, "req-3", "1720000000");
    const tampered = good.replace("ts=1720000000", "ts=1720009999");
    const res = await callWebhook(id, { "x-request-id": "req-3", "x-signature": tampered });
    expect(res.status).toBe(401);
  });

  it("FAILS CLOSED when a prod MP token is set but the webhook secret is missing", async () => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    process.env.MERCADOPAGO_ACCESS_TOKEN = "PROD-seller";
    const id = "pre_misconfig";
    seedEntitlement(id, "active");
    mockMpStatus("cancelled");
    const res = await callWebhook(id);
    expect(res.status).toBe(401);
    expect(entitlementStatus()).toBe("active");
  });

  it("fails open (acknowledges, no entitlement change) only when MP is not configured at all", async () => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    const id = "pre_no_mp";
    const res = await callWebhook(id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; ignored: boolean; reason: string };
    expect(body.ignored).toBe(true);
    expect(body.reason).toBe("mp_not_configured");
  });
});

describe("auditor/webhook STATUS_MAP (MP preapproval to entitlement)", () => {
  async function transition(mpStatus: string, from: string): Promise<Response> {
    const id = `pre_map_${mpStatus}`;
    seedEntitlement(id, from);
    mockMpStatus(mpStatus);
    const ts = "1720000001";
    return callWebhook(id, {
      "x-request-id": "req-map",
      "x-signature": signValid(id, "req-map", ts),
    });
  }

  it("authorized maps to active", async () => {
    const res = await transition("authorized", "paused");
    expect(((await res.json()) as { entitlementStatus: string }).entitlementStatus).toBe("active");
    expect(entitlementStatus()).toBe("active");
  });

  it("paused maps to paused (access stops)", async () => {
    const res = await transition("paused", "active");
    expect(((await res.json()) as { entitlementStatus: string }).entitlementStatus).toBe("paused");
    expect(entitlementStatus()).toBe("paused");
  });

  it("cancelled maps to cancelled (access stops)", async () => {
    const res = await transition("cancelled", "active");
    expect(((await res.json()) as { entitlementStatus: string }).entitlementStatus).toBe(
      "cancelled",
    );
    expect(entitlementStatus()).toBe("cancelled");
  });

  it("an unmapped MP status (pending) leaves the entitlement unchanged", async () => {
    const res = await transition("pending", "active");
    const body = (await res.json()) as { entitlementStatus: string; mpStatus: string };
    expect(body.entitlementStatus).toBe("unchanged");
    expect(body.mpStatus).toBe("pending");
    expect(entitlementStatus()).toBe("active");
  });

  it("acknowledges an event for a preapproval we never activated (no entitlement)", async () => {
    const id = "pre_unknown";
    mockMpStatus("authorized");
    const res = await callWebhook(id, {
      "x-request-id": "req-x",
      "x-signature": signValid(id, "req-x", "1720000002"),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { noEntitlement: boolean }).noEntitlement).toBe(true);
  });

  it("acknowledges and ignores non-preapproval events without verifying", async () => {
    const res = await webhook(
      new Request("https://ar-agents.ar/api/auditor/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "payment", data: { id: "pay_1" } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ignored: boolean }).ignored).toBe(true);
  });
});
