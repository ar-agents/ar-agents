/**
 * End-to-end proof for ROADMAP.md M3-4 ("the deployed society performs one
 * real, visible business task through its agent... the action lands in the
 * signed audit log, visible in the studio cockpit") and M3-5 (the agent
 * loop's tool calls actually append to a signed audit log).
 *
 * Drives: prompt-equivalent tool call -> local signed audit entry ->
 * `GET /api/status` returns it.
 *
 * No live model call: this is the "fake tool-runner seam" the task allows
 * as an alternative to mocking the LLM provider. `buildTools()` (exported
 * from lib/agent.ts) returns the EXACT tool set `buildAgent()` wires into
 * the `Experimental_Agent` -- risk-gated (art. 102) and audited
 * (withLocalAudit), the same objects the AI SDK's tool-step executor would
 * call once the model decides to call `registrar_decision`. This test
 * calls `execute` the same way that executor does (positional args + a
 * ToolCallOptions-shaped second argument), so it exercises the real
 * governance + audit wiring without needing to reverse-engineer the
 * Anthropic provider's response format or spin up MockLanguageModel
 * plumbing for a 20-step agent loop.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Tool } from "ai";
import { buildTools } from "../src/lib/agent";
import { __resetLocalAuditForTests } from "../src/lib/audit-log";
import { GET as getStatus } from "../src/app/api/status/route";

const STATUS_TOKEN = "e2e-status-token-0123456789abcdef";

function statusReq(): Request {
  return new Request("https://starter.test/api/status", {
    headers: { authorization: `Bearer ${STATUS_TOKEN}` },
  });
}

beforeEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.SOCIETY_ID; // dev mode: approve()/isHalted() pass through
  delete process.env.AUDIT_HMAC_SECRET;
  process.env.STUDIO_STATUS_TOKEN = STATUS_TOKEN;
  __resetLocalAuditForTests();
});

afterEach(() => {
  delete process.env.STUDIO_STATUS_TOKEN;
  __resetLocalAuditForTests();
});

describe("agent loop -> audit log -> /api/status (M3-4 / M3-5 proof)", () => {
  it("registrar_decision is wired, needs no external client config", async () => {
    const tools = await buildTools();
    expect(tools).toHaveProperty("registrar_decision");
  });

  it("a prompt-driven tool call lands in the local audit log, readable via GET /api/status", async () => {
    const tools = await buildTools();
    const registrarDecision = tools.registrar_decision as Tool;
    const execute = registrarDecision.execute as (
      args: { decision: string; rationale?: string },
      ctx: unknown,
    ) => Promise<unknown>;

    // The agent, given a prompt like "anotá que vamos a priorizar clientes
    // mayoristas este mes", decides to call registrar_decision -- exactly
    // the shape the AI SDK's tool-step executor invokes execute() with.
    const result = await execute(
      { decision: "priorizar clientes mayoristas este mes", rationale: "mejor margen" },
      { toolCallId: "call_1", messages: [] },
    );
    expect(result).toMatchObject({ recorded: true, decision: "priorizar clientes mayoristas este mes" });

    const res = await getStatus(statusReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit.available).toBe(true);
    expect(body.audit.entries).toHaveLength(1);
    expect(body.audit.entries[0]).toMatchObject({
      tool: "registrar_decision",
      governance: "create",
      errored: false,
      summary: "priorizar clientes mayoristas este mes",
    });
    expect(body.audit.droppedWrites).toBe(0);
  });

  it("a tool call that degrades gracefully (available:false, not a throw) also lands in the audit log", async () => {
    const tools = await buildTools();
    // lookup_cuit_afip is always-on but needs AFIP_CERT_PEM/KEY_PEM/CUIT,
    // unset in this test env, so the underlying package returns
    // available:false rather than throwing -- a different outcome from a
    // thrown error (covered in test/audit-middleware.test.ts), and this
    // proves the real @ar-agents/identity package's tool audits correctly
    // end to end, not just a hand-rolled fake tool.
    const lookup = tools.lookup_cuit_afip as Tool;
    const execute = lookup.execute as (args: { cuit: string }, ctx: unknown) => Promise<unknown>;
    const result = (await execute({ cuit: "20-12345678-6" }, { toolCallId: "call_2", messages: [] })) as {
      available: boolean;
    };
    expect(result.available).toBe(false); // AFIP not configured in this test env

    const res = await getStatus(statusReq());
    const body = await res.json();
    const entry = body.audit.entries.find((e: { tool: string }) => e.tool === "lookup_cuit_afip");
    expect(entry).toBeDefined();
    expect(entry.errored).toBe(false); // the tool itself didn't throw, it returned available:false
    expect(entry.summary).toContain("no disponible");
  });

  it("HMAC-signs entries when AUDIT_HMAC_SECRET is configured (studio provisions this)", async () => {
    process.env.AUDIT_HMAC_SECRET = "e2e-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";
    try {
      const tools = await buildTools();
      const registrarDecision = tools.registrar_decision as Tool;
      const execute = registrarDecision.execute as (
        args: { decision: string },
        ctx: unknown,
      ) => Promise<unknown>;
      await execute({ decision: "firmar este registro" }, { toolCallId: "call_3", messages: [] });

      // hmac isn't exposed in the /api/status payload (public-safe surface),
      // so verify signing at the storage layer directly.
      const { readLocalAudit } = await import("../src/lib/audit-log");
      const entries = await readLocalAudit(1);
      expect(entries[0]!.hmac).toMatch(/^sha256:[0-9a-f]+$/);
    } finally {
      delete process.env.AUDIT_HMAC_SECRET;
    }
  });
});
