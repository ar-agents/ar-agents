import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/status/route";
import { appendLocalAudit, __resetLocalAuditForTests } from "../src/lib/audit-log";

const TOKEN = "test-status-token-123456";
const SOCIETY = "sess-test-1";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://starter.test/api/status", { headers });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

function mockAllUpstreamsOk() {
  fetchMock.mockImplementation(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/api/suspension-status")) {
      return jsonResponse({ ok: true, society: SOCIETY, suspended: false });
    }
    if (u.includes("/api/approvals/pending")) {
      return jsonResponse({
        ok: true,
        society: SOCIETY,
        authorized: false,
        pending: [
          { id: "a1", tool: "emitir_factura", status: "pending", createdAt: "2026-01-01T00:00:00.000Z" },
          { id: "a2", tool: "transferir", status: "pending", createdAt: "2026-01-01T00:05:00.000Z" },
        ],
      });
    }
    return jsonResponse({ error: "not_found" }, 404);
  });
}

beforeEach(() => {
  process.env.STUDIO_STATUS_TOKEN = TOKEN;
  process.env.SOCIETY_ID = SOCIETY;
  process.env.AR_AGENTS_API_BASE = "https://ar-agents.test";
  process.env.SOCIEDAD_IA_DENOMINACION = "Kiosco Automatizado SAS";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  __resetLocalAuditForTests();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.STUDIO_STATUS_TOKEN;
  delete process.env.SOCIETY_ID;
  delete process.env.AR_AGENTS_API_BASE;
  delete process.env.SOCIEDAD_IA_DENOMINACION;
  __resetLocalAuditForTests();
  vi.unstubAllGlobals();
});

describe("GET /api/status auth (fail-closed)", () => {
  it("503s when STUDIO_STATUS_TOKEN is unset (secure by default)", async () => {
    delete process.env.STUDIO_STATUS_TOKEN;
    const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("not_configured");
  });

  it("401s a missing token", async () => {
    const res = await GET(req({}));
    expect(res.status).toBe(401);
  });

  it("401s a wrong token", async () => {
    const res = await GET(req({ authorization: "Bearer wrong-token" }));
    expect(res.status).toBe(401);
  });

  it("never echoes the expected token back in an error body", async () => {
    const res = await GET(req({ authorization: "Bearer wrong-token" }));
    const text = await res.text();
    expect(text).not.toContain(TOKEN);
  });

  it("accepts the correct bearer token", async () => {
    mockAllUpstreamsOk();
    const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/status payload shape", () => {
  it("returns denominacion, version, uptime, client wiring, and the three degradable sections", async () => {
    mockAllUpstreamsOk();
    const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.denominacion).toBe("Kiosco Automatizado SAS");
    expect(typeof body.version).toBe("string");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.clients).toEqual({
      mercadopago: "missing-env",
      whatsapp: "missing-env",
      wsfe: "missing-env",
      "afip-padron": "missing-env",
      "treasury-offramp": "missing-env",
    });
  });

  it("kill switch: reflects a live (unsuspended) society", async () => {
    mockAllUpstreamsOk();
    const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
    const body = await res.json();
    expect(body.killSwitch).toEqual({ available: true, suspended: false });
  });

  it("approvals: count + a bounded, redacted item list", async () => {
    mockAllUpstreamsOk();
    const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
    const body = await res.json();
    expect(body.approvals.available).toBe(true);
    expect(body.approvals.pendingCount).toBe(2);
    expect(body.approvals.items).toHaveLength(2);
    expect(body.approvals.items[0]).toEqual({
      id: "a1",
      tool: "emitir_factura",
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("audit: local signed log, newest-first, drops raw args/output, keeps descriptive fields + summary", async () => {
    mockAllUpstreamsOk();
    await appendLocalAudit({ tool: "validar_cuit", governance: "algorithm-only", errored: false, summary: "validar_cuit: acción ejecutada." });
    await appendLocalAudit({ tool: "emitir_factura", governance: "fiscal", errored: true, summary: "emitir_factura: falló (upstream_error)." });

    const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
    const body = await res.json();
    expect(body.audit.available).toBe(true);
    expect(body.audit.droppedWrites).toBe(0);
    expect(body.audit.entries).toHaveLength(2);
    expect(body.audit.entries[0]).toMatchObject({ tool: "emitir_factura", governance: "fiscal", errored: true });
    expect(body.audit.entries[1]).toMatchObject({ tool: "validar_cuit", governance: "algorithm-only", errored: false });
    const text = JSON.stringify(body);
    expect(text).not.toContain("shh");
  });
});

describe("GET /api/status graceful degradation", () => {
  it("no SOCIETY_ID configured (local dev): remote sections unavailable, audit (local, no SOCIETY_ID needed) still reports", async () => {
    delete process.env.SOCIETY_ID;
    const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.killSwitch).toEqual({ available: false, suspended: null });
    expect(body.approvals).toEqual({ available: false, pendingCount: null, items: null });
    // Local audit log has no SOCIETY_ID / network dependency: available even
    // in local dev, just empty (nothing appended in this test).
    expect(body.audit).toEqual({ available: true, entries: [], droppedWrites: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("one upstream 500ing degrades only that section, others (including local audit) still populate", async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/suspension-status")) return jsonResponse({ error: "boom" }, 500);
      if (u.includes("/api/approvals/pending")) return jsonResponse({ ok: true, pending: [] });
      return jsonResponse({}, 404);
    });
    const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
    const body = await res.json();
    expect(body.killSwitch).toEqual({ available: false, suspended: null });
    expect(body.approvals).toEqual({ available: true, pendingCount: 0, items: [] });
    expect(body.audit).toEqual({ available: true, entries: [], droppedWrites: 0 });
  });

  it("every upstream unreachable: whole response still 200; local audit is unaffected (no network dependency)", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const res = await GET(req({ authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.killSwitch.available).toBe(false);
    expect(body.approvals.available).toBe(false);
    expect(body.audit.available).toBe(true);
  });
});

describe("GET /api/status rate limit", () => {
  it("limits to 30/min/IP", async () => {
    mockAllUpstreamsOk();
    const ip = "203.0.113.9";
    for (let i = 0; i < 30; i++) {
      const res = await GET(req({ authorization: `Bearer ${TOKEN}`, "x-vercel-forwarded-for": ip }));
      expect(res.status).toBe(200);
    }
    const res31 = await GET(req({ authorization: `Bearer ${TOKEN}`, "x-vercel-forwarded-for": ip }));
    expect(res31.status).toBe(429);
  });
});
