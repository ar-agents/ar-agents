/**
 * `/api/discovery`, machine-readable index of every tool the @ar-agents/*
 * stack exposes. Aggregates the per-package `tools.manifest.json` files into
 * one document for crawlers, agent registries, and compliance auditors.
 *
 * Two output formats:
 *   GET /api/discovery                 → JSON (default, agent-friendly)
 *   GET /api/discovery?format=openapi  → OpenAPI 3.1.0 stub (compliance-friendly)
 *
 * The aggregated document is the source of truth for "what does this stack
 * do." Government compliance reviewers can load it, diff against previous
 * releases, and confirm no surface change happened without a public release.
 */

// Manifests are pre-baked at build time by `scripts/gen-discovery-manifests.mjs`
// so the route doesn't need fs access at runtime, Edge-friendly even though
// we currently run on nodejs (in case we want to flip later for cold-start
// latency).
import { MANIFESTS as RAW_MANIFESTS } from "./manifests.generated";

type Tool = {
  name: string;
  description?: string;
  // The generated manifests use `input`; keep `inputSchema` as a fallback for
  // any hand-written manifest. Reading only `inputSchema` (the old code) made
  // every OpenAPI requestBody schema come out empty.
  input?: unknown;
  inputSchema?: unknown;
};

type Manifest = {
  $schema?: string;
  package: string;
  version: string;
  description?: string;
  tools: Tool[];
};

const MANIFESTS: Manifest[] = RAW_MANIFESTS as unknown as Manifest[];

const REPO_URL = "https://github.com/ar-agents/ar-agents";
const SITE_URL = "https://ar-agents.ar";

// ─────────────────────────────────────────────────────────────────────────────
// JSON aggregator (default)
// ─────────────────────────────────────────────────────────────────────────────

type DiscoveryDoc = {
  $schema: string;
  generatedAt: string;
  packages: Array<{
    name: string;
    version: string;
    description?: string;
    repository: string;
    npm: string;
    toolCount: number;
    tools: Array<{ name: string; description?: string }>;
  }>;
  totalTools: number;
  /**
   * Hosted endpoints an autonomous agent can invoke directly without
   * pulling any package, useful for cross-jurisdiction agent commerce
   * (a USA-LLC agent self-incorporating an AR sociedad-IA).
   */
  endpoints: Array<{
    name: string;
    url: string;
    method: "GET" | "POST";
    description: string;
    schema?: string;
  }>;
  commercial: {
    model: string;
    pricing: string;
    products: Array<{
      name: string;
      description: string;
      priceUsdMonthly: number;
      subscribe: string;
      agentPurchasable: boolean;
      flow: string[];
    }>;
    caseStudy: string;
  };
};

// Strip em dashes from served descriptions (the published npm package source
// still has them; we never ship one in the site's own served JSON).
const noDash = (s?: string) => s?.replace(/\s*—\s*/g, ", ");

