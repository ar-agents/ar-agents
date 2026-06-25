import { beforeEach, describe, expect, it, vi } from "vitest";

// The routes call @vercel/kv directly for the pending/sub/key records. The
// audit + capability-token libs are env-gated (KV_REST_API_* absent → in-memory),
// so this mock only backs the routes' direct kv calls.
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
  },
}));

import { POST as subscribe } from "../src/app/api/auditor/subscribe/route";
import { POST as activate } from "../src/app/api/auditor/activate/route";

beforeEach(() => {
  kvStore.clear();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-seller";
});

function mockMp(opts: {
  preapprovalId?: string;
  activate?: Record<string, unknown>;
}) {
  const id = opts.preapprovalId ?? "pre_abc12345";
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === "https://api.mercadopago.com/preapproval" && init?.method === "POST") {
      return new Response(
        JSON.stringify({ id, init_point: "https://mp/checkout", status: "pending" }),
        { status: 200 },
      );
    }
    if (u.startsWith("https://api.mercadopago.com/preapproval/")) {
      return new Response(
        JSON.stringify(
          opts.activate ?? { status: "authorized", payer_email: "buyer@test.com" },
        ),
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as typeof fetch;
  return id;
}

// Each request gets a distinct client IP so per-IP rate-limit buckets (shared
// in-memory across tests) don't bleed between cases. clientIp() prefers
// x-vercel-forwarded-for.
let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `10.1.0.${ipCounter}`;
}

async function callSubscribe(body: Record<string, unknown>): Promise<Response> {
  return subscribe(
    new Request("https://ar-agents.ar/api/auditor/subscribe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-forwarded-for": freshIp(),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function callActivate(preapprovalId: string): Promise<Response> {
  return activate(
    new Request("https://ar-agents.ar/api/auditor/activate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-forwarded-for": freshIp(),
      },
      body: JSON.stringify({ preapprovalId }),
    }),
  );
}

describe("auditor subscribe/activate — session binding (DeepSec deferred HIGH)", () => {
  it("activate binds to the SERVER-recorded session, ignoring mp.external_reference", async () => {
    // Subscribe → server generates the session + writes the pending row.
    const id = mockMp({
      preapprovalId: "pre_serverbind1",
      // Simulate an attacker-forged external_reference pointing at a victim.
      activate: {
        status: "authorized",
        payer_email: "buyer@test.com",
        external_reference: "VICTIM-session-public-id",
      },
    });
    const subRes = await callSubscribe({ payerEmail: "buyer@test.com", plan: "mensual" });
    const sub = (await subRes.json()) as { audit: { sessionId: string } };
    const serverSession = sub.audit.sessionId;
    expect(serverSession).toBeTruthy();

    const actRes = await callActivate(id);
    const act = (await actRes.json()) as {
      ok: boolean;
      apiKey: string;
      audit: { sessionId: string };
    };
    expect(act.ok).toBe(true);
    // Bound to the server session from the pending row, NOT the forged ref.
    expect(act.audit.sessionId).toBe(serverSession);
    expect(act.audit.sessionId).not.toBe("VICTIM-session-public-id");
    // The entitlement record also points at the server session.
    const ent = kvStore.get(`auditor:key:${act.apiKey}`) as { sessionId: string };
    expect(ent.sessionId).toBe(serverSession);
  });

  it("activate refuses a preapproval with no server pending record (forged / never-subscribed)", async () => {
    const id = mockMp({ preapprovalId: "pre_forged999" });
    // No subscribe call → no pending row.
    const res = await callActivate(id);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("subscription_unknown");
  });

  it("activate rejects when the authorized payer differs from the subscriber", async () => {
    const id = mockMp({
      preapprovalId: "pre_payer1",
      activate: { status: "authorized", payer_email: "someone-else@evil.com" },
    });
    await callSubscribe({ payerEmail: "buyer@test.com", plan: "mensual" });
    const res = await callActivate(id);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("payer_mismatch");
  });

  it("subscribe rejects continuing an existing session without a valid token (no cross-tenant binding)", async () => {
    mockMp({ preapprovalId: "pre_tok1" });
    const res = await callSubscribe({
      payerEmail: "attacker@evil.com",
      plan: "mensual",
      sessionId: "victimsession01", // a public session the attacker doesn't own
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("session_token_required");
  });

  it("supports session continuity when the caller proves ownership with the token", async () => {
    mockMp({ preapprovalId: "pre_cont1" });
    const first = await callSubscribe({ payerEmail: "buyer@test.com", plan: "mensual" });
    const f = (await first.json()) as { sessionToken: string; audit: { sessionId: string } };
    expect(f.sessionToken).toBeTruthy();

    mockMp({ preapprovalId: "pre_cont2" });
    const second = await callSubscribe({
      payerEmail: "buyer@test.com",
      plan: "anual",
      sessionId: f.audit.sessionId,
      sessionToken: f.sessionToken,
    });
    expect(second.status).toBe(200);
    const s = (await second.json()) as { audit: { sessionId: string } };
    expect(s.audit.sessionId).toBe(f.audit.sessionId); // same session, proven
  });

  it("re-activation is idempotent (same preapproval → same key)", async () => {
    const id = mockMp({ preapprovalId: "pre_idem1" });
    await callSubscribe({ payerEmail: "buyer@test.com", plan: "mensual" });
    const a = (await (await callActivate(id)).json()) as { apiKey: string };
    const b = (await (await callActivate(id)).json()) as {
      apiKey: string;
      alreadyActive: boolean;
    };
    expect(b.apiKey).toBe(a.apiKey);
    expect(b.alreadyActive).toBe(true);
  });
});
