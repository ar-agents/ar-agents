/**
 * End-to-end test for the Streamable HTTP transport (startHttp): a real MCP
 * client connects over HTTP, completes the handshake, and lists tools. Verifies
 * the remote transport actually works, not just that it compiles.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { Server as HttpServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startHttp } from "../src/server";

let httpServer: HttpServer | undefined;

afterEach(async () => {
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    httpServer = undefined;
  }
});

function portOf(s: HttpServer): number {
  const a = s.address();
  return typeof a === "object" && a ? a.port : 0;
}

describe("MCP Streamable HTTP transport", () => {
  it("serves a health check", async () => {
    httpServer = await startHttp({ port: 0, host: "127.0.0.1" });
    const res = await fetch(`http://127.0.0.1:${portOf(httpServer)}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; transport: string };
    expect(body.ok).toBe(true);
    expect(body.transport).toBe("streamable-http");
  });

  it("completes the MCP handshake and lists tools over HTTP", async () => {
    httpServer = await startHttp({ port: 0, host: "127.0.0.1" });
    const url = new URL(`http://127.0.0.1:${portOf(httpServer)}/mcp`);
    const client = new Client({ name: "ar-agents-http-test", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    // validate_cuit is the algorithm-only tool always registered (no env needed).
    expect(tools.some((t) => t.name === "validate_cuit")).toBe(true);
    await client.close();
  });

  it("rejects a non-initialize POST with no session", async () => {
    httpServer = await startHttp({ port: 0, host: "127.0.0.1" });
    const res = await fetch(`http://127.0.0.1:${portOf(httpServer)}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(400);
  });
});