function buildDiscoveryDoc(): DiscoveryDoc {
  const packages = MANIFESTS.map((m) => ({
    name: m.package,
    version: m.version,
    description: noDash(m.description),
    repository: `${REPO_URL}/tree/main/packages/${m.package.replace("@ar-agents/", "")}`,
    npm: `https://www.npmjs.com/package/${m.package}`,
    toolCount: m.tools.length,
    tools: m.tools.map((t) => ({ name: t.name, description: noDash(t.description) })),
  }));
  const totalTools = packages.reduce((acc, p) => acc + p.toolCount, 0);
  const endpoints: DiscoveryDoc["endpoints"] = [
    {
      name: "auto_incorporate",
      url: `${SITE_URL}/api/auto-incorporate`,
      method: "POST",
      description:
        "Self-incorporate an Argentine sociedad-IA in a single call. Returns generated package.json + agent.ts + .env.example + README.md, the env-var manifest, the legal+operational checklist, a Vercel one-click deploy URL, and a signed audit-log reference. Suitable for a USA-LLC agent (or any external orchestrator) to call directly.",
      schema: `${SITE_URL}/api/auto-incorporate`,
    },
    {
      name: "play_agent",
      url: `${SITE_URL}/api/play`,
      method: "POST",
      description:
        "Live sociedad-IA agent demo (12 tools, mocked-but-realistic). Edge Runtime + Vercel AI Gateway streaming. Audit-logged to KV under x-play-session header.",
    },
    {
      name: "play_audit",
      url: `${SITE_URL}/api/play/audit/{sessionId}`,
      method: "GET",
      description:
        "Public audit log for a /play session. Each entry is HMAC-SHA256-signed at write time; pass ?verify=1 to ask the server to confirm tamper-free state.",
    },
    {
      name: "play_tamper_demo",
      url: `${SITE_URL}/api/play/tamper-demo`,
      method: "POST",
      description:
        "Read-only tampering demonstration. Returns an original signed entry + a mutated version + verification results for both. Educational, does not modify any real audit log.",
    },
    {
      name: "audit_badge",
      url: `${SITE_URL}/api/badge/{sessionId}`,
      method: "GET",
      description:
        "Returns a 24px SVG verification badge for embeds. Color + label updates live based on the audit log's verification state (verified / tampered / no-hmac / no entries). 60s cache.",
    },
    {
      name: "audit_stream",
      url: `${SITE_URL}/api/play/audit-stream/{sessionId}`,
      method: "GET",
      description:
        "Server-Sent Events live-stream of audit entries for a session. Initial snapshot + delta-emit on a 2s tick + 15s keep-alive ping + 5min uptime cap (clients reconnect via EventSource).",
    },
    {
      name: "audit_csv",
      url: `${SITE_URL}/api/play/audit/{sessionId}/csv`,
      method: "GET",
      description:
        "RFC 4180 CSV export of the session's audit log. UTF-8 BOM for Excel compatibility. Columns: ts, tool, governance, durationMs, errored, hmac, input, output. content-disposition attachment with filename ar-agents-audit-{prefix}-{YYYYMMDD}.csv. 60s cache.",
    },
    {
      name: "auditor_subscribe",
      url: `${SITE_URL}/api/auditor/subscribe`,
      method: "POST",
      description:
        "Subscribe to El Auditor (the paid hosted proof-of-autonomy product, USD 199/mo, settled in ARS via Mercado Pago). Returns a Mercado Pago checkout init_point. GET the same URL for the machine-readable pricing + flow. Legal hook: art. 102.",
      schema: `${SITE_URL}/api/auditor/subscribe`,
    },
    {
      name: "auditor_activate",
      url: `${SITE_URL}/api/auditor/activate`,
      method: "POST",
      description:
        "Exchange an authorized Mercado Pago preapproval_id for an El Auditor API key (idempotent). Step 3 of the autonomous purchase flow.",
      schema: `${SITE_URL}/api/auditor/activate`,
    },
    {
      name: "auditor_log",
      url: `${SITE_URL}/api/auditor/log`,
      method: "POST",
      description:
        "Write a signed (HMAC-SHA256 + Ed25519), durable, publicly-verifiable audit entry to your El Auditor session. Authenticated with x-api-key. The product an agent pays for.",
      schema: `${SITE_URL}/api/auditor/log`,
    },
    {
      name: "auditor_status",
      url: `${SITE_URL}/api/auditor/status`,
      method: "GET",
      description:
        "Check your El Auditor subscription status (active / paused / cancelled) and your audit session URLs. Authenticated with x-api-key.",
    },
  ];
  return {
    $schema: `${SITE_URL}/schemas/discovery.v1.json`,
    generatedAt: new Date().toISOString().slice(0, 10),
    packages,
    totalTools,
    endpoints,
    commercial: {
      model: "open-core: the standard is free, trust is a service",
      pricing: `${SITE_URL}/precios`,
      products: [
        {
          name: "El Auditor",
          description:
            "Hosted proof-of-autonomy (RFC-004/005/006). Durable, signed, publicly-verifiable audit log. Legal hook: art. 102 (non-delegable AI-supervision duty).",
          priceUsdMonthly: 199,
          subscribe: `${SITE_URL}/api/auditor/subscribe`,
          agentPurchasable: true,
          flow: [
            "POST /api/auditor/subscribe -> checkout.initPoint",
            "payer authorizes on Mercado Pago",
            "POST /api/auditor/activate { preapprovalId } -> apiKey",
            "POST /api/auditor/log (x-api-key) -> signed durable entries",
          ],
        },
      ],
      caseStudy: `${SITE_URL}/caso-ar-agents`,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAPI 3.1 stub
// ─────────────────────────────────────────────────────────────────────────────

function buildOpenApiDoc() {
  // Emit one path per tool with a stub `post` operation referencing the
  // package + tool name. Reviewers (and validators) can grep the surface,
  // count operations, and pick out the ones flagged as `x-requires-confirmation`.
  const paths: Record<string, unknown> = {};
  const HITL_TOOLS = new Set([
    "refund_payment",
    "cancel_subscription",
    "pause_subscription",
    "cancel_payment_preference",
    "delete_customer_card",
    "cancel_qr_dynamic",
    "delete_pos",
    "revoke_marketplace_token",
  ]);

  for (const m of MANIFESTS) {
    for (const t of m.tools) {
      const path = `/${m.package.replace("@", "").replace("/", "-")}/${t.name}`;
      paths[path] = {
        post: {
          operationId: `${m.package.replace("@ar-agents/", "")}_${t.name}`,
          tags: [m.package],
          summary: noDash(t.description)?.slice(0, 100) ?? t.name,
          "x-package": m.package,
          "x-package-version": m.version,
          "x-requires-confirmation": HITL_TOOLS.has(t.name),
          requestBody: {
            content: { "application/json": { schema: t.input ?? t.inputSchema ?? {} } },
          },
          responses: {
            "200": {
              description: "Tool result. Shape varies; see package docs.",
              content: { "application/json": { schema: {} } },
            },
          },
        },
      };
    }
  }

  // Extend with the live hosted endpoints, these run on this server, not
  // in the host's runtime. An external agent can call them directly.
  paths["/api/auto-incorporate"] = {
    post: {
      operationId: "auto_incorporate",
      summary:
        "Self-incorporate an Argentine sociedad-IA programmatically. Returns generated source files + Vercel deploy URL + legal checklist + signed audit reference.",
      "x-runtime": "edge",
      "x-rate-limited": true,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["denominacion", "tipo", "capitalSocial", "objeto"],
              properties: {
                denominacion: { type: "string", minLength: 3, maxLength: 200 },
                tipo: { type: "string", enum: ["SAS", "SRL", "SA", "SOCIEDAD-IA"] },
                capitalSocial: { type: "number", exclusiveMinimum: 0 },
                objeto: { type: "string", minLength: 20, maxLength: 2000 },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description:
            "Incorporation kit. JSON includes config files, env vars, deploy URL, checklist, audit reference.",
          content: { "application/json": { schema: {} } },
        },
        "422": {
          description: "Validation findings. JSON has validation.findings[] with codes + messages.",
        },
      },
    },
  };
  paths["/api/play"] = {
    post: {
      operationId: "play_agent",
      summary: "Live sociedad-IA agent (12 tools, mocked) over Vercel AI Gateway streaming.",
      "x-runtime": "edge",
    },
  };
  paths["/api/play/audit/{sessionId}"] = {
    get: {
      operationId: "play_audit",
      summary: "Read the HMAC-signed audit log for a /play session.",
      parameters: [
        { name: "sessionId", in: "path", required: true, schema: { type: "string" } },
        { name: "verify", in: "query", required: false, schema: { type: "string", enum: ["1"] } },
      ],
    },
  };
  // El Auditor, the paid product. The autonomous-purchase flow MUST be on the
  // OpenAPI surface that ai-plugin.json points agents to, or the recursive
  // agent-buyer thesis is undiscoverable by the book.
  paths["/api/auditor/subscribe"] = {
    get: {
      operationId: "auditor_subscribe_describe",
      summary: "Machine-readable El Auditor pricing + purchase flow.",
      "x-product": "El Auditor",
      "x-price-usd-monthly": 199,
    },
    post: {
      operationId: "auditor_subscribe",
      summary:
        "Subscribe to El Auditor (USD 199/mo, ARS via Mercado Pago). Returns a checkout init_point. Legal hook: art. 102.",
      "x-runtime": "edge",
      "x-rate-limited": true,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["payerEmail"],
              properties: {
                payerEmail: { type: "string", format: "email" },
                plan: { type: "string", enum: ["mensual", "anual"], default: "mensual" },
                sessionId: { type: "string" },
                entityCuit: { type: "string", maxLength: 13 },
              },
            },
          },
        },
      },
    },
  };
  paths["/api/auditor/activate"] = {
    post: {
      operationId: "auditor_activate",
      summary: "Exchange an authorized Mercado Pago preapproval_id for an El Auditor API key (idempotent).",
      "x-runtime": "edge",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["preapprovalId"],
              properties: { preapprovalId: { type: "string" } },
            },
          },
        },
      },
    },
  };
  paths["/api/auditor/log"] = {
    post: {
      operationId: "auditor_log",
      summary:
        "Write a signed (HMAC + Ed25519), durable, publicly-verifiable audit entry. Auth: x-api-key. The product agents pay for.",
      "x-runtime": "edge",
      "x-auth": "x-api-key",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["tool", "input"],
              properties: {
                tool: { type: "string", maxLength: 80 },
                governance: {
                  type: "string",
                  enum: ["algorithm-only", "audit-logged", "mocked-upstream", "requires-confirmation"],
                },
                input: {},
                output: {},
              },
            },
          },
        },
      },
    },
  };
  paths["/api/auditor/status"] = {
    get: {
      operationId: "auditor_status",
      summary: "Check your El Auditor subscription status. Auth: x-api-key.",
      "x-auth": "x-api-key",
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "ar-agents, aggregated tool + endpoint surface",
      version: "1.0.0",
      description:
        "Machine-readable inventory of every tool the @ar-agents/* stack exposes, plus the hosted endpoints (auto-incorporate, play, audit) that run on this server.",
      license: { name: "MIT", identifier: "MIT" },
      contact: { name: "Naza", url: "https://github.com/naza00000" },
    },
    servers: [{ url: SITE_URL, description: "Hosted ar-agents.ar" }],
    "x-toolkit": {
      repository: REPO_URL,
      packages: MANIFESTS.map((m) => ({ name: m.package, version: m.version })),
    },
    paths,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

// Edge-safe, manifests are pre-baked into the bundle at build time.
export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format");

  if (format === "openapi") {
    return Response.json(buildOpenApiDoc(), {
      headers: {
        "cache-control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400",
      },
    });
  }

  return Response.json(buildDiscoveryDoc(), {
    headers: {
      "cache-control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400",
    },
  });
}
