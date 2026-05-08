import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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
import { buildIdentityTools, describeIdentityConfig } from "./registries/identity";
import {
  buildIdentityAttestTools,
  describeIdentityAttestConfig,
} from "./registries/identity-attest";
import { buildIgjTools, describeIgjConfig } from "./registries/igj";
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
const SERVER_VERSION = "0.6.0";

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
    buildWhatsAppTools(),
    buildIdentityAttestTools(),
    buildBankingTools(),
    buildFacturacionTools(),
    buildShippingTools(),
    buildBoletinOficialTools(),
    buildIgjTools(),
    buildFirmaDigitalTools(),
  ]);

  const summary = [
    `${SERVER_NAME}@${SERVER_VERSION} starting with ${adapter.tools.length} tools registered:`,
    `  identity        → ${describeIdentityConfig()}`,
    `  mi-argentina    → ${describeMiArgentinaConfig()}`,
    `  mercadopago     → ${describeMercadoPagoConfig()}`,
    `  whatsapp        → ${describeWhatsAppConfig()}`,
    `  identity-attest → ${describeIdentityAttestConfig()}`,
    `  banking         → ${describeBankingConfig()}`,
    `  facturacion     → ${describeFacturacionConfig()}`,
    `  shipping        → ${describeShippingConfig()}`,
    `  boletin-oficial → ${describeBoletinOficialConfig()}`,
    `  igj             → ${describeIgjConfig()}`,
    `  firma-digital   → ${describeFirmaDigitalConfig()}`,
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
