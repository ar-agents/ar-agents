/**
 * Unit tests for `withLocalAudit`, the one wrapper that makes every tool
 * call land in the local signed audit log (ROADMAP.md M3-4/M3-5). Exercises
 * the middleware directly against a fake tool -- no model, no other
 * @ar-agents/* package involved.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tool, type Tool } from "ai";
import { z } from "zod";
import { ArAgentsError } from "@ar-agents/core";
import { withLocalAudit } from "../src/lib/audit-middleware";
import { __resetLocalAuditForTests, readLocalAudit } from "../src/lib/audit-log";
import { __resetAuditSinkForTests, sinkAuditDroppedWrites } from "../src/lib/audit-sink";

beforeEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.SOCIETY_ID;
  delete process.env.SOCIETY_GATE_TOKEN;
  __resetLocalAuditForTests();
  __resetAuditSinkForTests();
});

afterEach(() => {
  __resetLocalAuditForTests();
  __resetAuditSinkForTests();
  vi.unstubAllGlobals();
});

function fakeTool(execute: (args: Record<string, unknown>) => Promise<unknown>): Tool {
  return tool({
    description: "a fake tool for tests",
    inputSchema: z.record(z.string(), z.unknown()),
    execute,
  }) as unknown as Tool;
}

/** Call a wrapped tool's execute the same way the AI SDK's tool-step
 *  executor would: positional (input, options). Cast once here instead of
 *  scattering type assertions through every test. */
async function call(t: Tool, args: Record<string, unknown>): Promise<unknown> {
  const execute = t.execute as (
    args: Record<string, unknown>,
    ctx: unknown,
  ) => Promise<unknown>;
  return execute(args, { toolCallId: "t1", messages: [] });
}

describe("withLocalAudit: success path", () => {
  it("appends one entry with errored: false and the classified governance", async () => {
    const wrapped = withLocalAudit("validate_cuit")(fakeTool(async ({ x }) => ({ doubled: (x as number) * 2 })));
    const result = await call(wrapped, { x: 3 });
    expect(result).toEqual({ doubled: 6 });

    const entries = await readLocalAudit(10);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tool: "validate_cuit", governance: "read", errored: false });
  });

  it("classifies a money-moving name as needing governance beyond read/create", async () => {
    const wrapped = withLocalAudit("transferir_saldo")(fakeTool(async () => ({ ok: true })));
    await call(wrapped, { x: 1 });
    const entries = await readLocalAudit(10);
    expect(entries[0]!.governance).toBe("money");
  });

  it("special-cases registrar_decision: the summary IS the decision text", async () => {
    const wrapped = withLocalAudit("registrar_decision")(fakeTool(async () => ({ recorded: true })));
    await call(wrapped, { decision: "no facturar todavia a este cliente" });
    const entries = await readLocalAudit(10);
    expect(entries[0]!.summary).toBe("no facturar todavia a este cliente");
    expect(entries[0]!.governance).toBe("create");
  });

  it("surfaces available:false in the summary without leaking the rest of the payload", async () => {
    const wrapped = withLocalAudit("lookup_cuit_afip")(
      fakeTool(async () => ({ available: false, error: "AFIP_CERT_PEM not set", secretLeak: "nope" })),
    );
    await call(wrapped, { x: 1 });
    const entries = await readLocalAudit(10);
    expect(entries[0]!.summary).toContain("no disponible");
    expect(entries[0]!.summary).not.toContain("secretLeak");
    expect(entries[0]!.summary).not.toContain("nope");
  });
});

describe("withLocalAudit: failure path", () => {
  it("appends errored: true and rethrows the original error", async () => {
    const wrapped = withLocalAudit("emitir_factura")(
      fakeTool(async () => {
        throw new ArAgentsError("upstream boom", { code: "upstream_error", retryable: false });
      }),
    );
    await expect(call(wrapped, { x: 1 })).rejects.toThrow("upstream boom");

    const entries = await readLocalAudit(10);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tool: "emitir_factura", errored: true });
    expect(entries[0]!.summary).toContain("upstream_error");
  });

  it("audits a plain (non-ArAgentsError) throw too", async () => {
    const wrapped = withLocalAudit("transferir")(
      fakeTool(async () => {
        throw new Error("network down");
      }),
    );
    await expect(call(wrapped, { x: 1 })).rejects.toThrow("network down");
    const entries = await readLocalAudit(10);
    expect(entries[0]).toMatchObject({ tool: "transferir", errored: true });
  });
});

describe("withLocalAudit: dual-write to the platform sink (ROADMAP.md M3-6)", () => {
  function stubSinkFetch(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  beforeEach(() => {
    process.env.SOCIETY_ID = "sess-dualwrite-1";
    process.env.SOCIETY_GATE_TOKEN = "sgt_test_token";
    process.env.AR_AGENTS_API_BASE = "https://ar-agents.test";
  });

  it("forwards the exact same entry (tool/governance/errored/summary) to the sink", async () => {
    const fetchMock = stubSinkFetch();
    const wrapped = withLocalAudit("validate_cuit")(fakeTool(async () => ({ ok: true })));
    await call(wrapped, { x: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://ar-agents.test/api/society-audit/append");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.society).toBe("sess-dualwrite-1");
    expect(body.gateToken).toBe("sgt_test_token");

    const localEntries = await readLocalAudit(1);
    // Same entry forwarded to both destinations (matching id/ts/hmac).
    expect(body.entry).toEqual(localEntries[0]);
  });

  it("a sink failure never breaks the tool call or the local write, only counts a drop", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("sink down"));
    vi.stubGlobal("fetch", fetchMock);

    const wrapped = withLocalAudit("emitir_factura")(fakeTool(async () => ({ done: true })));
    const result = await call(wrapped, { x: 1 });

    expect(result).toEqual({ done: true }); // the tool's own result is untouched
    const localEntries = await readLocalAudit(1);
    expect(localEntries).toHaveLength(1); // local write still happened
    expect(localEntries[0]!.tool).toBe("emitir_factura");
    expect(sinkAuditDroppedWrites()).toBe(1);
  });

  it("a sink failure on a THROWING tool still rethrows the tool's original error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("sink down"));
    vi.stubGlobal("fetch", fetchMock);

    const wrapped = withLocalAudit("transferir")(
      fakeTool(async () => {
        throw new ArAgentsError("upstream boom", { code: "upstream_error", retryable: false });
      }),
    );
    await expect(call(wrapped, { x: 1 })).rejects.toThrow("upstream boom");
    expect(sinkAuditDroppedWrites()).toBe(1);
  });

  it("skips the sink (no fetch call) when SOCIETY_ID/SOCIETY_GATE_TOKEN are unset (local dev)", async () => {
    delete process.env.SOCIETY_ID;
    delete process.env.SOCIETY_GATE_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wrapped = withLocalAudit("validate_cuit")(fakeTool(async () => ({ ok: true })));
    await call(wrapped, { x: 1 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sinkAuditDroppedWrites()).toBe(0); // not configured is not a drop
    expect(await readLocalAudit(1)).toHaveLength(1); // local write is unaffected
  });
});
