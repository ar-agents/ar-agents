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
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, n);
      return n;
    },
    expire: async () => 1,
  },
}));

import { createAccount, getStoredSociety, setStoredSociety } from "../src/lib/account";
import { POST } from "../src/app/api/society/constitute/route";

// Fictional data only (CUIT 20-12345678-6, Juan Perez), never real PII.
const DRAFT = {
  denominacion: "Kiosco Automatizado SAS",
  tipo: "SAS" as const,
  capitalSocial: 100_000,
  objeto: "Venta minorista automatizada de artículos varios por WhatsApp y web.",
};
const ADMINISTRADOR = { nombre: "Juan Perez", cuit: "20-12345678-6" };

function constituteReq(token: string, overrides: Record<string, unknown> = {}) {
  return new Request("https://x/api/society/constitute", {
    method: "POST",
    headers: { "content-type": "application/json", "x-studio-token": token },
    body: JSON.stringify({
      draft: DRAFT,
      administrador: ADMINISTRADOR,
      acepta102: true,
      ...overrides,
    }),
  });
}

function upstreamSuccessBody() {
  return {
    ok: true,
    sociedad: { denominacion: DRAFT.denominacion, tipo: DRAFT.tipo, capitalSocial: DRAFT.capitalSocial, slug: "kiosco-automatizado-sas" },
    formationPack: { sidecar: {}, documents: {}, packHash: "hash123" },
    deploy: { target: "vercel", oneClickUrl: "https://vercel.com/new", sourceUrl: "https://github.com/x", manualSteps: [] },
    audit: { sessionId: "sess-xyz-1", backend: "kv" },
    registry: { id: "reg-1", status: "forming", checklistUrl: "https://ar-agents.ar/x" },
    adminToken: "sat_test_admin_token",
    gateToken: "sgt_test_gate_token",
  };
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

describe("POST /api/society/constitute", () => {
  it("happy path: forwards to incorporate-attested, stores the society, returns credentials once", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(upstreamSuccessBody()), { status: 200 }));
    const created = await createAccount();

    const res = await POST(constituteReq(created!.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.society.sessionId).toBe("sess-xyz-1");
    expect(body.society.denominacion).toBe(DRAFT.denominacion);
    expect(body.credentials).toEqual({ adminToken: "sat_test_admin_token", gateToken: "sgt_test_gate_token" });

    // The upstream call matches CONTRACT.md's expected payload shape exactly.
    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody).toEqual({
      draft: DRAFT,
      administrador: { nombre: "Juan Perez", cuit: "20123456786" },
      acepta102: true,
    });

    // Persisted against the account for later GET /api/society etc.
    const stored = await getStoredSociety(created!.accountId);
    expect(stored?.sessionId).toBe("sess-xyz-1");
    expect(stored?.adminToken).toBe("sat_test_admin_token");
  });

  it("400s when acepta102 is not exactly true", async () => {
    const created = await createAccount();
    const res = await POST(constituteReq(created!.token, { acepta102: false }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("art102_no_aceptado");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("422s on a malformed CUIT", async () => {
    const created = await createAccount();
    const res = await POST(
      constituteReq(created!.token, { administrador: { nombre: "Juan Perez", cuit: "not-a-cuit" } }),
    );
    expect(res.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("409s when the account already has a society (and never calls upstream)", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, {
      sessionId: "existing",
      denominacion: "Ya Existe SAS",
      tipo: "SAS",
      registryId: null,
      adminToken: "sat_existing",
      gateToken: "sgt_existing",
      createdAt: new Date().toISOString(),
    });

    const res = await POST(constituteReq(created!.token));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("ya_tiene_sociedad");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces an upstream error (non-2xx) rather than silently succeeding", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "denominacion_reserved_word" }), { status: 422 }),
    );
    const created = await createAccount();
    const res = await POST(constituteReq(created!.token));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(await getStoredSociety(created!.accountId)).toBeNull();
  });

  it("surfaces a network-level upstream failure as a 502", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const created = await createAccount();
    const res = await POST(constituteReq(created!.token));
    expect(res.status).toBe(502);
    expect(await getStoredSociety(created!.accountId)).toBeNull();
  });

  it("401s with no token", async () => {
    const res = await POST(constituteReq(""));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
