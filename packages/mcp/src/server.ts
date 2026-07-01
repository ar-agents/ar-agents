import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { combineToolSets } from "./adapter";
import {
  describeGovernance,
  decideGovernance,
  resolveGovernance,
  type GovernanceOptions,
  type ResolvedGovernance,
} from "./governance";
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
// Source the version from package.json so the boot line + MCP server version
// never drift from the published version (esbuild/tsup tree-shakes the JSON
// import down to just this field — the rest of package.json is not bundled).
import { version as SERVER_VERSION } from "../package.json";

const SERVER_NAME = "ar-agents";

/** Optional inputs to {@link createServer}. Back-compat: every field optional. */
export interface CreateServerOptions {
  /**
   * art. 102 governance gate. Resolution order: this option > env > default-ON.
   * Omit entirely and the server still enforces the gate (default-ON,
   * fail-closed). See {@link GovernanceOptions} and {@link resolveGovernance}.
   */
  governance?: GovernanceOptions;
}

/**
 * Build the @ar-agents/mcp server. Inspects environment variables to decide
 * which package's tools to register. Always registers @ar-agents/identity
 * (algorithm-only `validate_cuit` works without any env vars).
 *
 * The CallTool handler enforces the art. 102 governance gate by default
 * (DEFAULT-ON, fail-closed): a money/fiscal/legal/irreversible/unknown tool is
 * REFUSED unless an approve hook is wired, or `AR_AGENTS_MCP_ENFORCE=off` is set.
 * READ-level tools always pass. The optional `governance` arg is back-compat —
 * existing callers (`createServer()`) are unaffected and stay default-ON.
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<{ server: Server; summary: string[]; governance: ResolvedGovernance }> {
  const governance = resolveGovernance(options.governance);
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
    `  ${describeGovernance(governance)}`,
  ];

  // Description + sideEffects lookups by tool name for risk classification
  // (combineToolSets discarded the AI-SDK Tool objects, but kept name +
  // description + sideEffects on McpTool). sideEffects is threaded into
  // classifyTool so core's layer-3 risk signal is LIVE here — parity with the
  // local enforceRiskPolicy path, closing a latent fail-OPEN.
  const descriptionOf = new Map<string, string>(
    adapter.tools.map((t) => [t.name, t.description]),
  );
  const sideEffectsOf = new Map<string, string>(
    adapter.tools
      .filter((t): t is typeof t & { sideEffects: string } =>
        typeof t.sideEffects === "string",
      )
      .map((t) => [t.name, t.sideEffects]),
  );

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: adapter.tools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const callArgs = args ?? {};

    // art. 102 gate, BY TOOL NAME, BEFORE adapter.call. Kill-switch + risk gate
    // decided centrally in decideGovernance (reuses @ar-agents/core classifier).
    const decision = await decideGovernance(
      governance,
      name,
      descriptionOf.get(name),
      callArgs,
      sideEffectsOf.get(name),
    );
    if (decision.kind !== "allow") {
      return {
        content: [{ type: "text", text: decision.message }],
        isError: true,
      };
    }

    try {
      const result = await adapter.call(name, callArgs);
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

  return { server, summary, governance };
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
