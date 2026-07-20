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

// streamText is mocked so the locale-threading tests below can run the
// route past resolveModelForAgent without a real model call, and inspect
// exactly what `system` prompt string streamText was given (M1-3d: "the
// agent route test threads the locale through").
const { streamTextMock } = vi.hoisted(() => ({ streamTextMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: (options: Record<string, unknown>) => {
      streamTextMock(options);
      return {
        toUIMessageStreamResponse: () => new Response(null, { status: 200 }),
      };
    },
  };
});

// resolveModelForAgent is left at its real behavior by default (so the
// existing "no_model_configured" test below is untouched); the locale
// describe block below opts into a stub result via `modelOverride.current`
// so it can reach streamText without real provider keys.
const { modelOverride } = vi.hoisted(() => ({
  modelOverride: { current: null as null | { model: unknown; modelId: string } },
}));
vi.mock("@/lib/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/models")>();
  return {
    ...actual,
    resolveModelForAgent: () => modelOverride.current ?? actual.resolveModelForAgent(),
  };
});

import { createAccount } from "../src/lib/account";
import { POST } from "../src/app/api/agent/route";

const MODEL_ENV_KEYS = ["OPENROUTER_API_KEY", "AI_GATEWAY_API_KEY", "STUDIO_FREE_CAP_MICRO_USD"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  store.clear();
  streamTextMock.mockClear();
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

function chatBody(extra: Record<string, unknown> = {}) {
  return {
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hola" }] }],
    ...extra,
  };
}

function req(headers: Record<string, string> = {}, body: Record<string, unknown> = chatBody()) {
  return new Request("https://x/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
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

// M1-3d: the client-sent locale threads through into buildSystemPrompt's
// `system` string. resolveModelForAgent and streamText are mocked above so
// these reach that call without a real model or provider key.
describe("POST /api/agent: locale threading (M1-3d)", () => {
  beforeEach(() => {
    modelOverride.current = { model: {}, modelId: "test/stub-model" };
  });
  afterEach(() => {
    modelOverride.current = null;
  });

  async function systemPromptFor(body: Record<string, unknown>): Promise<string> {
    const created = await createAccount();
    const res = await POST(req({ "x-studio-token": created!.token }, chatBody(body)));
    expect(res.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const options = streamTextMock.mock.calls[0][0] as { system: string };
    return options.system;
  }

  it("defaults to the Spanish instruction when no locale is sent", async () => {
    const system = await systemPromptFor({});
    expect(system).toMatch(/Selected UI language: Spanish \(es\)/);
  });

  it("threads locale: 'en' into the English instruction", async () => {
    const system = await systemPromptFor({ locale: "en" });
    expect(system).toMatch(/Selected UI language: English \(en\)/);
  });

  it("threads locale: 'es' into the Spanish instruction", async () => {
    const system = await systemPromptFor({ locale: "es" });
    expect(system).toMatch(/Selected UI language: Spanish \(es\)/);
  });

  it("falls back to Spanish for an unrecognized locale value", async () => {
    const system = await systemPromptFor({ locale: "fr" });
    expect(system).toMatch(/Selected UI language: Spanish \(es\)/);
  });

  it("falls back to Spanish for a non-string locale value", async () => {
    const system = await systemPromptFor({ locale: 123 });
    expect(system).toMatch(/Selected UI language: Spanish \(es\)/);
  });

  it("keeps the corpus digest in the threaded system prompt", async () => {
    const system = await systemPromptFor({ locale: "en" });
    expect(system).toContain("Lean startup");
    expect(system).toContain("Paul Graham");
  });
});
