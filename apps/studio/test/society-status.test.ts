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
  },
}));

import { createAccount, setStoredSociety, type StoredSociety } from "../src/lib/account";
import { GET } from "../src/app/api/society/route";
import { buildSocietySummary } from "../src/lib/society";

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

function mockAllUpstreamsOk() {
  fetchMock.mockImplementation(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/api/registry/good-standing")) {
      return jsonResponse({ body: { found: true, goodStanding: { state: "active", score: 92, rating: "A" } } });
    }
    if (u.includes("/api/suspension-status")) {
      return jsonResponse({ ok: true, society: FIXTURE.sessionId, suspended: false });
    }
    if (u.includes("/api/approvals/pending")) {
      return jsonResponse({ ok: true, society: FIXTURE.sessionId, authorized: false, pending: [{ id: "a1" }, { id: "a2" }] });
    }
    return jsonResponse({ error: "not_found" }, 404);
  });
}

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

describe("buildSocietySummary: aggregation over 3 independent upstream look-ups", () => {
  it("combines good standing + suspension + pending-approval count", async () => {
    mockAllUpstreamsOk();
    const summary = await buildSocietySummary(FIXTURE);
    expect(summary).toEqual({
      sessionId: "sess-1",
      denominacion: "Kiosco Automatizado SAS",
      tipo: "SAS",
      registryId: "reg-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      goodStanding: { state: "active", score: 92, rating: "A" },
      suspended: false,
      pendingApprovals: 2,
      deploy: null,
    });
  });

  it("reflects a suspended society (kill switch thrown)", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/suspension-status")) {
        return jsonResponse({ ok: true, society: FIXTURE.sessionId, suspended: true });
      }
      if (u.includes("/api/registry/good-standing")) {
        return jsonResponse({ body: { found: true, goodStanding: { state: "suspended", score: null, rating: null } } });
      }
      return jsonResponse({ ok: true, pending: [] });
    });
    const summary = await buildSocietySummary(FIXTURE);
    expect(summary.suspended).toBe(true);
    expect(summary.goodStanding?.state).toBe("suspended");
  });

  it("nulls out just the failing dimension when one upstream call 500s, others still populate", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/registry/good-standing")) return jsonResponse({ error: "boom" }, 500);
      if (u.includes("/api/suspension-status")) return jsonResponse({ ok: true, suspended: false });
      if (u.includes("/api/approvals/pending")) return jsonResponse({ ok: true, pending: [{ id: "a1" }] });
      return jsonResponse({}, 404);
    });
    const summary = await buildSocietySummary(FIXTURE);
    expect(summary.goodStanding).toBeNull();
    expect(summary.suspended).toBe(false);
    expect(summary.pendingApprovals).toBe(1);
  });

  it("nulls out everything when every upstream call fails at the network level", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const summary = await buildSocietySummary(FIXTURE);
    expect(summary.goodStanding).toBeNull();
    expect(summary.suspended).toBeNull();
    expect(summary.pendingApprovals).toBeNull();
  });

  it("skips the good-standing look-up entirely when there is no registryId yet", async () => {
    mockAllUpstreamsOk();
    const noRegistry: StoredSociety = { ...FIXTURE, registryId: null };
    const summary = await buildSocietySummary(noRegistry);
    expect(summary.goodStanding).toBeNull();
    const calledGoodStanding = fetchMock.mock.calls.some(([url]) => String(url).includes("good-standing"));
    expect(calledGoodStanding).toBe(false);
  });
});

describe("GET /api/society", () => {
  it("returns society: null for an account with no society yet", async () => {
    const created = await createAccount();
    const req = new Request("https://x/api/society", { headers: { "x-studio-token": created!.token } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, society: null });
  });

  it("returns the full aggregated summary for an account with a society", async () => {
    mockAllUpstreamsOk();
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE);
    const req = new Request("https://x/api/society", { headers: { "x-studio-token": created!.token } });
    const res = await GET(req);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.society.sessionId).toBe("sess-1");
    expect(body.society.goodStanding).toEqual({ state: "active", score: 92, rating: "A" });
    expect(body.society.pendingApprovals).toBe(2);
  });

  it("401s with no token", async () => {
    const res = await GET(new Request("https://x/api/society"));
    expect(res.status).toBe(401);
  });
});
