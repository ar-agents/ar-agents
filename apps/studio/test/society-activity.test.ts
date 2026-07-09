import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { kvStore } = vi.hoisted(() => ({ kvStore: new Map<string, unknown>() }));
vi.mock("@vercel/kv", () => ({
  kv: {
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && kvStore.has(k)) return null;
      kvStore.set(k, v);
      return "OK";
    },
    get: async (k: string) => kvStore.get(k) ?? null,
    del: async (k: string) => (kvStore.delete(k) ? 1 : 0),
    incr: async (k: string) => {
      const n = Number(kvStore.get(k) ?? 0) + 1;
      kvStore.set(k, n);
      return n;
    },
    expire: async () => 1,
  },
}));

const getLatestDeploymentMock = vi.hoisted(() => vi.fn());
const setSocietyCredentialEnvVarsMock = vi.hoisted(() => vi.fn());
const triggerRedeployMock = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/vercel-provision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/vercel-provision")>();
  return {
    ...actual,
    getLatestDeployment: getLatestDeploymentMock,
    setSocietyCredentialEnvVars: setSocietyCredentialEnvVarsMock,
    triggerRedeploy: triggerRedeployMock,
  };
});

import { createAccount, getStoredSociety, setStoredSociety, type StoredSociety } from "../src/lib/account";
import { GET } from "../src/app/api/society/activity/route";

const FIXTURE_NO_DEPLOY: StoredSociety = {
  sessionId: "sess-1",
  denominacion: "Kiosco Automatizado SAS",
  tipo: "SAS",
  registryId: "reg-1",
  adminToken: "sat_x",
  gateToken: "sgt_x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const FIXTURE_DEPLOYED_NO_TOKEN: StoredSociety = {
  ...FIXTURE_NO_DEPLOY,
  deploy: { projectName: "soc-reg-1", url: "soc-reg-1.vercel.app", deployedAt: "2026-01-02T00:00:00.000Z" },
};

const FIXTURE_DEPLOYED_WITH_TOKEN: StoredSociety = {
  ...FIXTURE_DEPLOYED_NO_TOKEN,
  statusToken: "a".repeat(64),
  // Also fully backfilled for AUDIT_HMAC_SECRET (ROADMAP.md M3-4/M3-5), so
  // tests using this fixture exercise the merged-payload happy path without
  // also triggering ensureAuditSecret's own backfill -- see the dedicated
  // "audit-secret backfill" describe block below for that mechanic.
  auditSecretSet: true,
};

function req(token: string) {
  return new Request("https://x/api/society/activity", {
    headers: token ? { "x-studio-token": token } : {},
  });
}

const FULL_STARTER_STATUS = {
  ok: true,
  denominacion: "Kiosco Automatizado SAS",
  version: "0.1.17",
  uptimeSeconds: 4200,
  clients: { mercadopago: "wired", whatsapp: "missing-env", wsfe: "missing-env", "afip-padron": "missing-env", "treasury-offramp": "missing-env" },
  killSwitch: { available: true, suspended: false },
  approvals: {
    available: true,
    pendingCount: 1,
    items: [{ id: "a1", tool: "emitir_factura", status: "pending", createdAt: "2026-01-01T00:00:00.000Z" }],
  },
  audit: {
    available: true,
    entries: [{ id: "e1", ts: "2026-01-01T00:00:00.000Z", tool: "validar_cuit", governance: "algorithm-only", errored: false }],
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  kvStore.clear();
  process.env.KV_REST_API_URL = "https://stub.upstash.io";
  process.env.KV_REST_API_TOKEN = "stub";
  getLatestDeploymentMock.mockReset();
  setSocietyCredentialEnvVarsMock.mockReset();
  triggerRedeployMock.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  vi.unstubAllGlobals();
});

describe("GET /api/society/activity auth + preconditions", () => {
  it("401s with no token", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(401);
  });

  it("404s when the account has no society yet", async () => {
    const created = await createAccount();
    const res = await GET(req(created!.token));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("sin_sociedad");
  });

  it("rate limits at 120/hour/account", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_NO_DEPLOY);
    for (let i = 0; i < 120; i++) {
      const res = await GET(req(created!.token));
      expect(res.status).toBe(200);
    }
    const res121 = await GET(req(created!.token));
    expect(res121.status).toBe(429);
  });
});

