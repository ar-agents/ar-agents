import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  projectSlugFor,
  provisionSocietyApp,
  redeploySocietyApp,
  setSocietyCredentialEnvVars,
} from "../src/lib/vercel-provision";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  process.env.VERCEL_PROVISION_TOKEN = "test-token";
  delete process.env.VERCEL_TEAM_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.VERCEL_PROVISION_TOKEN;
  delete process.env.VERCEL_TEAM_ID;
});

describe("projectSlugFor", () => {
  it("prefixes with soc- and caps at 52 chars", async () => {
    const long = "ar-agents-operaciones-sociedad-automatiz-a-very-long-registry-id-indeed";
    const slug = projectSlugFor(long);
    expect(slug.startsWith("soc-")).toBe(true);
    expect(slug.length).toBeLessThanOrEqual(52);
  });

  it("sanitizes characters Vercel project names disallow", async () => {
    expect(projectSlugFor("Kiosco Automatizado! SAS")).toBe("soc-kiosco-automatizado-sas");
  });
});

describe("provisionSocietyApp", () => {
  it("returns null when VERCEL_PROVISION_TOKEN is not set (no capability, not a failure)", async () => {
    delete process.env.VERCEL_PROVISION_TOKEN;
    const result = await provisionSocietyApp({ name: "reg-1", envVars: [] });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("happy path: creates the project, sets env vars, deploys, and reports a terminal READY state", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "prj_1", name: "soc-reg-1" }))
      .mockResolvedValueOnce(jsonResponse({ created: [], failed: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "dpl_1", url: "soc-reg-1.vercel.app", readyState: "READY" }));

    const result = await provisionSocietyApp({
      name: "reg-1",
      envVars: [
        { name: "SOCIETY_ID", value: "sess-1" },
        { name: "AGENT_API_KEY", value: "deadbeef" },
      ],
    });

    expect(result).toEqual({
      ok: true,
      projectName: "soc-reg-1",
      url: "soc-reg-1.vercel.app",
      deploymentState: "READY",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [createUrl, createInit] = fetchMock.mock.calls[0]!;
    expect(String(createUrl)).toBe("https://api.vercel.com/v11/projects");
    const createBody = JSON.parse((createInit as RequestInit).body as string);
    expect(createBody).toEqual({
      name: "soc-reg-1",
      framework: "nextjs",
      rootDirectory: "apps/sociedad-ia-starter",
      gitRepository: { type: "github", repo: "ar-agents/ar-agents" },
    });
    expect((createInit as RequestInit).headers).toMatchObject({ authorization: "Bearer test-token" });

    const [envUrl, envInit] = fetchMock.mock.calls[1]!;
    expect(String(envUrl)).toBe("https://api.vercel.com/v10/projects/soc-reg-1/env");
    const envBody = JSON.parse((envInit as RequestInit).body as string);
    expect(envBody).toEqual([
      { key: "SOCIETY_ID", value: "sess-1", type: "encrypted", target: ["production"] },
      { key: "AGENT_API_KEY", value: "deadbeef", type: "encrypted", target: ["production"] },
    ]);

    const [deployUrl, deployInit] = fetchMock.mock.calls[2]!;
    expect(String(deployUrl)).toBe("https://api.vercel.com/v13/deployments");
    const deployBody = JSON.parse((deployInit as RequestInit).body as string);
    expect(deployBody).toEqual({
      name: "soc-reg-1",
      project: "soc-reg-1",
      gitSource: { type: "github", org: "ar-agents", repo: "ar-agents", ref: "main" },
    });
  });

  it("scopes every call to VERCEL_TEAM_ID with ?teamId= when set", async () => {
    process.env.VERCEL_TEAM_ID = "team_abc";
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "prj_1" }))
      .mockResolvedValueOnce(jsonResponse({ created: [], failed: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "dpl_1", url: "x.vercel.app", readyState: "READY" }));

    await provisionSocietyApp({ name: "reg-2", envVars: [] });

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toMatch(/[?&]teamId=team_abc/);
    }
  });

  it("409 on project creation surfaces a distinct 'project_exists' error and stops before env vars", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "conflict", message: "already exists" } }, 409));

    const result = await provisionSocietyApp({ name: "reg-3", envVars: [{ name: "X", value: "y" }] });

    expect(result).toEqual({ ok: false, error: "project_exists" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an env-var failure surfaces a distinct error after the project was created", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "prj_1" }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "forbidden", message: "quota" } }, 403));

    const result = await provisionSocietyApp({ name: "reg-4", envVars: [{ name: "X", value: "y" }] });

    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/^env_vars_failed:/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a deployment that ends in ERROR is still a successful provision (the app deployed, the build failed)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "prj_1" }))
      .mockResolvedValueOnce(jsonResponse({ created: [], failed: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "dpl_1", url: "soc-reg-5.vercel.app", readyState: "ERROR" }));

    const result = await provisionSocietyApp({ name: "reg-5", envVars: [] });

    expect(result).toEqual({
      ok: true,
      projectName: "soc-reg-5",
      url: "soc-reg-5.vercel.app",
      deploymentState: "ERROR",
    });
    // Terminal on the very first response: no polling GET calls made.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("a network error creating the project surfaces as a distinct error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const result = await provisionSocietyApp({ name: "reg-6", envVars: [] });
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/^project_create_network_error:/);
  });
});

