/**
 * Unit tests for `withLocalAudit`, the one wrapper that makes every tool
 * call land in the local signed audit log (ROADMAP.md M3-4/M3-5). Exercises
 * the middleware directly against a fake tool -- no model, no other
 * @ar-agents/* package involved.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tool, type Tool } from "ai";
import { z } from "zod";
import { ArAgentsError } from "@ar-agents/core";
import { withLocalAudit } from "../src/lib/audit-middleware";
import { __resetLocalAuditForTests, readLocalAudit } from "../src/lib/audit-log";

beforeEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  __resetLocalAuditForTests();
});

afterEach(() => {
  __resetLocalAuditForTests();
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
