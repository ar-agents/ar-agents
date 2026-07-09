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

const setEnvMock = vi.hoisted(() => vi.fn());
const redeployMock = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/vercel-provision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/vercel-provision")>();
  return {
    ...actual,
    setSocietyCredentialEnvVars: setEnvMock,
    redeploySocietyApp: redeployMock,
  };
});

const validateMpMock = vi.hoisted(() => vi.fn());
const validateWaMock = vi.hoisted(() => vi.fn());
const validateModelMock = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/credential-validators", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/credential-validators")>();
  return {
    ...actual,
    validateMercadoPago: validateMpMock,
    validateWhatsApp: validateWaMock,
    validateModelKey: validateModelMock,
  };
});

import { createAccount, setStoredSociety, type StoredSociety } from "../src/lib/account";
import { GET, POST } from "../src/app/api/society/credentials/route";

const FIXTURE_NO_DEPLOY: StoredSociety = {
  sessionId: "sess-1",
  denominacion: "Kiosco Automatizado SAS",
  tipo: "SAS",
  registryId: "reg-1",
  adminToken: "sat_x",
  gateToken: "sgt_x",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const FIXTURE_DEPLOYED: StoredSociety = {
  ...FIXTURE_NO_DEPLOY,
  deploy: { projectName: "soc-reg-1", url: "soc-reg-1.vercel.app", deployedAt: "2026-01-02T00:00:00.000Z" },
};

function req(method: "GET" | "POST", token: string, body?: unknown) {
  return new Request("https://x/api/society/credentials", {
    method,
    headers: {
      ...(token ? { "x-studio-token": token } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  kvStore.clear();
  process.env.KV_REST_API_URL = "https://stub.upstash.io";
  process.env.KV_REST_API_TOKEN = "stub";
  setEnvMock.mockReset();
  redeployMock.mockReset();
  validateMpMock.mockReset();
  validateWaMock.mockReset();
  validateModelMock.mockReset();
});

afterEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

describe("GET /api/society/credentials", () => {
  it("401s with no token", async () => {
    const res = await GET(req("GET", ""));
    expect(res.status).toBe(401);
  });

  it("404s when the account has no society yet", async () => {
    const created = await createAccount();
    const res = await GET(req("GET", created!.token));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("sin_sociedad");
  });

  it("lists all five integrations as unconfigured (null) for a fresh society", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED);
    const res = await GET(req("GET", created!.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deployProjectName).toBe("soc-reg-1");
    expect(Object.keys(body.credentials).sort()).toEqual(
      ["afip", "mercadopago", "model_key", "treasury_offramp", "whatsapp"].sort(),
    );
    for (const v of Object.values(body.credentials)) expect(v).toBeNull();
  });

  it("reports deployProjectName: null when the society was never provisioned", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_NO_DEPLOY);
    const res = await GET(req("GET", created!.token));
    const body = await res.json();
    expect(body.deployProjectName).toBeNull();
  });
});

describe("POST /api/society/credentials", () => {
  it("401s with no token", async () => {
    const res = await POST(req("POST", "", { integration: "mercadopago", fields: {} }));
    expect(res.status).toBe(401);
  });

  it("404s (sin_sociedad) when the account has no society", async () => {
    const created = await createAccount();
    const res = await POST(
      req("POST", created!.token, { integration: "mercadopago", fields: { accessToken: "x" } }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("sin_sociedad");
  });

  it("400s on an unknown integration id", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED);
    const res = await POST(req("POST", created!.token, { integration: "not_a_real_one" }));
    expect(res.status).toBe(400);
  });

  it("records the platform model choice without touching Vercel or requiring a deploy", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_NO_DEPLOY); // no deploy at all
    const res = await POST(
      req("POST", created!.token, { integration: "model_key", modelChoice: "platform" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status.modelChoice).toBe("platform");
    expect(body.status.configured).toBe(true);
    expect(setEnvMock).not.toHaveBeenCalled();
    expect(redeployMock).not.toHaveBeenCalled();
  });

  it("404s (sin_deploy) for a business integration when the society was never provisioned", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_NO_DEPLOY);
    const res = await POST(
      req("POST", created!.token, {
        integration: "mercadopago",
        fields: { accessToken: "APP_USR-1234567890" },
      }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("sin_deploy");
    expect(validateMpMock).not.toHaveBeenCalled();
  });

  it("a validation failure saves nothing: no Vercel call, no KV write, 422", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED);
    validateMpMock.mockResolvedValueOnce({ ok: false, message: "Mercado Pago rechazó el access token." });

    const res = await POST(
      req("POST", created!.token, { integration: "mercadopago", fields: { accessToken: "APP_USR-bad" } }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.message).toBe("Mercado Pago rechazó el access token.");
    expect(setEnvMock).not.toHaveBeenCalled();
    expect(redeployMock).not.toHaveBeenCalled();
  });

  it("never leaks the submitted secret in a validation-failure response body", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED);
    validateMpMock.mockResolvedValueOnce({ ok: false, message: "Mercado Pago rechazó el access token." });

    const res = await POST(
      req("POST", created!.token, {
        integration: "mercadopago",
        fields: { accessToken: "APP_USR-SUPER-SECRET-VALUE" },
      }),
    );
    const text = await res.text();
    expect(text).not.toContain("APP_USR-SUPER-SECRET-VALUE");
  });

  it("happy path: validates, sets the exact env vars, saves masked metadata, triggers a redeploy", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED);
    validateMpMock.mockResolvedValueOnce({ ok: true, verified: true });
    setEnvMock.mockResolvedValueOnce({ ok: true, typeUsed: "sensitive" });
    redeployMock.mockResolvedValueOnce({ ok: true, url: "soc-reg-1.vercel.app", deploymentState: "READY" });

    const res = await POST(
      req("POST", created!.token, {
        integration: "mercadopago",
        fields: { accessToken: "APP_USR-1234567890" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status.configured).toBe(true);
    expect(body.status.verified).toBe(true);
    expect(body.status.maskedHint).toBe("7890");
    expect(body.redeploy).toEqual({ triggered: true, state: "READY" });

    expect(setEnvMock).toHaveBeenCalledWith("soc-reg-1", [
      { name: "MERCADOPAGO_ACCESS_TOKEN", value: "APP_USR-1234567890" },
    ]);
    expect(redeployMock).toHaveBeenCalledWith("soc-reg-1");

    // KV never stored the raw token, only the masked hint.
    const raw = JSON.stringify(kvStore.get(`studio:credentials:${created!.accountId}:mercadopago`));
    expect(raw).not.toContain("APP_USR-1234567890");
  });

  it("whatsapp: sets both env vars from the two submitted fields", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED);
    validateWaMock.mockResolvedValueOnce({ ok: true, verified: true });
    setEnvMock.mockResolvedValueOnce({ ok: true, typeUsed: "sensitive" });
    redeployMock.mockResolvedValueOnce({ ok: true, url: "x", deploymentState: "READY" });

    const res = await POST(
      req("POST", created!.token, {
        integration: "whatsapp",
        fields: { accessToken: "EAA1234567890", phoneNumberId: "1234567890" },
      }),
    );
    expect(res.status).toBe(200);
    expect(setEnvMock).toHaveBeenCalledWith("soc-reg-1", [
      { name: "WHATSAPP_ACCESS_TOKEN", value: "EAA1234567890" },
      { name: "WHATSAPP_PHONE_NUMBER_ID", value: "1234567890" },
    ]);
  });

  it("model_key own: validates the key live and sets ANTHROPIC_API_KEY", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED);
    validateModelMock.mockResolvedValueOnce({ ok: true, verified: true });
    setEnvMock.mockResolvedValueOnce({ ok: true, typeUsed: "sensitive" });
    redeployMock.mockResolvedValueOnce({ ok: true, url: "x", deploymentState: "READY" });

    const res = await POST(
      req("POST", created!.token, {
        integration: "model_key",
        modelChoice: "own",
        fields: { apiKey: "sk-ant-1234567890" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status.modelChoice).toBe("own");
    expect(setEnvMock).toHaveBeenCalledWith("soc-reg-1", [
      { name: "ANTHROPIC_API_KEY", value: "sk-ant-1234567890" },
    ]);
  });

  it("an env-save failure after successful validation persists nothing and returns 502", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED);
    validateMpMock.mockResolvedValueOnce({ ok: true, verified: true });
    setEnvMock.mockResolvedValueOnce({ ok: false, error: "env_vars_failed: quota" });

    const res = await POST(
      req("POST", created!.token, {
        integration: "mercadopago",
        fields: { accessToken: "APP_USR-1234567890" },
      }),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("env_save_failed");
    expect(redeployMock).not.toHaveBeenCalled();

    const got = kvStore.get(`studio:credentials:${created!.accountId}:mercadopago`);
    expect(got).toBeUndefined();
  });

  it("a redeploy failure does not undo the already-saved credential (best-effort, reported separately)", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_DEPLOYED);
    validateMpMock.mockResolvedValueOnce({ ok: true, verified: true });
    setEnvMock.mockResolvedValueOnce({ ok: true, typeUsed: "sensitive" });
    redeployMock.mockResolvedValueOnce({ ok: false, error: "deployment_create_failed: quota" });

    const res = await POST(
      req("POST", created!.token, {
        integration: "mercadopago",
        fields: { accessToken: "APP_USR-1234567890" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status.configured).toBe(true);
    expect(body.redeploy).toEqual({ triggered: true, error: "deployment_create_failed: quota" });
  });

  it("rate limits at 20/hour/account", async () => {
    const created = await createAccount();
    await setStoredSociety(created!.accountId, FIXTURE_NO_DEPLOY);
    for (let i = 0; i < 20; i++) {
      const res = await POST(
        req("POST", created!.token, { integration: "model_key", modelChoice: "platform" }),
      );
      expect(res.status).toBe(200);
    }
    const res21 = await POST(
      req("POST", created!.token, { integration: "model_key", modelChoice: "platform" }),
    );
    expect(res21.status).toBe(429);
  });
});
