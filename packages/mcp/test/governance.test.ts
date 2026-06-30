import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createServer,
  decideGovernance,
  resolveGovernance,
  type GovernanceOptions,
} from "../src/index";

// ---------------------------------------------------------------------------
// resolveGovernance — the DEFAULT-ON resolution order:
//   explicit option > AR_AGENTS_MCP_ENFORCE env > default ON.
// ---------------------------------------------------------------------------

describe("resolveGovernance (default-ON + opt-out)", () => {
  it("defaults enforce ON when nothing is set", () => {
    const gov = resolveGovernance({}, {} as NodeJS.ProcessEnv);
    expect(gov.enforce).toBe(true);
    // No approve hook supplied -> fail-closed.
    expect(gov.failClosed).toBe(true);
  });

  it("AR_AGENTS_MCP_ENFORCE=off is the documented opt-out", () => {
    const gov = resolveGovernance(
      {},
      { AR_AGENTS_MCP_ENFORCE: "off" } as NodeJS.ProcessEnv,
    );
    expect(gov.enforce).toBe(false);
    expect(gov.failClosed).toBe(false);
  });

  it.each(["0", "false", "no", "disabled", "OFF"])(
    "treats AR_AGENTS_MCP_ENFORCE=%s as off",
    (val) => {
      const gov = resolveGovernance(
        {},
        { AR_AGENTS_MCP_ENFORCE: val } as NodeJS.ProcessEnv,
      );
      expect(gov.enforce).toBe(false);
    },
  );

  it("explicit option beats the env var (both directions)", () => {
    // option forces ON even though env says off
    expect(
      resolveGovernance(
        { enforce: true },
        { AR_AGENTS_MCP_ENFORCE: "off" } as NodeJS.ProcessEnv,
      ).enforce,
    ).toBe(true);
    // option forces OFF even though env says on
    expect(
      resolveGovernance(
        { enforce: false },
        { AR_AGENTS_MCP_ENFORCE: "on" } as NodeJS.ProcessEnv,
      ).enforce,
    ).toBe(false);
  });

  it("AR_AGENTS_MCP_HALT=1 installs a halting kill-switch", async () => {
    const gov = resolveGovernance(
      {},
      { AR_AGENTS_MCP_HALT: "1" } as NodeJS.ProcessEnv,
    );
    expect(gov.isHalted).toBeTypeOf("function");
    expect(await gov.isHalted!("anything", {})).toBe(true);
  });

  it("no halt by default (passthrough matches today)", () => {
    const gov = resolveGovernance({}, {} as NodeJS.ProcessEnv);
    expect(gov.isHalted).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// decideGovernance — the actual CallTool gate, across every risk class.
// Tool names are classified by @ar-agents/core's classifyTool.
// ---------------------------------------------------------------------------

const ENFORCE_NO_HOOK: GovernanceOptions = {}; // default-ON, no approve hook
function gov(opts: GovernanceOptions, env: NodeJS.ProcessEnv = {} as NodeJS.ProcessEnv) {
  return resolveGovernance(opts, env);
}

describe("decideGovernance — art. 102 risk gate", () => {
  // The 5 approval-level classes (money / fiscal / legal / irreversible / unknown).
  const approvalLevelTools: Array<[string, string]> = [
    ["create_payment", "money"],
    ["refund_payment", "money"],
    ["emitir_factura", "fiscal"],
    ["incorporar_sociedad", "legal"],
    ["delete_customer_card", "irreversible"],
    ["frobnicate_widget", "unknown"], // unclassifiable -> fails closed
  ];

  it.each(approvalLevelTools)(
    "DENIES %s (%s) when enforce ON and no approve hook (fail-closed)",
    async (name, level) => {
      const d = await decideGovernance(gov(ENFORCE_NO_HOOK), name, undefined, {});
      expect(d.kind).toBe("deny");
      if (d.kind === "deny") {
        expect(d.level).toBe(level);
        expect(d.reason).toBe("fail_closed");
        // Clear, actionable message: wire a hook OR opt out.
        expect(d.message).toContain("approve hook");
        expect(d.message).toContain("AR_AGENTS_MCP_ENFORCE=off");
      }
    },
  );

  it.each(["validate_cuit", "lookup_cuit_afip", "search_payments", "get_payment"])(
    "ALWAYS allows read-level tool %s (no gate, even default-ON)",
    async (name) => {
      const d = await decideGovernance(gov(ENFORCE_NO_HOOK), name, undefined, {});
      expect(d.kind).toBe("allow");
    },
  );

  it("allows a money tool when an approve hook returns true", async () => {
    let asked = "";
    const d = await decideGovernance(
      gov({ approve: (n) => ((asked = n), true) }),
      "create_payment",
      undefined,
      { amount: 100 },
    );
    expect(d.kind).toBe("allow");
    expect(asked).toBe("create_payment");
  });

  it("denies a money tool when the approve hook returns false", async () => {
    const d = await decideGovernance(
      gov({ approve: () => false }),
      "create_payment",
      undefined,
      {},
    );
    expect(d.kind).toBe("deny");
    if (d.kind === "deny") expect(d.reason).toBe("approve_refused");
  });

  it("denies (fails closed) when the approve hook throws", async () => {
    const d = await decideGovernance(
      gov({
        approve: () => {
          throw new Error("policy engine down");
        },
      }),
      "create_payment",
      undefined,
      {},
    );
    expect(d.kind).toBe("deny");
    if (d.kind === "deny") {
      expect(d.reason).toBe("approve_refused");
      expect(d.message).toContain("policy engine down");
    }
  });

  it("enforce=off restores ungated passthrough for a money tool", async () => {
    const d = await decideGovernance(
      gov({ enforce: false }),
      "create_payment",
      undefined,
      {},
    );
    expect(d.kind).toBe("allow");
  });

  it("HALT suspends EVERY tool, even read tools, even with enforce off", async () => {
    const halted = gov({ enforce: false, isHalted: () => true });
    const dRead = await decideGovernance(halted, "validate_cuit", undefined, {});
    const dMoney = await decideGovernance(halted, "create_payment", undefined, {});
    expect(dRead.kind).toBe("halted");
    expect(dMoney.kind).toBe("halted");
    if (dRead.kind === "halted") expect(dRead.message).toContain("society_suspended");
  });

  it("a throwing kill-switch fails closed (halts)", async () => {
    const d = await decideGovernance(
      gov({
        isHalted: () => {
          throw new Error("kv down");
        },
      }),
      "validate_cuit",
      undefined,
      {},
    );
    expect(d.kind).toBe("halted");
  });
});

// ---------------------------------------------------------------------------
// Integration: drive the REAL server over an in-memory MCP transport and prove
// the gate is wired into the CallTool handler (default-ON, by tool name,
// BEFORE adapter.call — a denied money tool never hits the network).
// ---------------------------------------------------------------------------

async function connect(server: Awaited<ReturnType<typeof createServer>>["server"]) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
}

describe("server CallTool integration — gate is wired", () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    // Enable the mercadopago registry so money tools (create_payment) exist,
    // without ever hitting the network (the gate denies before execute).
    process.env.MP_ACCESS_TOKEN = "TEST-do-not-use";
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("default-ON: a read tool (validate_cuit) passes", async () => {
    const { server } = await createServer();
    const client = await connect(server);
    const res = (await client.callTool({
      name: "validate_cuit",
      arguments: { cuit: "20-12345678-6" },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBeFalsy();
    await client.close();
  });

  it("default-ON: a money tool (create_payment) is DENIED before it runs", async () => {
    const { server, governance } = await createServer();
    expect(governance.enforce).toBe(true);
    expect(governance.failClosed).toBe(true);
    const client = await connect(server);
    const res = (await client.callTool({
      name: "create_payment",
      arguments: { transaction_amount: 100 },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("art. 102");
    expect(res.content[0]!.text).toContain("AR_AGENTS_MCP_ENFORCE=off");
    await client.close();
  });

  it("AR_AGENTS_MCP_ENFORCE=off: money tool is no longer gated (reaches execute)", async () => {
    process.env.AR_AGENTS_MCP_ENFORCE = "off";
    const { server, governance } = await createServer();
    expect(governance.enforce).toBe(false);
    const client = await connect(server);
    const res = (await client.callTool({
      name: "create_payment",
      arguments: { transaction_amount: 100 },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    // Passthrough: the gate no longer blocks. The call now reaches the tool's
    // execute and fails against the fake token — proving it was NOT gated
    // (a gated call would carry the art. 102 message instead).
    expect(res.content[0]!.text).not.toContain("art. 102");
    await client.close();
  });

  it("an explicit approve hook lets a money tool through the gate", async () => {
    const { server } = await createServer({
      governance: { approve: () => true },
    });
    const client = await connect(server);
    const res = (await client.callTool({
      name: "create_payment",
      arguments: { transaction_amount: 100 },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    // Approved -> reaches execute (then fails on the fake token), NOT gated.
    expect(res.content[0]!.text).not.toContain("art. 102");
    await client.close();
  });

  it("AR_AGENTS_MCP_HALT=1 suspends every tool, incl. read", async () => {
    process.env.AR_AGENTS_MCP_HALT = "1";
    const { server } = await createServer();
    const client = await connect(server);
    const res = (await client.callTool({
      name: "validate_cuit",
      arguments: { cuit: "20-12345678-6" },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("society_suspended");
    await client.close();
  });

  it("boot summary prints the governance mode to the operator", async () => {
    const { summary } = await createServer();
    expect(summary.join("\n")).toMatch(/governance.*enforce=ON/);
  });
});
