import type { ToolSet } from "ai";
import { z } from "zod";

/**
 * Convert a Vercel AI SDK ToolSet to MCP-compatible tool definitions.
 *
 * Vercel AI SDK's `tool()` shape:
 *   { description, inputSchema: ZodSchema, execute: (args) => result }
 *
 * MCP's tool shape:
 *   { name, description, inputSchema: JSONSchema }
 *   + a separate handler that takes (name, args) and returns the result
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: object; // JSON Schema
}

export interface McpAdapter {
  /** All MCP tool definitions (for ListTools response). */
  tools: McpTool[];
  /** Handler for CallTool — looks up the original Vercel AI SDK tool and runs execute. */
  call: (name: string, args: unknown) => Promise<unknown>;
}

/**
 * Bridge a Vercel AI SDK ToolSet → MCP tools + dispatcher.
 *
 * Throws on unknown tool name or if execute is missing (safety: every Vercel
 * AI SDK tool ships with `execute` for server-side flows, which is what
 * MCP needs).
 */
export function adaptToolSetToMcp(toolSet: ToolSet): McpAdapter {
  const tools: McpTool[] = [];
  const lookup = new Map<string, (args: unknown) => Promise<unknown>>();

  for (const [name, tool] of Object.entries(toolSet)) {
    if (!tool || typeof tool !== "object") continue;
    const description =
      "description" in tool && typeof tool.description === "string" ? tool.description : "";
    const inputSchema =
      "inputSchema" in tool && tool.inputSchema
        ? (z.toJSONSchema(tool.inputSchema as z.ZodType) as object)
        : { type: "object", properties: {}, additionalProperties: false };

    tools.push({ name, description, inputSchema });

    const exec = "execute" in tool ? (tool.execute as (args: unknown) => Promise<unknown>) : null;
    if (!exec) {
      // Server-side execution required for MCP; skip tools without execute.
      continue;
    }
    lookup.set(name, exec);
  }

  return {
    tools,
    call: async (name, args) => {
      const fn = lookup.get(name);
      if (!fn) {
        throw new Error(`Tool "${name}" not found or has no execute fn (MCP requires server-side tools).`);
      }
      return fn(args);
    },
  };
}

/**
 * Combine multiple Vercel AI SDK ToolSets into a single McpAdapter. Tool
 * name collisions throw at adapter-build time.
 */
export function combineToolSets(toolSets: Array<ToolSet | null>): McpAdapter {
  const tools: McpTool[] = [];
  const lookup = new Map<string, (args: unknown) => Promise<unknown>>();
  const seen = new Set<string>();

  for (const ts of toolSets) {
    if (!ts) continue;
    const adapter = adaptToolSetToMcp(ts);
    for (const tool of adapter.tools) {
      if (seen.has(tool.name)) {
        throw new Error(
          `Tool name collision: "${tool.name}" appears in multiple registered tool sets. Rename one or skip a registry.`,
        );
      }
      seen.add(tool.name);
      tools.push(tool);
      // Bind this specific tool's call through the source adapter
      const sourceAdapter = adapter;
      const toolName = tool.name;
      lookup.set(toolName, (args: unknown) => sourceAdapter.call(toolName, args));
    }
  }

  return {
    tools,
    call: async (name, args) => {
      const fn = lookup.get(name);
      if (!fn) throw new Error(`Tool "${name}" not found in combined set.`);
      return fn(args);
    },
  };
}