describe("GET /api/society/activity: no deploy yet", () => {
  it("degrades every section to unavailable without calling Vercel or the starter", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_NO_DEPLOY);

    const res = await GET(req(created!.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deploy).toEqual({ available: false, projectName: null, url: null, state: null });
    expect(body.society.available).toBe(false);
    expect(body.clients.available).toBe(false);
    expect(body.killSwitch).toEqual({ available: false, suspended: null });
    expect(body.approvals).toEqual({ available: false, pendingCount: null, items: null });
    expect(body.audit).toEqual({ available: false, entries: null });
    expect(body.provisioning).toBe(false);

    expect(getLatestDeploymentMock).not.toHaveBeenCalled();
    expect(setSocietyCredentialEnvVarsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/society/activity: status-token backfill", () => {
  it("mints + persists a token, sets it on the project, triggers a redeploy, and skips the status fetch this call", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED_NO_TOKEN);
    getLatestDeploymentMock.mockResolvedValueOnce({ ok: true, state: "READY", url: "soc-reg-1.vercel.app", createdAt: "2026-01-02T00:00:00.000Z" });
    // FIXTURE_DEPLOYED_NO_TOKEN is missing BOTH statusToken and
    // auditSecretSet, so both ensureStatusToken and ensureAuditSecret run
    // this call, each calling setSocietyCredentialEnvVars/triggerRedeploy
    // once (see ensureAuditSecret's doc comment: a minor, accepted
    // inefficiency, not a correctness issue).
    setSocietyCredentialEnvVarsMock.mockResolvedValue({ ok: true, typeUsed: "sensitive" });
    triggerRedeployMock.mockResolvedValue({ ok: true, url: "soc-reg-1.vercel.app", readyState: "QUEUED" });

    const res = await GET(req(created!.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provisioning).toBe(true);
    expect(body.society.available).toBe(false);
    expect(body.clients.available).toBe(false);
    // deploy health is independent of the backfill and still reports.
    expect(body.deploy).toEqual({ available: true, projectName: "soc-reg-1", url: "soc-reg-1.vercel.app", state: "READY" });

    expect(setSocietyCredentialEnvVarsMock).toHaveBeenCalledTimes(2);
    const [statusProjectArg, statusEnvVarsArg] = setSocietyCredentialEnvVarsMock.mock.calls[0]!;
    expect(statusProjectArg).toBe("soc-reg-1");
    expect(statusEnvVarsArg).toEqual([{ name: "STUDIO_STATUS_TOKEN", value: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    const [auditProjectArg, auditEnvVarsArg] = setSocietyCredentialEnvVarsMock.mock.calls[1]!;
    expect(auditProjectArg).toBe("soc-reg-1");
    expect(auditEnvVarsArg).toEqual([{ name: "AUDIT_HMAC_SECRET", value: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    expect(triggerRedeployMock).toHaveBeenCalledWith("soc-reg-1");
    expect(fetchMock).not.toHaveBeenCalled(); // no /api/status round trip yet

    const stored = await getStoredSociety(created!.accountId);
    expect(stored?.statusToken).toBe(statusEnvVarsArg[0].value);
    expect(stored?.auditSecretSet).toBe(true);
    expect(JSON.stringify(body)).not.toContain(stored!.statusToken as string);
    expect(JSON.stringify(body)).not.toContain(auditEnvVarsArg[0].value);
  });

  it("no Vercel-provisioning capability: backfill fails closed, nothing persisted, sections unavailable", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED_NO_TOKEN);
    getLatestDeploymentMock.mockResolvedValueOnce(null);
    setSocietyCredentialEnvVarsMock.mockResolvedValue(null); // no VERCEL_PROVISION_TOKEN, both backfills fail closed

    const res = await GET(req(created!.token));
    const body = await res.json();
    expect(body.provisioning).toBe(false);
    expect(body.deploy).toEqual({ available: false, projectName: "soc-reg-1", url: "soc-reg-1.vercel.app", state: null });
    expect(triggerRedeployMock).not.toHaveBeenCalled();

    const stored = await getStoredSociety(created!.accountId);
    expect(stored?.statusToken).toBeUndefined();
    expect(stored?.auditSecretSet).toBeUndefined();
  });

  it("only backfills once: a society that already has a statusToken is reused, no new Vercel env write", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED_WITH_TOKEN);
    getLatestDeploymentMock.mockResolvedValueOnce({ ok: true, state: "READY", url: "soc-reg-1.vercel.app", createdAt: "x" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(FULL_STARTER_STATUS), { status: 200 }));

    await GET(req(created!.token));
    expect(setSocietyCredentialEnvVarsMock).not.toHaveBeenCalled();
    expect(triggerRedeployMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://soc-reg-1.vercel.app/api/status");
    expect((init as RequestInit).headers).toEqual({ authorization: `Bearer ${"a".repeat(64)}` });
  });
});

describe("GET /api/society/activity: full merged payload", () => {
  it("happy path: merges deploy health + the starter's /api/status into one UI-ready payload", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED_WITH_TOKEN);
    getLatestDeploymentMock.mockResolvedValueOnce({ ok: true, state: "READY", url: "soc-reg-1.vercel.app", createdAt: "x" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(FULL_STARTER_STATUS), { status: 200 }));

    const res = await GET(req(created!.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deploy).toEqual({ available: true, projectName: "soc-reg-1", url: "soc-reg-1.vercel.app", state: "READY" });
    expect(body.society).toEqual({ available: true, denominacion: "Kiosco Automatizado SAS", version: "0.1.17", uptimeSeconds: 4200 });
    expect(body.clients).toEqual({ available: true, statuses: FULL_STARTER_STATUS.clients });
    expect(body.killSwitch).toEqual({ available: true, suspended: false });
    expect(body.approvals).toEqual({ available: true, pendingCount: 1, items: FULL_STARTER_STATUS.approvals.items });
    expect(body.audit).toEqual({ available: true, entries: FULL_STARTER_STATUS.audit.entries });
    expect(body.provisioning).toBe(false);
  });

  it("the starter unreachable: deploy health still reports, everything else degrades independently", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED_WITH_TOKEN);
    getLatestDeploymentMock.mockResolvedValueOnce({ ok: true, state: "READY", url: "soc-reg-1.vercel.app", createdAt: "x" });
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const res = await GET(req(created!.token));
    const body = await res.json();
    expect(body.deploy.available).toBe(true);
    expect(body.society.available).toBe(false);
    expect(body.clients.available).toBe(false);
    expect(body.killSwitch).toEqual({ available: false, suspended: null });
    expect(body.approvals).toEqual({ available: false, pendingCount: null, items: null });
    expect(body.audit).toEqual({ available: false, entries: null });
  });

  it("the starter's own sub-sections independently unavailable (e.g. no audit rail) pass through as such", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED_WITH_TOKEN);
    getLatestDeploymentMock.mockResolvedValueOnce({ ok: true, state: "READY", url: "soc-reg-1.vercel.app", createdAt: "x" });
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...FULL_STARTER_STATUS,
          killSwitch: { available: false, suspended: null },
          audit: { available: false, entries: null },
        }),
        { status: 200 },
      ),
    );

    const res = await GET(req(created!.token));
    const body = await res.json();
    expect(body.society.available).toBe(true);
    expect(body.killSwitch).toEqual({ available: false, suspended: null });
    expect(body.approvals.available).toBe(true);
    expect(body.audit).toEqual({ available: false, entries: null });
  });

  it("Vercel deploy-health lookup failing does not block the starter status sections", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED_WITH_TOKEN);
    getLatestDeploymentMock.mockResolvedValueOnce({ ok: false, error: "deployments_list_failed: quota" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(FULL_STARTER_STATUS), { status: 200 }));

    const res = await GET(req(created!.token));
    const body = await res.json();
    expect(body.deploy).toEqual({ available: false, projectName: "soc-reg-1", url: "soc-reg-1.vercel.app", state: null });
    expect(body.society.available).toBe(true);
    expect(body.killSwitch).toEqual({ available: true, suspended: false });
  });
});
