import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { combineToolSets } from "./adapter";
import { buildBankingTools, describeBankingConfig } from "./registries/banking";
import {
  buildBoletinOficialTools,
  describeBoletinOficialConfig,
} from "./registries/boletin-oficial";
import {
  buildFacturacionTools,
  describeFacturacionConfig,
} from "./registries/facturacion";
import {
  buildFirmaDigitalTools,
  describeFirmaDigitalConfig,
} from "./registries/firma-digital";
import {
  buildGdeTadTools,
  describeGdeTadConfig,
} from "./registries/gde-tad";
import { buildIdentityTools, describeIdentityConfig } from "./registries/identity";
import {
  buildIdentityAttestTools,
  describeIdentityAttestConfig,
} from "./registries/identity-attest";
import { buildIgjTools, describeIgjConfig } from "./registries/igj";
import {
  buildMercadoLibreTools,
  describeMercadoLibreConfig,
} from "./registries/mercadolibre";
import {
  buildMercadoPagoTools,
  describeMercadoPagoConfig,
} from "./registries/mercadopago";
import {
  buildMiArgentinaTools,
  describeMiArgentinaConfig,
} from "./registries/mi-argentina";
import { buildShippingTools, describeShippingConfig } from "./registries/shipping";
import { buildWhatsAppTools, describeWhatsAppConfig } from "./registries/whatsapp";

const SERVER_NAME = "ar-agents";
const SERVER_VERSION = "0.10.0";

/**
 * Build the @ar-agents/mcp server. Inspects environment variables to decide
 * which package's tools to register. Always registers @ar-agents/identity
 * (algorithm-only `validate_cuit` works without any env vars).
 */
export async function createServer(): Promise<{ server: Server; summary: string[] }> {
  const adapter = combineToolSets([
    buildIdentityTools(),
    buildMiArgentinaTools(),
    buildMercadoPagoTools(),
    buildMercadoLibreTools(),
    buildWhatsAppTools(),
    buildIdentityAttestTools(),
    buildBankingTools(),
    buildFacturacionTools(),
    buildShippingTools(),
    buildBoletinOficialTools(),
    buildIgjTools(),
    buildFirmaDigitalTools(),
    buildGdeTadTools(),
  ]);

  const summary = [
    `${SERVER_NAME}@${SERVER_VERSION} starting with ${adapter.tools.length} tools registered:`,
    `  identity        → ${describeIdentityConfig()}`,
    `  mi-argentina    → ${describeMiArgentinaConfig()}`,
    `  mercadopago     → ${describeMercadoPagoConfig()}`,
    `  mercadolibre    → ${describeMercadoLibreConfig()}`,
    `  whatsapp        → ${describeWhatsAppConfig()}`,
    `  identity-attest → ${describeIdentityAttestConfig()}`,
    `  banking         → ${describeBankingConfig()}`,
    `  facturacion     → ${describeFacturacionConfig()}`,
    `  shipping        → ${describeShippingConfig()}`,
    `  boletin-oficial → ${describeBoletinOficialConfig()}`,
    `  igj             → ${describeIgjConfig()}`,
    `  firma-digital   → ${describeFirmaDigitalConfig()}`,
    `  gde-tad         → ${describeGdeTadConfig()}`,
  ];

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: adapter.tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await adapter.call(name, args ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error calling ${name}: ${msg}` }],
        isError: true,
      };
    }
  });

  return { server, summary };
}

/**
 * Start the MCP server over stdio. Called by the CLI binary.
 * Logs the registered-tools summary to stderr (stdout is reserved for MCP
 * protocol messages).
 */
export async function startStdio(): Promise<void> {
  const { server, summary } = await createServer();
  for (const line of summary) console.error(line);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ar-agents MCP server connected via stdio");
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      try {
        resolve(raw.length > 0 ? JSON.parse(raw) : undefined);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    req.on("error", reject);
  });
}

export interface HttpOptions {
  port?: number;
  host?: string;
  path?: string;
}

/**
 * Start the MCP server over Streamable HTTP, with stateful sessions keyed by the
 * `mcp-session-id` header (the canonical standalone pattern: an initialize
 * request opens a session, later requests route to the same transport). Keeps
 * stdio as the default; this is the remotely hostable path that unblocks hosting
 * on Vercel Services and x402-mcp (which rides on MCP-over-HTTP). Sessions are
 * in-memory, so a multi-instance deploy needs a shared session store.
 */
export async function startHttp(options: HttpOptions = {}): Promise<HttpServer> {
  const port = options.port ?? (Number(process.env.AR_MCP_HTTP_PORT) || 3030);
  const host = options.host ?? process.env.AR_MCP_HTTP_HOST ?? "0.0.0.0";
  const mcpPath = options.path ?? process.env.AR_MCP_HTTP_PATH ?? "/mcp";

  const { summary } = await createServer();
  for (const line of summary) console.error(line);

  const transports = new Map<string, StreamableHTTPServerTransport>();

  function jsonError(res: ServerResponse, status: number, message: string): void {
    if (res.headersSent) return;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32600, message }, id: null }));
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = (req.url ?? "/").split("?")[0];

    if (req.method === "GET" && (url === "/health" || url === "/")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ ok: true, server: SERVER_NAME, transport: "streamable-http" }),
      );
      return;
    }
    if (url !== mcpPath) {
      jsonError(res, 404, "Not found");
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const existing = sessionId ? transports.get(sessionId) : undefined;
      if (existing) {
        await existing.handleRequest(req, res, body);
        return;
      }
      // No session yet: only an `initialize` may open one.
      if (sessionId || !isInitializeRequest(body)) {
        jsonError(res, 400, "No valid session. Send an initialize request first.");
        return;
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          transports.set(sid, transport);
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
      };
      const { server } = await createServer();
      // StreamableHTTPServerTransport implements Transport; the cast only bridges
      // exactOptionalPropertyTypes variance on the SDK's optional handler props.
      await server.connect(transport as Transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    // GET (SSE stream) / DELETE (close) require an existing session.
    if (req.method === "GET" || req.method === "DELETE") {
      const transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        jsonError(res, 400, "Unknown or missing mcp-session-id.");
        return;
      }
      await transport.handleRequest(req, res);
      return;
    }

    jsonError(res, 405, "Method not allowed.");
  }

  const httpServer = createHttpServer((req, res) => {
    void handle(req, res).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: msg }, id: null }),
        );
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => resolve());
  });
  console.error(
    `ar-agents MCP server connected via Streamable HTTP on http://${host}:${port}${mcpPath}`,
  );
  return httpServer;
}
