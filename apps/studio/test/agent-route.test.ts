import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A faithful in-memory @vercel/kv mock, covering everything account.ts +
// meter.ts touch (set/get/del for tokens+locks, incrby for usage counters).
const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("@vercel/kv", () => ({
  kv: {
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    get: async (k: string) => store.get(k) ?? null,
    del: async (k: string) => (store.delete(k) ? 1 : 0),
    incrby: async (k: string, n: number) => {
      const cur = Number(store.get(k) ?? 0) + n;
      store.set(k, cur);
      return cur;
    },
  },
}));

import { createAccount } from "../src/lib/account";
import { POST } from "../src/app/api/agent/route";

const MODEL_ENV_KEYS = ["OPENROUTER_API_KEY", "AI_GATEWAY_API_KEY", "STUDIO_FREE_CAP_MICRO_USD"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  store.clear();
  process.env.KV_REST_API_URL = "https://stub.upstash.io";
  process.env.KV_REST_API_TOKEN = "stub";
  for (const k of MODEL_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  for (const k of MODEL_ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function chatBody() {
  return {
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hola" }] }],
  };
}

function req(headers: Record<string, string> = {}) {
  return new Request("https://x/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(chatBody()),
  });
}

describe("POST /api/agent", () => {
  it("401s with no x-studio-token header", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "no_autorizado" });
  });

  it("401s with a garbage token", async () => {
    const res = await POST(req({ "x-studio-token": "garbage" }));
    expect(res.status).toBe(401);
  });

  it("503s with no_model_configured when neither model key is set", async () => {
    const created = await createAccount();
    const res = await POST(req({ "x-studio-token": created!.token }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "no_model_configured" });
  });

  it("400s on a malformed messages array (auth still checked first)", async () => {
    const created = await createAccount();
    const bad = new Request("https://x/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-studio-token": created!.token },
      body: JSON.stringify({ messages: "not-an-array" }),
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});
