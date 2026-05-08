/**
 * `/api/discovery` — machine-readable index of every tool the @ar-agents/*
 * stack exposes. Aggregates the per-package `tools.manifest.json` files into
 * one document for crawlers, agent registries, and compliance auditors.
 *
 * Two output formats:
 *   GET /api/discovery                 → JSON (default — agent-friendly)
 *   GET /api/discovery?format=openapi  → OpenAPI 3.1.0 stub (compliance-friendly)
 *
 * The aggregated document is the source of truth for "what does this stack
 * do." Government compliance reviewers can load it, diff against previous
 * releases, and confirm no surface change happened without a public release.
 */

// Manifests are pre-baked at build time by `scripts/gen-discovery-manifests.mjs`
// so the route doesn't need fs access at runtime — Edge-friendly even though
// we currently run on nodejs (in case we want to flip later for cold-start
// latency).
import { MANIFESTS as RAW_MANIFESTS } from "./manifests.generated";

type Tool = {
  name: string;
  description?: string;
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
const SITE_URL = "https://ar-agents.vercel.app";

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
};

function buildDiscoveryDoc(): DiscoveryDoc {
  const packages = MANIFESTS.map((m) => ({
    name: m.package,
    version: m.version,
    description: m.description,
    repository: `${REPO_URL}/tree/main/packages/${m.package.replace("@ar-agents/", "")}`,
    npm: `https://www.npmjs.com/package/${m.package}`,
    toolCount: m.tools.length,
    tools: m.tools.map((t) => ({ name: t.name, description: t.description })),
  }));
  const totalTools = packages.reduce((acc, p) => acc + p.toolCount, 0);
  return {
    $schema: `${SITE_URL}/schemas/discovery.v1.json`,
    generatedAt: new Date().toISOString().slice(0, 10),
    packages,
    totalTools,
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
          summary: t.description?.slice(0, 100) ?? t.name,
          "x-package": m.package,
          "x-package-version": m.version,
          "x-requires-confirmation": HITL_TOOLS.has(t.name),
          requestBody: {
            content: { "application/json": { schema: t.inputSchema ?? {} } },
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

  return {
    openapi: "3.1.0",
    info: {
      title: "ar-agents — aggregated tool surface",
      version: "1.0.0",
      description:
        "Machine-readable inventory of every tool the @ar-agents/* stack exposes. Generated from per-package tools.manifest.json files.",
      license: { name: "MIT", identifier: "MIT" },
      contact: { name: "Nazareno Clemente", url: "https://github.com/naza00000" },
    },
    servers: [
      { url: SITE_URL, description: "Catalog only — actual tools execute in the host's runtime." },
    ],
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

// Edge-safe — manifests are pre-baked into the bundle at build time.
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
