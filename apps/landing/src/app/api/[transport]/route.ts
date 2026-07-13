// Remote MCP server at /api/mcp (Streamable HTTP), built on Vercel's
// `mcp-handler`. This is the connector surface for ChatGPT Apps SDK and
// Claude Connectors: point either at https://ar-agents.ar/api/mcp and the
// zero-credential subset of the toolkit is live with no install.
//
// Scope (deliberate): ONLY tools that are pure algorithms or hit public,
// unauthenticated, read-only upstreams (BCRA open REST). Nothing here
// mutates state, moves money, or needs a credential. The full 245-tool
// toolkit stays a local install (`@ar-agents/*` via npm) because the
// credentialed tools must run next to the caller's secrets, never ours.
//
// Runtime: Node (mcp-handler requires it; it is not Edge compatible).
// Rate limit: per-IP fixed window via the same in-memory limiter the other
// public POST endpoints use.
// Audit: every tool call is appended to the public audit log (same
// appendAudit pipeline as /api/play) under a per-day session id, so the
// hosted MCP surface has the same forensic story as the playground.
// Failures to audit never fail the tool call.

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { parseCuit } from "@ar-agents/identity";
import {
  parseCbu,
  BcraPublicApiAdapter,
  BcraVarsPublicApiAdapter,
  BCRA_VARIABLE_IDS,
} from "@ar-agents/banking";
import { calculatePerception } from "@ar-agents/iva-percepciones";
import { calculateRetention as calculateIvaRetention } from "@ar-agents/iva-retenciones";
import { calculateRetention as calculateSicoreRetention } from "@ar-agents/sicore";
import { calculateEmployeeMonth } from "@ar-agents/suss";
import { appendAudit, type AuditGovernance } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { jsonCors, preflight } from "@/lib/cors";

export const runtime = "nodejs";
export const maxDuration = 60;

// Absolute origin for same-host fetches (the registry/oracle endpoints run on
// this same deployment). Override with MCP_SITE_ORIGIN in non-prod if needed.
const SITE_ORIGIN = process.env.MCP_SITE_ORIGIN?.trim() || "https://ar-agents.ar";

// ─────────────────────────────────────────────────────────────────────────────
// Audit plumbing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One shared session per UTC day. Bounds the KV list length (7-day TTL on
 * non-durable sessions) while keeping the whole public MCP surface
 * inspectable at /api/play/audit?sessionId=mcp-public-YYYY-MM-DD.
 */