describe("setSocietyCredentialEnvVars", () => {
  it("returns null when VERCEL_PROVISION_TOKEN is not set (no capability, not a failure)", async () => {
    delete process.env.VERCEL_PROVISION_TOKEN;
    const result = await setSocietyCredentialEnvVars("soc-reg-1", [{ name: "X", value: "y" }]);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tries type 'sensitive' first, with upsert=true, targeting the exact project name given", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ created: [], failed: [] }));
    const result = await setSocietyCredentialEnvVars("soc-reg-1", [
      { name: "MERCADOPAGO_ACCESS_TOKEN", value: "APP_USR-123" },
    ]);
    expect(result).toEqual({ ok: true, typeUsed: "sensitive" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.vercel.com/v10/projects/soc-reg-1/env?upsert=true");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual([
      { key: "MERCADOPAGO_ACCESS_TOKEN", value: "APP_USR-123", type: "sensitive", target: ["production"] },
    ]);
  });

  it("falls back to type 'encrypted' when 'sensitive' is rejected", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: "bad_request", message: "unsupported type" } }, 400))
      .mockResolvedValueOnce(jsonResponse({ created: [], failed: [] }));

    const result = await setSocietyCredentialEnvVars("soc-reg-1", [{ name: "X", value: "y" }]);
    expect(result).toEqual({ ok: true, typeUsed: "encrypted" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(secondBody).toEqual([{ key: "X", value: "y", type: "encrypted", target: ["production"] }]);
  });

  it("surfaces a distinct error when both 'sensitive' and 'encrypted' are rejected", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: "forbidden" } }, 403))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "forbidden" } }, 403));

    const result = await setSocietyCredentialEnvVars("soc-reg-1", [{ name: "X", value: "y" }]);
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/^env_vars_failed:/);
  });
});

describe("redeploySocietyApp", () => {
  it("returns null when VERCEL_PROVISION_TOKEN is not set", async () => {
    delete process.env.VERCEL_PROVISION_TOKEN;
    const result = await redeploySocietyApp("soc-reg-1");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("triggers a deployment against the exact project name and polls to a terminal state", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: "dpl_2", url: "soc-reg-1.vercel.app", readyState: "READY" }),
    );
    const result = await redeploySocietyApp("soc-reg-1");
    expect(result).toEqual({ ok: true, url: "soc-reg-1.vercel.app", deploymentState: "READY" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.vercel.com/v13/deployments");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      name: "soc-reg-1",
      project: "soc-reg-1",
      gitSource: { type: "github", org: "ar-agents", repo: "ar-agents", ref: "main" },
    });
  });

  it("surfaces a deployment-create failure as a distinct error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "quota" } }, 403));
    const result = await redeploySocietyApp("soc-reg-1");
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/^deployment_create_failed:/);
  });
});
