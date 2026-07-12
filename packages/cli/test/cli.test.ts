import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run, runChatTurn, type RunDeps } from "../src/index";

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

  describe("chat", () => {
    it("with no stored config returns 1 and mentions login", async () => {
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
      const code = await run(["chat"], deps);
      expect(code).toBe(1);
      expect(err.join("")).toContain("login");
    });

    it("with a stored config but no stdin provided returns 0, prints a needs-a-TTY message, and never prints the token", async () => {
      const STORED_TOKEN = "stu_chat_secret_never_leak";
      const { writeConfig } = await import("../src/config");
      writeConfig(configDir, { studioUrl: "https://studio.example", token: STORED_TOKEN, accountId: "acc_chat" });

      const out: string[] = [];
      const deps: RunDeps = {
        env: { AR_AGENTS_CONFIG_DIR: configDir },
        fetchImpl: vi.fn() as unknown as typeof fetch,
        stdout: { write: (s: string) => { out.push(s); } },
        stderr: { write: () => {} },
        homedir: "/nonexistent-home",
        platform: "linux",
        version: "test",
        // no `stdin`: chat must not block waiting on a TTY that isn't there.
      };
      const code = await run(["chat"], deps);
      expect(code).toBe(0);
      const combined = out.join("");
      expect(combined.length).toBeGreaterThan(0);
      expect(combined).not.toContain(STORED_TOKEN);
    });
  });

  describe("constitute", () => {
    const DRAFT = {
      denominacion: "Sociedad Ejemplo",
      tipo: "SAS",
      capitalSocial: 100000,
      objeto: "Desarrollo de software y servicios informaticos en general.",
    };

    function writeDraftFile(): string {
      const path = join(configDir, "draft.json");
      writeFileSync(path, JSON.stringify(DRAFT));
      return path;
    }

    function depsWithSession(fetchImpl: ReturnType<typeof vi.fn>, out: string[], err: string[]): RunDeps {
      return {
        env: { AR_AGENTS_CONFIG_DIR: configDir },
        fetchImpl: fetchImpl as unknown as typeof fetch,
        stdout: { write: (s: string) => { out.push(s); } },
        stderr: { write: (s: string) => { err.push(s); } },
        homedir: "/nonexistent-home",
        platform: "linux",
        version: "test",
      };
    }

    it("with no stored config returns 1 and mentions login", async () => {
      const err: string[] = [];
      const fetchImpl = vi.fn();
      const deps = depsWithSession(fetchImpl, [], err);
      const draftPath = writeDraftFile();

      const code = await run(
        ["constitute", "--draft", draftPath, "--nombre", "Juan Perez", "--cuit", "20-12345678-6", "--acepta-102"],
        deps,
      );
      expect(code).toBe(1);
      expect(err.join("")).toContain("login");
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("without --acepta-102 refuses, prints a confirmation message, and never calls fetch", async () => {
      const { writeConfig } = await import("../src/config");
      writeConfig(configDir, { studioUrl: "https://studio.example", token: "stu_gate", accountId: "acc_gate" });

      const out: string[] = [];
      const err: string[] = [];
      const fetchImpl = vi.fn();
      const deps = depsWithSession(fetchImpl, out, err);
      const draftPath = writeDraftFile();

      const code = await run(
        ["constitute", "--draft", draftPath, "--nombre", "Juan Perez", "--cuit", "20-12345678-6"],
        deps,
      );
      expect(code).toBe(1);
      expect(err.join("")).toContain("art. 102");
      expect(err.join("")).toContain("--acepta-102");
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("on a 409 ya_tiene_sociedad response returns 1 and prints the message", async () => {
      const { writeConfig } = await import("../src/config");
      writeConfig(configDir, { studioUrl: "https://studio.example", token: "stu_409", accountId: "acc_409" });

      const out: string[] = [];
      const err: string[] = [];
      const fetchImpl = vi.fn().mockResolvedValue(
        fakeResponse(409, {
          ok: false,
          error: "ya_tiene_sociedad",
          message: "Esta cuenta ya tiene una sociedad constituida.",
        }),
      );
      const deps = depsWithSession(fetchImpl, out, err);
      const draftPath = writeDraftFile();

      const code = await run(
        ["constitute", "--draft", draftPath, "--nombre", "Juan Perez", "--cuit", "20-12345678-6", "--acepta-102"],
        deps,
      );
      expect(code).toBe(1);
      expect(err.join("")).toContain("ya tiene una sociedad");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("on success prints the denominacion, both tokens, and a self-custody warning, and never leaks the session token", async () => {
      const STORED_TOKEN = "stu_constitute_secret_never_leak";
      const { writeConfig } = await import("../src/config");
      writeConfig(configDir, { studioUrl: "https://studio.example", token: STORED_TOKEN, accountId: "acc_ok" });

      const out: string[] = [];
      const err: string[] = [];
      const fetchImpl = vi.fn().mockResolvedValue(
        fakeResponse(200, {
          ok: true,
          society: { denominacion: "Sociedad Ejemplo", tipo: "SAS", registryId: "reg_1" },
          credentials: { adminToken: "admin_tok_xyz", gateToken: "gate_tok_xyz" },
        }),
      );
      const deps = depsWithSession(fetchImpl, out, err);
      const draftPath = writeDraftFile();

      // No --url flag: proves the command targets the stored config.studioUrl
      // (the studio the session token was minted against), not the production
      // default.
      const code = await run(
        [
          "constitute",
          "--draft",
          draftPath,
          "--nombre",
          "Juan Perez",
          "--cuit",
          "20-12345678-6",
          "--acepta-102",
        ],
        deps,
      );
      expect(code).toBe(0);
      const combined = out.join("");
      expect(combined).toContain("Sociedad Ejemplo");
      expect(combined).toContain("admin_tok_xyz");
      expect(combined).toContain("gate_tok_xyz");
      expect(combined).toContain("No se muestran de nuevo");
      expect(combined).not.toContain(STORED_TOKEN);

      // The request targeted the stored studioUrl and carried the session
      // token in the x-studio-token header, acepta102: true, and the parsed
      // draft/administrador.
      const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://studio.example/api/society/constitute");
      expect((init.headers as Record<string, string>)["x-studio-token"]).toBe(STORED_TOKEN);
      const body = JSON.parse(init.body as string);
      expect(body.acepta102).toBe(true);
      expect(body.administrador).toEqual({ nombre: "Juan Perez", cuit: "20-12345678-6" });
      expect(body.draft).toEqual(DRAFT);
    });
  });

  describe("runChatTurn", () => {
    function sseEvent(chunk: unknown): string {
      return `data: ${JSON.stringify(chunk)}\n\n`;
    }

    function streamBody(text: string): ReadableStream<Uint8Array> {
      const encoded = new TextEncoder().encode(text);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoded);
          controller.close();
        },
      });
    }

    it("streams text to stdout incrementally, surfaces the tool call, and appends an assistant turn without ever printing the token", async () => {
      const STORED_TOKEN = "stu_runchatturn_secret_never_leak";
      const fixture = [
        sseEvent({ type: "text-delta", id: "t1", delta: "Hola" }),
        sseEvent({ type: "text-delta", id: "t1", delta: " mundo" }),
        sseEvent({
          type: "tool-input-available",
          toolCallId: "call-1",
          toolName: "preview_society",
          input: { prompt: "peluqueria" },
        }),
        sseEvent({
          type: "tool-output-available",
          toolCallId: "call-1",
          output: { ok: true, draft: { denominacion: "Turnos SAS" } },
        }),
        sseEvent({ type: "finish" }),
      ].join("");

      const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, body: streamBody(fixture) } as unknown as Response);
      const chunks: string[] = [];

      const result = await runChatTurn({
        baseUrl: "https://studio.example",
        token: STORED_TOKEN,
        history: [],
        userText: "quiero armar una peluqueria",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        stdout: { write: (s: string) => { chunks.push(s); } },
      });

      expect(chunks.length).toBeGreaterThan(1); // wrote incrementally, not one big blob
      const combined = chunks.join("");
      expect(combined).toContain("Hola");
      expect(combined).toContain("mundo");
      expect(combined).toContain("preview_society");
      expect(combined).not.toContain(STORED_TOKEN);

      expect(result.error).toBeNull();
      expect(result.history).toHaveLength(2);
      expect(result.history[0]).toEqual({
        id: "u-0",
        role: "user",
        parts: [{ type: "text", text: "quiero armar una peluqueria" }],
      });
      expect(result.history[1]).toEqual({
        id: "a-0",
        role: "assistant",
        parts: [{ type: "text", text: "Hola mundo" }],
      });
    });

    it("drops the whole turn on an upstream error, leaving history unchanged and valid", async () => {
      const priorHistory = [
        { id: "u-0", role: "user" as const, parts: [{ type: "text" as const, text: "hola" }] },
        { id: "a-0", role: "assistant" as const, parts: [{ type: "text" as const, text: "buenas" }] },
      ];
      // A 402 cap response: sendAgentTurn throws before any bytes stream.
      const fetchImpl = vi.fn().mockResolvedValue(
        { ok: false, status: 402, json: async () => ({ ok: false, error: "cap" }) } as unknown as Response,
      );
      const chunks: string[] = [];

      const result = await runChatTurn({
        baseUrl: "https://studio.example",
        token: "stu_err_secret",
        history: priorHistory,
        userText: "otra pregunta",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        stdout: { write: (s: string) => { chunks.push(s); } },
      });

      expect(result.error).toContain("402");
      // History is unchanged: no empty assistant part appended, no dangling
      // user turn. The next request stays valid.
      expect(result.history).toEqual(priorHistory);
      expect(chunks.join("")).not.toContain("stu_err_secret");
    });

    it("does not persist an assistant turn when the stream yields no text", async () => {
      // A stream that finishes with only a tool output and no text-delta.
      const fixture = [
        `data: ${JSON.stringify({ type: "tool-input-available", toolCallId: "c1", toolName: "preview_society", input: {} })}\n\n`,
        `data: ${JSON.stringify({ type: "tool-output-available", toolCallId: "c1", output: { ok: true } })}\n\n`,
        `data: ${JSON.stringify({ type: "finish" })}\n\n`,
      ].join("");
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(fixture));
          controller.close();
        },
      });
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, body } as unknown as Response);

      const result = await runChatTurn({
        baseUrl: "https://studio.example",
        token: "stu_notext",
        history: [],
        userText: "algo",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        stdout: { write: () => {} },
      });

      expect(result.error).toBeNull();
      // No empty-text assistant part persisted.
      expect(result.history).toEqual([]);
    });
  });
});