function mcpSessionId(): string {
  return `mcp-public-${new Date().toISOString().slice(0, 10)}`;
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function asResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function asError(message: string): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

/**
 * Run a tool body, append the call to the audit log (best-effort), and
 * normalize thrown validation errors into MCP error results instead of
 * protocol-level failures.
 */
async function audited(
  toolName: string,
  governance: AuditGovernance,
  input: unknown,
  fn: () => unknown | Promise<unknown>,
): Promise<ToolResult> {
  const start = Date.now();
  try {
    const output = await fn();
    try {
      await appendAudit(mcpSessionId(), {
        tool: toolName,
        governance,
        input,
        output,
        durationMs: Date.now() - start,
      });
    } catch {
      // Audit must never fail the tool.
    }
    return asResult(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await appendAudit(mcpSessionId(), {
        tool: toolName,
        governance,
        input,
        output: { error: message },
        errored: true,
        durationMs: Date.now() - start,
      });
    } catch {
      // ditto
    }
    return asError(message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared schema fragments (mirroring the packages' own zod schemas)
// ─────────────────────────────────────────────────────────────────────────────

const cuitSchema = z
  .string()
  .describe("CUIT/CUIL, 11 digits, with or without hyphens (e.g. 30-71659554-9).");
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Date as YYYY-MM-DD.");

// Public BCRA adapters: open REST, no auth, read-only.
const bcraDeudas = new BcraPublicApiAdapter();
const bcraVars = new BcraVarsPublicApiAdapter();

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

const TOOLKIT_INFO = {
  name: "ar-agents",
  description:
    "Open infrastructure and a registry of record for automated companies in Argentina. Typed tools for the Vercel AI SDK covering identity (CUIT/AFIP), payments (Mercado Pago, Uala), banking (CBU/CVU, BCRA), factura electronica, fiscal calculators (IVA, SICORE, SUSS), WhatsApp Business, Mercado Libre, IGJ, Boletin Oficial, GDE/TAD, shipping and more.",
  lifecycle: {
    born: "https://ar-agents.ar/api/auto-incorporate",
    operate: "https://www.npmjs.com/org/ar-agents",
    judged: "https://ar-agents.ar/api/registry/good-standing?url={baseUrl}",
  },
  packagesAndToolsSource: "https://ar-agents.ar/api/discovery",
  hostedMcpScope:
    "This hosted MCP endpoint exposes the zero-credential subset: pure validation algorithms, fiscal calculators, public BCRA lookups, and the public registry/good-standing reads (registry_lookup, get_good_standing). The remaining tools need YOUR credentials (MP token, AFIP cert, Meta token) and run locally via the npm packages.",
  links: {
    homepage: "https://ar-agents.ar",
    discovery: "https://ar-agents.ar/api/discovery",
    llmsTxt: "https://ar-agents.ar/llms.txt",
    npm: "https://www.npmjs.com/org/ar-agents",
    github: "https://github.com/ar-agents/ar-agents",
    mcpPackage: "https://www.npmjs.com/package/@ar-agents/mcp",
    goodStandingOracle: "https://ar-agents.ar/api/registry/good-standing?url={baseUrl}",
    auditLog: "https://ar-agents.ar/dashboard",
  },
  license: "MIT",
  contact: "naza@naza.ar",
} as const;

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "validate_cuit",
      {
        title: "Validate CUIT/CUIL",
        description:
          "Validate an Argentine CUIT/CUIL with the AFIP mod-11 check-digit algorithm. Pure algorithm, no network, no credentials. Returns { valid, normalized, personType, error }. Use for any 11-digit Argentine tax id before hitting a padron or invoicing API.",
        inputSchema: { cuit: cuitSchema },
      },
      async ({ cuit }) =>
        audited("validate_cuit", "algorithm-only", { cuit }, () => parseCuit(cuit)),
    );

    server.registerTool(
      "validate_cbu",
      {
        title: "Validate CBU/CVU",
        description:
          "Validate an Argentine CBU or CVU (22-digit bank/PSP account id) with the BCRA double check-digit algorithm, and identify the bank or fintech behind it. Pure algorithm, no network. Returns { valid, kind: cbu|cvu|unknown, bank, entityCode, error }.",
        inputSchema: {
          cbu: z
            .string()
            .describe("CBU or CVU, 22 digits, separators tolerated."),
        },
      },
      async ({ cbu }) =>
        audited("validate_cbu", "algorithm-only", { cbu }, () => parseCbu(cbu)),
    );

    server.registerTool(
      "iva_percepcion_calculate",
      {
        title: "Calculate IVA perception",
        description:
          "Compute the VAT perception for a sale invoice (percepcion de IVA, RG 2408 and family). Pure tax math over the bundled 2024-Q4 rate tables; amounts in ARS centavos. Returns 0 with waiverReason for exento / consumidor final / below-minimum buyers.",
        inputSchema: {
          regime: z.enum([
            "rg_2408_general",
            "rg_3337_combustibles",
            "rg_2126_servicios",
          ]),
          buyerCondition: z.enum([
            "responsable_inscripto",
            "monotributista",
            "exento",
            "consumidor_final",
            "no_categorizado",
          ]),
          buyerCuit: cuitSchema,
          netCentavos: z.number().int().nonnegative()
            .describe("Invoice net amount in ARS centavos."),
          operationDate: dateSchema,
          buyerHasNonPerceptionCertificate: z.boolean().optional(),
        },
      },
      async (input) =>
        audited("iva_percepcion_calculate", "algorithm-only", input, () =>
          calculatePerception(input),
        ),
    );

    server.registerTool(
      "iva_retencion_calculate",
      {
        title: "Calculate IVA retention",
        description:
          "Compute the VAT retention on a payment to a supplier (retencion de IVA, RG 2854/10). The rate applies to the invoice's IVA component, not the net. Pure tax math; amounts in ARS centavos. Returns 0 with waiverReason for monotributistas, exentos, certificates, or below-minimum.",
        inputSchema: {
          regime: z.enum(["rg_2854_general", "rg_5057_servicios_digitales"]),
          operationType: z.enum([
            "servicios",
            "cosas_muebles",
            "locaciones_inmuebles",
          ]),
          supplierStatus: z.enum([
            "responsable_inscripto",
            "monotributista",
            "exento",
            "no_categorizado",
          ]),
          supplierCuit: cuitSchema,
          paymentDate: dateSchema,
          ivaCentavos: z.number().int().nonnegative()
            .describe("IVA component of the invoice, in ARS centavos."),
          supplierHasNonRetentionCertificate: z.boolean().optional(),
        },
      },
      async (input) =>
        audited("iva_retencion_calculate", "algorithm-only", input, () =>
          calculateIvaRetention(input),
        ),
    );

    server.registerTool(
      "sicore_retencion_calculate",
      {
        title: "Calculate SICORE (Ganancias) retention",
        description:
          "Compute the federal income tax (Ganancias) retention on a payment per RG 830/00, with the monthly accumulator rule. Covers servicios, honorarios (progressive scale), bienes, alquileres. Pure tax math; amounts in ARS centavos.",
        inputSchema: {
          category: z.enum(["servicios", "honorarios", "bienes", "alquileres"]),
          status: z.enum(["inscripto", "no_inscripto", "exento"]),
          supplierCuit: cuitSchema,
          paymentCentavos: z.number().int().nonnegative()
            .describe("Today's payment in ARS centavos."),
          accumulatedMonthCentavos: z.number().int().nonnegative().optional()
            .describe("Prior payments to the same supplier this month, centavos."),
          alreadyRetainedThisMonthCentavos: z.number().int().nonnegative().optional(),
          paymentDate: dateSchema,
        },
      },
      async (input) =>
        audited("sicore_retencion_calculate", "algorithm-only", input, () =>
          calculateSicoreRetention(input),
        ),
    );

    server.registerTool(
      "suss_contribuciones_calculate",
      {
        title: "Calculate SUSS payroll contributions",
        description:
          "Compute one employee's monthly payroll math for Form F.931 (SICOSS): employee aportes (11% + 3% + 3%) and employer contribuciones (jubilacion, INSSJP, AAFF, FNE, obra social, ART). Pure math over the bundled rate tables; amounts in ARS centavos.",
        inputSchema: {
          cuil: cuitSchema,
          period: z.string().regex(/^\d{4}-\d{2}$/).describe("YYYY-MM."),
          remuneracionBrutaCentavos: z.number().int().nonnegative(),
          noRemunerativosCentavos: z.number().int().nonnegative().optional(),
          employerRegime: z
            .enum(["general", "grandes_empleadores", "promocion_empleo"])
            .optional(),
          artRate: z.number().min(0).max(1).optional()
            .describe("ART rate as a fraction (0.05 = 5%). Default 0.05."),
        },
      },
      async (input) =>
        audited("suss_contribuciones_calculate", "algorithm-only", input, () =>
          calculateEmployeeMonth({
            employee: {
              cuil: input.cuil,
              period: input.period,
              remuneracionBrutaCentavos: input.remuneracionBrutaCentavos,
              ...(input.noRemunerativosCentavos !== undefined
                ? { noRemunerativosCentavos: input.noRemunerativosCentavos }
                : {}),
            },
            ...(input.employerRegime !== undefined
              ? { employerRegime: input.employerRegime }
              : {}),
            ...(input.artRate !== undefined ? { artRate: input.artRate } : {}),
          }),
        ),
    );

    server.registerTool(
      "bcra_deudas_lookup",
      {
        title: "BCRA debtor registry lookup",
        description:
          "Look up a CUIT in BCRA's Central de Deudores (public, no-auth REST API): consolidated credit situation 1 (normal) to 6 (irrecuperable) across all Argentine banks, plus bounced cheques. Read-only public registry data, updated monthly. Returns { available, data | error }.",
        inputSchema: { cuit: cuitSchema },
      },
      async ({ cuit }) =>
        audited("bcra_deudas_lookup", "audit-logged", { cuit }, async () => {
          const parsed = parseCuit(cuit);
          if (!parsed.valid) {
            return { available: false, error: parsed.error ?? "CUIT invalido" };
          }
          return bcraDeudas.lookup(parsed.normalized);
        }),
    );

    server.registerTool(
      "bcra_monetary_variable",
      {
        title: "BCRA monetary variables",
        description:
          "Read BCRA's public monetary statistics (no auth): USD oficial mayorista/minorista, reservas, tasa de politica monetaria, BADLAR, CER, UVA, inflacion mensual/interanual. Omit idVariable to list all available variables with their latest value. Well-known ids: 1 reservas, 4 USD minorista, 5 USD mayorista, 6 tasa politica, 7 BADLAR, 27 inflacion mensual, 28 inflacion interanual, 30 CER, 31 UVA.",
        inputSchema: {
          idVariable: z.number().int().positive().optional()
            .describe("BCRA variable id. Omit to list all variables."),
          desde: dateSchema.optional(),
          hasta: dateSchema.optional(),
        },
      },
      async ({ idVariable, desde, hasta }) =>
        audited(
          "bcra_monetary_variable",
          "audit-logged",
          { idVariable, desde, hasta },
          async () => {
            if (idVariable === undefined) {
              return {
                wellKnownIds: BCRA_VARIABLE_IDS,
                variables: await bcraVars.listVariables(),
              };
            }
            return {
              idVariable,
              datapoints: await bcraVars.getVariable(idVariable, {
                ...(desde ? { from: desde } : {}),
                ...(hasta ? { to: hasta } : {}),
              }),
            };
          },
        ),
    );

    server.registerTool(
      "get_toolkit_info",
      {
        title: "About the ar-agents toolkit",
        description:
          "Canonical info about the ar-agents project: typed npm packages and tools for operating in Argentina, what this hosted MCP endpoint exposes vs what requires a local install with your own credentials, plus links (llms.txt, npm, GitHub). Call this to discover the full toolkit beyond the hosted subset.",
        inputSchema: {},
      },
      async () => audited("get_toolkit_info", "algorithm-only", {}, () => TOOLKIT_INFO),
    );

    server.registerTool(
      "get_good_standing",
      {
        title: "Query the good-standing oracle",
        description:
          "Resolve an automated company's good standing BEFORE transacting with it. Pass exactly one of url, id, or cuit. Returns a small, Ed25519-signed, offline-verifiable answer ({ body, sig, publicKey }). The body carries found, goodStanding.state, and a basis caveat; forming/stale entries are returned as explicitly non-attesting (not good standing). The JUDGED leg of the born/operate/judged lifecycle. No credentials, public read.",
        inputSchema: {
          url: z.string().url().optional().describe("The entity's declared base URL."),
          id: z.string().optional().describe("The entity's registry slug id."),
          cuit: cuitSchema.optional().describe("The entity's CUIT."),
        },
      },
      async ({ url, id, cuit }) =>
        audited(
          "get_good_standing",
          "audit-logged",
          { url, id, cuit },
          async () => {
            const q = url
              ? `url=${encodeURIComponent(url)}`
              : id
                ? `id=${encodeURIComponent(id)}`
                : cuit
                  ? `cuit=${encodeURIComponent(cuit)}`
                  : "";
            if (!q) {
              return { error: "provide exactly one of url, id, or cuit" };
            }
            const r = await fetch(`${SITE_ORIGIN}/api/registry/good-standing?${q}`, {
              headers: { accept: "application/json" },
            });
            return r.json();
          },
        ),
    );

    server.registerTool(
      "registry_lookup",
      {
        title: "List registry entries",
        description:
          "List automated companies in the registry, optionally filtered by jurisdiction, type, or status. Public read, no credentials. Use get_good_standing to judge a specific entity before transacting.",
        inputSchema: {
          jurisdiction: z.string().optional().describe("Filter by jurisdiction code, e.g. AR."),
          type: z.string().optional().describe("Filter by company type, e.g. SAS, SRL, SA."),
          status: z.string().optional().describe("Filter by status, e.g. live, draft."),
        },
      },
      async ({ jurisdiction, type, status }) =>
        audited(
          "registry_lookup",
          "audit-logged",
          { jurisdiction, type, status },
          async () => {
            const params = new URLSearchParams();
            if (jurisdiction) params.set("jurisdiction", jurisdiction);
            if (type) params.set("type", type);
            if (status) params.set("status", status);
            const qs = params.toString();
            const r = await fetch(
              `${SITE_ORIGIN}/api/registry${qs ? `?${qs}` : ""}`,
              { headers: { accept: "application/json" } },
            );
            return r.json();
          },
        ),
    );
  },
  {
    serverInfo: { name: "ar-agents", version: "1.0.0" },
    instructions:
      "Zero-credential subset of the ar-agents toolkit (Argentina): CUIT and CBU/CVU validation, IVA/SICORE/SUSS fiscal calculators, public BCRA lookups, plus the registry reads. Use get_good_standing to judge an automated company before transacting with it (resolve by url, id, or cuit; forming/stale entries are non-attesting) and registry_lookup to list entries. Call get_toolkit_info to discover the full local toolkit.",
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: false,
    // Legacy HTTP+SSE transport needs Redis for resumability; this
    // deployment serves Streamable HTTP only.
    disableSse: true,
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Rate-limited wrapper
// ─────────────────────────────────────────────────────────────────────────────

const RL_MAX = 60; // requests
const RL_WINDOW_MS = 60_000;

async function handler(req: Request): Promise<Response> {
  if (!rateLimit("mcp", clientIp(req), RL_MAX, RL_WINDOW_MS)) {
    return jsonCors(
      { error: "rate_limited", note: "60 requests per minute per IP. Slow down." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  return mcpHandler(req);
}

export { handler as GET, handler as POST, handler as DELETE };

export function OPTIONS(): Response {
  // Browser-context MCP clients preflight with the session/protocol headers.
  const res = preflight();
  const headers = new Headers(res.headers);
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, mcp-session-id, mcp-protocol-version, Accept",
  );
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  return new Response(null, { status: 204, headers });
}
