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
import { GET, POST } from "../src/app/api/society/approvals/route";

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

async function authedGetRequest(): Promise<{ token: string; req: Request }> {
  const created = await createAccount();
  await setStoredSociety(created!.accountId, FIXTURE);
  const req = new Request("https://x/api/society/approvals", {
    method: "GET",
    headers: { "x-studio-token": created!.token },
  });
  return { token: created!.token, req };
}

async function authedPostRequest(body: unknown): Promise<{ token: string; req: Request }> {
  const created = await createAccount();
  await setStoredSociety(created!.accountId, FIXTURE);
  const req = new Request("https://x/api/society/approvals", {
    method: "POST",
    headers: { "x-studio-token": created!.token, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { token: created!.token, req };
}

describe("GET /api/society/approvals", () => {
  it("401s with no token", async () => {
    const req = new Request("https://x/api/society/approvals", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("404s sin_sociedad when authenticated but no stored society", async () => {
    const created = await createAccount();
    const req = new Request("https://x/api/society/approvals", {
      method: "GET",
      headers: { "x-studio-token": created!.token },
    });
    const res = await GET(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "sin_sociedad" });
  });

  it("returns the pending list from upstream on the happy path", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/approvals/pending")) {
        return jsonResponse({
          ok: true,
          pending: [
            { id: "a1", society: FIXTURE.sessionId, tool: "pagar", status: "pending", createdAt: "2026-01-01T00:00:00.000Z" },
            { id: "a2", society: FIXTURE.sessionId, tool: "publicar", status: "pending", createdAt: "2026-01-01T00:01:00.000Z" },
          ],
        });
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const { req } = await authedGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.approvals).toHaveLength(2);

    const pendingCall = fetchMock.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes("/api/approvals/pending"),
    );
    expect(pendingCall).toBeDefined();
    expect(String(pendingCall![0])).toContain(FIXTURE.sessionId);
    const init = pendingCall![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-admin-token"]).toBe(FIXTURE.adminToken);
  });

  it("defaults approvals to [] when upstream omits pending", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/approvals/pending")) {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const { req } = await authedGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approvals).toEqual([]);
  });

  it("passes through an upstream failure as upstream_error with the upstream status", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/approvals/pending")) {
        return jsonResponse({ error: "boom" }, 502);
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const { req } = await authedGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "upstream_error" });
  });
});

describe("POST /api/society/approvals", () => {
  it("401s with no token", async () => {
    const req = new Request("https://x/api/society/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "a1", approved: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("404s sin_sociedad when authenticated but no stored society", async () => {
    const created = await createAccount();
    const req = new Request("https://x/api/society/approvals", {
      method: "POST",
      headers: { "x-studio-token": created!.token, "content-type": "application/json" },
      body: JSON.stringify({ id: "a1", approved: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "sin_sociedad" });
  });

  it("returns bad_json on non-JSON body", async () => {
    const { req } = await authedPostRequest("not json{");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "bad_json" });
  });

  it("returns cuerpo_invalido when id is missing", async () => {
    const { req } = await authedPostRequest({ approved: true });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("cuerpo_invalido");
    expect(body.detail).toBeDefined();
  });

  it("returns cuerpo_invalido when approved is not a boolean", async () => {
    const { req } = await authedPostRequest({ id: "a1", approved: "yes" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("cuerpo_invalido");
  });

  it("returns cuerpo_invalido when id is an empty string", async () => {
    const { req } = await authedPostRequest({ id: "", approved: true });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("cuerpo_invalido");
  });

  it("approved: true resolves against /api/approvals/resolve and returns the upstream body verbatim", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/approvals/resolve")) {
        return jsonResponse({
          ok: true,
          request: { id: "a1", society: FIXTURE.sessionId, tool: "pagar", status: "approved", createdAt: "2026-01-01T00:00:00.000Z" },
        });
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const { req } = await authedPostRequest({ id: "a1", approved: true });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.request).toBeDefined();

    const calledUrls = fetchMock.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(calledUrls.some((u) => u.includes("/api/approvals/resolve"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("/api/approvals/pending"))).toBe(false);
  });

  it("approved: false also resolves against /api/approvals/resolve", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/approvals/resolve")) {
        return jsonResponse({
          ok: true,
          request: { id: "a1", society: FIXTURE.sessionId, tool: "pagar", status: "rejected", createdAt: "2026-01-01T00:00:00.000Z" },
        });
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const { req } = await authedPostRequest({ id: "a1", approved: false });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const calledUrls = fetchMock.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(calledUrls.some((u) => u.includes("/api/approvals/resolve"))).toBe(true);
  });

  it("passes through the upstream's own error code (not a generic one) on failure", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/approvals/resolve")) {
        return jsonResponse({ error: "aprobacion_inexistente" }, 404);
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const { req } = await authedPostRequest({ id: "a1", approved: true });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "aprobacion_inexistente" });
  });

  it("falls back to upstream_error when the upstream body has no error string", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/approvals/resolve")) {
        return jsonResponse({}, 502);
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const { req } = await authedPostRequest({ id: "a1", approved: true });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "upstream_error" });
  });

  it("rate_limits after 60 calls in the window for the same account", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/approvals/resolve")) {
        return jsonResponse({ ok: true, request: { id: "a1" } });
      }
      return jsonResponse({ error: "unexpected_call" }, 500);
    });
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE);

    let lastRes: Response | null = null;
    for (let i = 0; i < 61; i++) {
      const req = new Request("https://x/api/society/approvals", {
        method: "POST",
        headers: { "x-studio-token": created!.token, "content-type": "application/json" },
        body: JSON.stringify({ id: "a1", approved: true }),
      });
      lastRes = await POST(req);
    }
    expect(lastRes!.status).toBe(429);
    const body = await lastRes!.json();
    expect(body).toEqual({ ok: false, error: "rate_limited" });
  });
});
