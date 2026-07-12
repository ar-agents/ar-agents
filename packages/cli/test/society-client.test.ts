import { describe, expect, it, vi } from "vitest";
import {
  buildSuspendRequest,
  getSociety,
  getSocietyActivity,
  setSocietySuspended,
  SocietyClientError,
} from "../src/society-client";

function fakeResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return { ok, status, json: async () => body } as unknown as Response;
}

const SOCIETY_SUMMARY = {
  sessionId: "sess_1",
  denominacion: "Sociedad Ejemplo",
  tipo: "SAS",
  registryId: "reg_1",
  createdAt: "2026-01-01T00:00:00.000Z",
  goodStanding: { state: "buena", score: 92, rating: "A" },
  suspended: false,
  pendingApprovals: 2,
  deploy: { projectName: "sociedad-ejemplo", url: "https://sociedad-ejemplo.vercel.app", deployedAt: "2026-02-01T00:00:00.000Z" },
};

describe("getSociety", () => {
  it("sends the x-studio-token header and returns the mapped society on 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, society: SOCIETY_SUMMARY }));
    const result = await getSociety({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith("https://studio.example/api/society", {
      method: "GET",
      headers: { "x-studio-token": "stu_abc" },
    });
    expect(result.society).toEqual(SOCIETY_SUMMARY);
  });

  it("returns a null society when the account has none yet", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, society: null }));
    const result = await getSociety({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl });
    expect(result.society).toBeNull();
  });

  it("trims a trailing slash from baseUrl", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, society: null }));
    await getSociety({ baseUrl: "https://studio.example/", token: "stu_abc", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("https://studio.example/api/society", expect.anything());
  });

  it("is defensive: a society missing optional fields does not throw", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        ok: true,
        society: { sessionId: "sess_2", denominacion: "Minima SAS", tipo: "SAS", registryId: null, createdAt: "2026-01-01" },
      }),
    );
    const result = await getSociety({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl });
    expect(result.society?.denominacion).toBe("Minima SAS");
    expect(result.society?.goodStanding).toBeNull();
    expect(result.society?.suspended).toBeNull();
    expect(result.society?.pendingApprovals).toBeNull();
    expect(result.society?.deploy).toBeNull();
  });

  it("throws SocietyClientError on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(401, { ok: false, error: "no_autorizado" }));
    await expect(
      getSociety({ baseUrl: "https://studio.example", token: "bad", fetchImpl }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throws SocietyClientError on an ok-but-malformed body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: false }));
    await expect(
      getSociety({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl }),
    ).rejects.toBeInstanceOf(SocietyClientError);
  });
});

