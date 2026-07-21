import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    incr: async (k: string) => {
      const current = (store.get(k) as number | undefined) ?? 0;
      const next = current + 1;
      store.set(k, next);
      return next;
    },
    expire: async (_k: string, _ttl: number) => 1,
  },
}));

import { createAccount, setStoredSociety, type StoredSociety } from "../src/lib/account";
import { POST } from "../src/app/api/society/suspend/route";

const FIXTURE: StoredSociety = {
  sessionId: "sess-1",
  denominacion: "Kiosco Automatizado SAS",
  tipo: "SAS",
  registryId: "reg-1",
  adminToken: "sat_x",
  gateToken: "sgt_x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store.clear();
  process.env.KV_REST_API_URL = "https://stub.upstash.io";
  process.env.KV_REST_API_TOKEN = "stub";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  vi.unstubAllGlobals();
});

async function authedRequest(body: unknown): Promise<{ token: string; req: Request }> {
  const created = await createAccount();
  await setStoredSociety(created!.accountId, FIXTURE);
  const req = new Request("https://x/api/society/suspend", {
    method: "POST",
    headers: { "x-studio-token": created!.token, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { token: created!.token, req };
}

describe("POST /api/society/suspend", () => {
  it("401s with no token", async () => {
    const req = new Request("https://x/api/society/suspend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ suspend: true, acepta: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("404s sin_sociedad when authenticated but no stored society", async () => {
    const created = await createAccount();
    const req = new Request("https://x/api/society/suspend", {
      method: "POST",
      headers: { "x-studio-token": created!.token, "content-type": "application/json" },
      body: JSON.stringify({ suspend: true, acepta: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "sin_sociedad" });
  });

  it("returns art102_no_aceptado before schema validation when acepta is missing", async () => {
    const { req } = await authedRequest({ suspend: true });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("art102_no_aceptado");
    expect(body.error).not.toBe("cuerpo_invalido");
  });

  it("returns art102_no_aceptado when acepta is explicitly false", async () => {
    const { req } = await authedRequest({ suspend: true, acepta: false });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("art102_no_aceptado");
  });

  it("returns bad_json on non-JSON body", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE);
    const req = new Request("https://x/api/society/suspend", {
      method: "POST",
      headers: { "x-studio-token": created!.token, "content-type": "application/json" },
      body: "not json{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "bad_json" });
  });

  it("returns cuerpo_invalido when acepta is true but suspend is missing", async () => {
    const { req } = await authedRequest({ acepta: true });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("cuerpo_invalido");
    expect(body.detail).toBeDefined();
  });

  it("returns cuerpo_invalido when suspend is not a boolean", async () => {
    const { req } = await authedRequest({ suspend: "yes", acepta: true });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("cuerpo_invalido");
  });

  it("suspend: true routes to /api/suspender, not /api/reanudar", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/suspender")) {
        return jsonResponse({ ok: true, suspended: true, society: FIXTURE.sessionId });
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const { req } = await authedRequest({ suspend: true, acepta: true });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suspended).toBe(true);

    const calledUrls = fetchMock.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(calledUrls.some((u) => u.includes("/api/suspender"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("/api/reanudar"))).toBe(false);
  });

  it("suspend: false routes to /api/reanudar, not /api/suspender", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/reanudar")) {
        return jsonResponse({ ok: true, suspended: false, society: FIXTURE.sessionId });
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const { req } = await authedRequest({ suspend: false, acepta: true });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suspended).toBe(false);

    const calledUrls = fetchMock.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(calledUrls.some((u) => u.includes("/api/reanudar"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("/api/suspender"))).toBe(false);
  });

  it("passes through an upstream error as upstream_error with the upstream status", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/suspender")) {
        return jsonResponse({ error: "upstream boom" }, 502);
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const { req } = await authedRequest({ suspend: true, acepta: true });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "upstream_error" });
  });

  it("rate_limits after 20 calls in the window for the same account", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/suspender")) {
        return jsonResponse({ ok: true, suspended: true, society: FIXTURE.sessionId });
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE);

    let lastRes: Response | null = null;
    for (let i = 0; i < 21; i++) {
      const req = new Request("https://x/api/society/suspend", {
        method: "POST",
        headers: { "x-studio-token": created!.token, "content-type": "application/json" },
        body: JSON.stringify({ suspend: true, acepta: true }),
      });
      lastRes = await POST(req);
    }
    expect(lastRes!.status).toBe(429);
    const body = await lastRes!.json();
    expect(body).toEqual({ ok: false, error: "rate_limited" });
  });
});
