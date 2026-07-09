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

const provisionMock = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/vercel-provision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/vercel-provision")>();
  return { ...actual, provisionSocietyApp: provisionMock };
});

import { createAccount, getStoredSociety, setStoredSociety, type StoredSociety } from "../src/lib/account";
import { POST } from "../src/app/api/society/deploy/route";

const FIXTURE: StoredSociety = {
  sessionId: "sess-1",
  denominacion: "Kiosco Automatizado SAS",
  tipo: "SAS",
  registryId: "reg-1",
  adminToken: "sat_x",
  gateToken: "sgt_x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function deployReq(token: string) {
  return new Request("https://x/api/society/deploy", {
    method: "POST",
    headers: { "x-studio-token": token },
  });
}

beforeEach(() => {
  store.clear();
  process.env.KV_REST_API_URL = "https://stub.upstash.io";
  process.env.KV_REST_API_TOKEN = "stub";
  provisionMock.mockReset();
});

afterEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

describe("POST /api/society/deploy", () => {
  it("401s with no token", async () => {
    const res = await POST(deployReq(""));
    expect(res.status).toBe(401);
    expect(provisionMock).not.toHaveBeenCalled();
  });

  it("404s when the account has no society yet", async () => {
    const created = await createAccount();
    const res = await POST(deployReq(created!.token));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("sin_sociedad");
    expect(provisionMock).not.toHaveBeenCalled();
  });

  it("manual mode: provisionSocietyApp returns null (no VERCEL_PROVISION_TOKEN configured)", async () => {
    provisionMock.mockResolvedValueOnce(null);
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE);

    const res = await POST(deployReq(created!.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("manual");
    expect(body.oneClickUrl).toContain("https://vercel.com/new/clone?");
    expect(body.oneClickUrl).toContain("project-name=soc-reg-1");
    expect(typeof body.agentApiKey).toBe("string");
    expect(body.agentApiKey).toMatch(/^[0-9a-f]{64}$/);
    expect(body.envFile).toContain(`SOCIETY_ID=${FIXTURE.sessionId}`);
    expect(body.envFile).toContain(`SOCIETY_GATE_TOKEN=${FIXTURE.gateToken}`);
    expect(body.envFile).toContain("AR_AGENTS_API_BASE=https://ar-agents.ar");
    expect(body.envFile).toContain(`AGENT_API_KEY=${body.agentApiKey}`);

    // Manual mode persists nothing: studio never learns whether the human
    // completed the click-through.
    const stored = await getStoredSociety(created!.accountId);
    expect(stored?.deploy).toBeUndefined();

    // The call studio made to the provisioning lib carries the right env vars.
    const [[input]] = provisionMock.mock.calls;
    expect(input.name).toBe(FIXTURE.registryId);
    const envVarNames = input.envVars.map((v: { name: string }) => v.name);
    expect(envVarNames).toEqual(["SOCIETY_ID", "SOCIETY_GATE_TOKEN", "AR_AGENTS_API_BASE", "AGENT_API_KEY"]);
  });

  it("provisioned mode: persists the deploy against the stored society and returns its state", async () => {
    provisionMock.mockResolvedValueOnce({
      ok: true,
      projectName: "soc-reg-1",
      url: "soc-reg-1.vercel.app",
      deploymentState: "READY",
    });
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE);

    const res = await POST(deployReq(created!.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      mode: "provisioned",
      projectName: "soc-reg-1",
      url: "soc-reg-1.vercel.app",
      deploymentState: "READY",
    });
    expect(typeof body.agentApiKey).toBe("string");

    const stored = await getStoredSociety(created!.accountId);
    expect(stored?.deploy?.projectName).toBe("soc-reg-1");
    expect(stored?.deploy?.url).toBe("soc-reg-1.vercel.app");
    expect(typeof stored?.deploy?.deployedAt).toBe("string");
  });

  it("surfaces a provisioning failure as a distinct 502 without persisting anything", async () => {
    provisionMock.mockResolvedValueOnce({ ok: false, error: "project_exists" });
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE);

    const res = await POST(deployReq(created!.token));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("deploy_failed");
    expect(body.detail).toBe("project_exists");

    const stored = await getStoredSociety(created!.accountId);
    expect(stored?.deploy).toBeUndefined();
  });

  it("rate limits at 3/day/account", async () => {
    provisionMock.mockResolvedValue(null);
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE);

    for (let i = 0; i < 3; i++) {
      const res = await POST(deployReq(created!.token));
      expect(res.status).toBe(200);
    }
    const fourth = await POST(deployReq(created!.token));
    expect(fourth.status).toBe(429);
    expect((await fourth.json()).error).toBe("rate_limited");
  });
});
