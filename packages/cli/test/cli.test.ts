import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run, type RunDeps } from "../src/index";

function fakeResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("run()", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "ar-agents-cli-test-"));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it("--help returns 0 and lists login/whoami", async () => {
    const out: string[] = [];
    const deps: RunDeps = {
      env: { AR_AGENTS_CONFIG_DIR: configDir },
      fetchImpl: vi.fn() as unknown as typeof fetch,
      stdout: { write: (s: string) => { out.push(s); } },
      stderr: { write: () => {} },
      homedir: "/nonexistent-home",
      platform: "linux",
      version: "test",
    };
    const code = await run(["--help"], deps);
    expect(code).toBe(0);
    const combined = out.join("");
    expect(combined).toContain("login");
    expect(combined).toContain("whoami");
  });

  it("whoami with no prior config returns 1 and mentions login", async () => {
    const err: string[] = [];
    const deps: RunDeps = {
      env: { AR_AGENTS_CONFIG_DIR: configDir },
      fetchImpl: vi.fn() as unknown as typeof fetch,
      stdout: { write: () => {} },
      stderr: { write: (s: string) => { err.push(s); } },
      homedir: "/nonexistent-home",
      platform: "linux",
      version: "test",
    };
    const code = await run(["whoami"], deps);
    expect(code).toBe(1);
    expect(err.join("")).toContain("login");
  });

  it("login mints an account, persists config, and never prints the token", async () => {
    const MINTED_TOKEN = "stu_super_secret_do_not_print_me";
    const out: string[] = [];
    const err: string[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(201, { ok: true, accountId: "acc_login_1", token: MINTED_TOKEN }),
    );
    const deps: RunDeps = {
      env: { AR_AGENTS_CONFIG_DIR: configDir },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      stdout: { write: (s: string) => { out.push(s); } },
      stderr: { write: (s: string) => { err.push(s); } },
      homedir: "/nonexistent-home",
      platform: "linux",
      version: "test",
    };

    const code = await run(["login"], deps);
    expect(code).toBe(0);

    const combined = out.join("") + err.join("");
    expect(combined).not.toContain(MINTED_TOKEN);
    expect(combined).toContain("acc_login_1");

    // Config was actually persisted.
    const { readConfig, resolveConfigDir } = await import("../src/config");
    const persisted = readConfig(resolveConfigDir(deps));
    expect(persisted?.token).toBe(MINTED_TOKEN);
    expect(persisted?.accountId).toBe("acc_login_1");
  });

  it("whoami after login prints the accountId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(201, { ok: true, accountId: "acc_whoami_1", token: "stu_whoami_secret" }),
    );
    const loginDeps: RunDeps = {
      env: { AR_AGENTS_CONFIG_DIR: configDir },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      stdout: { write: () => {} },
      stderr: { write: () => {} },
      homedir: "/nonexistent-home",
      platform: "linux",
      version: "test",
    };
    await run(["login"], loginDeps);

    const out: string[] = [];
    const whoamiFetch = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        ok: true,
        accountId: "acc_whoami_1",
        createdAt: "2026-01-01T00:00:00.000Z",
        usage: { month: "2026-07", inputTokens: 1, outputTokens: 2, costMicroUsd: 100, priceMicroUsd: 5 },
        cap: { monthlyCostMicroUsd: 1000000, remainingMicroUsd: 999900 },
        society: null,
      }),
    );
    const whoamiDeps: RunDeps = {
      env: { AR_AGENTS_CONFIG_DIR: configDir },
      fetchImpl: whoamiFetch as unknown as typeof fetch,
      stdout: { write: (s: string) => { out.push(s); } },
      stderr: { write: () => {} },
      homedir: "/nonexistent-home",
      platform: "linux",
      version: "test",
    };
    const code = await run(["whoami"], whoamiDeps);
    expect(code).toBe(0);
    expect(out.join("")).toContain("acc_whoami_1");
  });

  it("login --token validates and persists an existing token without printing it", async () => {
    const EXISTING_TOKEN = "stu_existing_secret_keep_hidden";
    const out: string[] = [];
    const err: string[] = [];
    // The --token branch validates via GET /api/account before storing.
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        ok: true,
        accountId: "acc_attach_1",
        createdAt: "2026-01-01T00:00:00.000Z",
        usage: { month: "2026-07", inputTokens: 0, outputTokens: 0, costMicroUsd: 0, priceMicroUsd: 0 },
        cap: { monthlyCostMicroUsd: 1000000, remainingMicroUsd: 1000000 },
        society: null,
      }),
    );
    const deps: RunDeps = {
      env: { AR_AGENTS_CONFIG_DIR: configDir },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      stdout: { write: (s: string) => { out.push(s); } },
      stderr: { write: (s: string) => { err.push(s); } },
      homedir: "/nonexistent-home",
      platform: "linux",
      version: "test",
    };

    const code = await run(["login", "--token", EXISTING_TOKEN], deps);
    expect(code).toBe(0);
    const combined = out.join("") + err.join("");
    expect(combined).not.toContain(EXISTING_TOKEN);
    expect(combined).toContain("acc_attach_1");

    // The validating request carried the token in the x-studio-token header,
    // not the URL.
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(EXISTING_TOKEN);
    expect((init.headers as Record<string, string>)["x-studio-token"]).toBe(EXISTING_TOKEN);

    const { readConfig, resolveConfigDir } = await import("../src/config");
    expect(readConfig(resolveConfigDir(deps))?.token).toBe(EXISTING_TOKEN);
  });

  it("whoami on an upstream error returns 1 without leaking the stored token", async () => {
    const STORED_TOKEN = "stu_stored_secret_never_leak";
    const { writeConfig } = await import("../src/config");
    writeConfig(configDir, { studioUrl: "https://studio.example", token: STORED_TOKEN, accountId: "acc_e" });

    const out: string[] = [];
    const err: string[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(401, { ok: false, error: "no_autorizado" }));
    const deps: RunDeps = {
      env: { AR_AGENTS_CONFIG_DIR: configDir },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      stdout: { write: (s: string) => { out.push(s); } },
      stderr: { write: (s: string) => { err.push(s); } },
      homedir: "/nonexistent-home",
      platform: "linux",
      version: "test",
    };
    const code = await run(["whoami"], deps);
    expect(code).toBe(1);
    expect(out.join("") + err.join("")).not.toContain(STORED_TOKEN);
  });

  it("bogus command returns 1", async () => {
    const deps: RunDeps = {
      env: { AR_AGENTS_CONFIG_DIR: configDir },
      fetchImpl: vi.fn() as unknown as typeof fetch,
      stdout: { write: () => {} },
      stderr: { write: () => {} },
      homedir: "/nonexistent-home",
      platform: "linux",
      version: "test",
    };
    const code = await run(["bogus"], deps);
    expect(code).toBe(1);
  });
});