describe("getSocietyActivity", () => {
  const FULL_ACTIVITY = {
    ok: true,
    deploy: { available: true, projectName: "sociedad-ejemplo", url: "https://sociedad-ejemplo.vercel.app", state: "READY" },
    society: { available: true, denominacion: "Sociedad Ejemplo", version: "1.0.0", uptimeSeconds: 3600 },
    clients: { available: true, statuses: { whatsapp: "conectado", email: "conectado" } },
    killSwitch: { available: true, suspended: false },
    approvals: {
      available: true,
      pendingCount: 1,
      items: [{ id: "app_1", tool: "enviar_email", status: "pendiente", createdAt: "2026-02-01T00:00:00.000Z" }],
    },
    audit: {
      available: true,
      entries: [
        { id: "a_1", ts: "2026-02-01T00:00:00.000Z", tool: "enviar_email", governance: "auto", errored: false, summary: "Envio de bienvenida" },
      ],
    },
    provisioning: false,
  };

  it("sends the x-studio-token header and returns the full payload on 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, FULL_ACTIVITY));
    const result = await getSocietyActivity({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith("https://studio.example/api/society/activity", {
      method: "GET",
      headers: { "x-studio-token": "stu_abc" },
    });
    expect(result).toEqual({
      deploy: FULL_ACTIVITY.deploy,
      society: FULL_ACTIVITY.society,
      clients: FULL_ACTIVITY.clients,
      killSwitch: FULL_ACTIVITY.killSwitch,
      approvals: FULL_ACTIVITY.approvals,
      audit: FULL_ACTIVITY.audit,
      provisioning: false,
    });
  });

  it("degrades every section to unavailable/null defensively when a section is missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true }));
    const result = await getSocietyActivity({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl });
    expect(result.deploy).toEqual({ available: false, projectName: null, url: null, state: null });
    expect(result.clients).toEqual({ available: false, statuses: null });
    expect(result.killSwitch).toEqual({ available: false, suspended: null });
    expect(result.approvals).toEqual({ available: false, pendingCount: null, items: null });
    expect(result.audit).toEqual({ available: false, entries: null });
    expect(result.provisioning).toBe(false);
  });

  it("throws SocietyClientError with code sin_sociedad on a 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(404, { ok: false, error: "sin_sociedad" }, false));
    await expect(
      getSocietyActivity({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl }),
    ).rejects.toMatchObject({ status: 404, code: "sin_sociedad" });
  });

  it("throws a generic SocietyClientError on another failure (500)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(500, { ok: false, error: "boom" }));
    await expect(
      getSocietyActivity({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl }),
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe("buildSuspendRequest", () => {
  it("builds the URL, method, header, and body with acepta: true and no motivo when omitted", () => {
    const { url, init } = buildSuspendRequest({ baseUrl: "https://studio.example", token: "stu_abc", suspend: true });

    expect(url).toBe("https://studio.example/api/society/suspend");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-studio-token"]).toBe("stu_abc");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ suspend: true, acepta: true });
    expect(body.motivo).toBeUndefined();
  });

  it("includes motivo in the body when provided", () => {
    const { init } = buildSuspendRequest({
      baseUrl: "https://studio.example",
      token: "stu_abc",
      suspend: true,
      motivo: "mantenimiento programado",
    });
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ suspend: true, acepta: true, motivo: "mantenimiento programado" });
  });

  it("sends suspend: false for resume", () => {
    const { init } = buildSuspendRequest({ baseUrl: "https://studio.example", token: "stu_abc", suspend: false });
    const body = JSON.parse(init.body as string);
    expect(body.suspend).toBe(false);
    expect(body.acepta).toBe(true);
  });

  it("trims a trailing slash from baseUrl", () => {
    const { url } = buildSuspendRequest({ baseUrl: "https://studio.example/", token: "stu_abc", suspend: true });
    expect(url).toBe("https://studio.example/api/society/suspend");
  });
});

describe("setSocietySuspended", () => {
  it("returns the suspended state on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(200, { ok: true, suspended: true, society: "sess_1", audit: { entry: {} } }),
    );
    const result = await setSocietySuspended({
      baseUrl: "https://studio.example",
      token: "stu_abc",
      suspend: true,
      fetchImpl,
    });
    expect(result).toEqual({ suspended: true });
  });

  it("returns suspended: null when the upstream omits it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true }));
    const result = await setSocietySuspended({
      baseUrl: "https://studio.example",
      token: "stu_abc",
      suspend: false,
      fetchImpl,
    });
    expect(result).toEqual({ suspended: null });
  });

  it("throws SocietyClientError with code sin_sociedad on a 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(404, { ok: false, error: "sin_sociedad" }, false));
    await expect(
      setSocietySuspended({ baseUrl: "https://studio.example", token: "stu_abc", suspend: true, fetchImpl }),
    ).rejects.toMatchObject({ status: 404, code: "sin_sociedad" });
  });

  it("throws SocietyClientError on a 400 (art102_no_aceptado, should not happen since the CLI always sends acepta: true, but defends anyway)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(400, { ok: false, error: "art102_no_aceptado", message: "Reafirma tu responsabilidad." }, false),
    );
    await expect(
      setSocietySuspended({ baseUrl: "https://studio.example", token: "stu_abc", suspend: true, fetchImpl }),
    ).rejects.toMatchObject({ status: 400, code: "art102_no_aceptado" });
  });

  it("throws SocietyClientError on another failure (500)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(500, { ok: false, error: "upstream_error" }));
    await expect(
      setSocietySuspended({ baseUrl: "https://studio.example", token: "stu_abc", suspend: true, fetchImpl }),
    ).rejects.toBeInstanceOf(SocietyClientError);
  });

  it("always sends acepta: true in the request body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, suspended: true }));
    await setSocietySuspended({ baseUrl: "https://studio.example", token: "stu_abc", suspend: true, fetchImpl });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.acepta).toBe(true);
  });
});
