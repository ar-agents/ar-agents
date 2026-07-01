import { describe, expect, it } from "vitest";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { adaptToolSetToMcp, combineToolSets } from "../src/adapter";

function makeToolSet(): ToolSet {
  return {
    add: tool({
      description: "Add two numbers",
      inputSchema: z.object({
        a: z.number().describe("First addend"),
        b: z.number().describe("Second addend"),
      }),
      execute: async ({ a, b }) => ({ sum: a + b }),
    }),
    greet: tool({
      description: "Greet someone",
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => ({ message: `Hola ${name}` }),
    }),
  } satisfies ToolSet;
}

describe("adaptToolSetToMcp", () => {
  it("converts Vercel AI SDK tools to MCP tool definitions", () => {
    const adapter = adaptToolSetToMcp(makeToolSet());
    expect(adapter.tools).toHaveLength(2);
    const addTool = adapter.tools.find((t) => t.name === "add")!;
    expect(addTool.description).toBe("Add two numbers");
    expect(addTool.inputSchema).toBeTruthy();
    // Zod schema should have been converted to JSON Schema
    const schema = addTool.inputSchema as { type?: string; properties?: object };
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("a");
    expect(schema.properties).toHaveProperty("b");
  });

  it("dispatches calls to the original execute function", async () => {
    const adapter = adaptToolSetToMcp(makeToolSet());
    const result = await adapter.call("add", { a: 2, b: 3 });
    expect(result).toEqual({ sum: 5 });
  });

  it("throws on unknown tool name", async () => {
    const adapter = adaptToolSetToMcp(makeToolSet());
    await expect(adapter.call("unknown", {})).rejects.toThrow(/not found/i);
  });

  it("REJECTS args that violate the tool's input schema (server-side validation)", async () => {
    const adapter = adaptToolSetToMcp(makeToolSet());
    // `a` should be a number; a hostile/malformed call passes a string.
    await expect(adapter.call("add", { a: "not-a-number", b: 3 })).rejects.toThrow(
      /invalid arguments/i,
    );
    // Missing required field.
    await expect(adapter.call("greet", {})).rejects.toThrow(/invalid arguments/i);
  });

  it("passes SCHEMA-VALID args through to execute (parsed data)", async () => {
    const adapter = adaptToolSetToMcp(makeToolSet());
    expect(await adapter.call("add", { a: 2, b: 3 })).toEqual({ sum: 5 });
  });
});

describe("combineToolSets", () => {
  it("merges multiple tool sets into one adapter", () => {
    const setA = { add: makeToolSet().add } as ToolSet;
    const setB = { greet: makeToolSet().greet } as ToolSet;
    const combined = combineToolSets([setA, setB]);
    expect(combined.tools.map((t) => t.name).sort()).toEqual(["add", "greet"]);
  });

  it("skips nulls (for optional registries when env vars missing)", () => {
    const setA = { add: makeToolSet().add } as ToolSet;
    const combined = combineToolSets([setA, null, null]);
    expect(combined.tools).toHaveLength(1);
    expect(combined.tools[0]!.name).toBe("add");
  });

  it("dispatches calls through to the originating tool set", async () => {
    const setA = { add: makeToolSet().add } as ToolSet;
    const setB = { greet: makeToolSet().greet } as ToolSet;
    const combined = combineToolSets([setA, setB]);
    expect(await combined.call("add", { a: 7, b: 8 })).toEqual({ sum: 15 });
    expect(await combined.call("greet", { name: "Naza" })).toEqual({
      message: "Hola Naza",
    });
  });

  it("throws on tool name collision across sets", () => {
    const setA = { add: makeToolSet().add } as ToolSet;
    const setB = { add: makeToolSet().add } as ToolSet;
    expect(() => combineToolSets([setA, setB])).toThrow(/collision/i);
  });
});

describe("registries (env-var-driven)", () => {
  it("identity always returns a tool set (validate_cuit works without AFIP)", async () => {
    const { buildIdentityTools } = await import("../src/registries/identity");
    const tools = buildIdentityTools();
    expect(tools).toBeTruthy();
    expect(Object.keys(tools)).toContain("validate_cuit");
  });

  it("mercadopago returns null when MP_ACCESS_TOKEN unset", async () => {
    const original = process.env.MP_ACCESS_TOKEN;
    delete process.env.MP_ACCESS_TOKEN;
    try {
      const { buildMercadoPagoTools } = await import("../src/registries/mercadopago");
      expect(buildMercadoPagoTools()).toBeNull();
    } finally {
      if (original !== undefined) process.env.MP_ACCESS_TOKEN = original;
    }
  });

  it("whatsapp returns null when WA_ACCESS_TOKEN unset", async () => {
    const a = process.env.WA_ACCESS_TOKEN;
    const b = process.env.WA_PHONE_NUMBER_ID;
    delete process.env.WA_ACCESS_TOKEN;
    delete process.env.WA_PHONE_NUMBER_ID;
    try {
      const { buildWhatsAppTools } = await import("../src/registries/whatsapp");
      expect(buildWhatsAppTools()).toBeNull();
    } finally {
      if (a !== undefined) process.env.WA_ACCESS_TOKEN = a;
      if (b !== undefined) process.env.WA_PHONE_NUMBER_ID = b;
    }
  });

  it("identity-attest returns null when ATTEST_SIGNING_SECRET unset", async () => {
    const original = process.env.ATTEST_SIGNING_SECRET;
    delete process.env.ATTEST_SIGNING_SECRET;
    try {
      const { buildIdentityAttestTools } = await import("../src/registries/identity-attest");
      expect(buildIdentityAttestTools()).toBeNull();
    } finally {
      if (original !== undefined) process.env.ATTEST_SIGNING_SECRET = original;
    }
  });
});

describe("server creation", () => {
  it("creates a server with at least the validate_cuit tool registered", async () => {
    const { createServer } = await import("../src/server");
    const { server, summary } = await createServer();
    expect(server).toBeTruthy();
    expect(summary.length).toBeGreaterThanOrEqual(4); // header + 4 registries
    expect(summary.join("\n")).toContain("identity");
    expect(summary.join("\n")).toContain("mercadopago");
  });
});
