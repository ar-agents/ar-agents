/**
 * `GET /api/registro`, machine-readable registry of known sociedad-IA
 * implementations. Mirror of /registro (the human-facing page) but
 * structured for consumption by journalists, researchers, comparison
 * dashboards, or any third party building visualizations on top of
 * ar-agents data.
 *
 * Single source of truth for entries currently lives in the React
 * component at /src/app/registro/page.tsx. Sync drift risk is real but
 * acceptable for v1, when the registry grows past ~10 entries, both
 * surfaces should read from a shared JSON.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

interface RegistryEntry {
  name: string;
  type:
    | "reference-implementation"
    | "demo"
    | "productive-sociedad-ia"
    | "library-only";
  jurisdiction: string;
  operator: string;
  operatorCuit?: string;
  publicUrl: string;
  rfcConformance: string[];
  disclosure: string;
  status: "live" | "draft" | "deprecated";
  listedSince: string;
}

const REGISTRY: ReadonlyArray<RegistryEntry> = [
  {
    name: "ar-agents (this site, reference implementation)",
    type: "reference-implementation",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://ar-agents.ar",
    rfcConformance: [
      "rfc-001-v1",
      "rfc-002-v1",
      "rfc-003-draft",
      "rfc-004-draft",
      "rfc-005-draft",
    ],
    disclosure:
      "Reference implementation of the spec. Hosts /play (interactive demo), /verify (HMAC verification), /api/play/audit/* (audit endpoints), /test-vectors (conformance vectors). Not a productive sociedad, i.e. does not transact with real customers, does not emit facturas, does not cobrar. Source of truth for the spec.",
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "mp-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://mp-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure:
      "Mercado Pago Subscriptions integration demo. Wired to a real MP sandbox + production app 178743372667921. Shows the @ar-agents/mercadopago lib end-to-end. Not a productive sociedad.",
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "cuit-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://cuit-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure:
      "AFIP/ARCA padron lookup + CUIT validation demo. Uses a real AFIP cert (homo for safety; prod cert available). Shows the @ar-agents/identity lib end-to-end. Not a productive sociedad.",
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "whatsapp-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://whatsapp-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure:
      "WhatsApp Business Cloud API demo combining identity + MP + WhatsApp libs. Webhook handler + chat UI. Limited by Meta verification 5-recipient dev cap until business verification passes.",
    status: "live",
    listedSince: "2026-05-05",
  },
  {
    name: "bridge-hello demo",
    type: "demo",
    jurisdiction: "AR",
    operator: "Nazareno Clemente",
    publicUrl: "https://bridge-hello.ar-agents.ar",
    rfcConformance: ["rfc-001-v1"],
    disclosure:
      "Agentic Commerce Bridge demo. AP2 + ACP + MCP protocol surfaces wired to MP. Shows how a foreign agent (Wyoming DAO LLC) interacts with an AR sociedad-IA per cookbook recipe 21.",
    status: "live",
    listedSince: "2026-05-05",
  },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filterStatus = url.searchParams.get("status");
  const filterType = url.searchParams.get("type");
  const filterJurisdiction = url.searchParams.get("jurisdiction");
  const filterOperatorCuit = url.searchParams.get("operatorCuit");

  let entries = REGISTRY.slice();
  if (filterStatus) entries = entries.filter((e) => e.status === filterStatus);
  if (filterType) entries = entries.filter((e) => e.type === filterType);
  if (filterJurisdiction)
    entries = entries.filter(
      (e) => e.jurisdiction.toUpperCase() === filterJurisdiction.toUpperCase(),
    );
  if (filterOperatorCuit)
    entries = entries.filter((e) => e.operatorCuit === filterOperatorCuit);

  const counts = REGISTRY.reduce(
    (acc, e) => {
      if (e.status === "live") {
        acc.live += 1;
        acc.byType[e.type] = (acc.byType[e.type] ?? 0) + 1;
        if (e.operatorCuit) acc.uniqueOperators.add(e.operatorCuit);
      }
      return acc;
    },
    {
      live: 0,
      byType: {} as Record<string, number>,
      uniqueOperators: new Set<string>(),
    },
  );

  return NextResponse.json(
    {
      $schema: "https://ar-agents.ar/schemas/registry.v1.json",
      generated: new Date().toISOString(),
      summary: {
        total: REGISTRY.length,
        live: counts.live,
        byType: counts.byType,
        uniqueOperators: counts.uniqueOperators.size,
      },
      filters: {
        status: filterStatus,
        type: filterType,
        jurisdiction: filterJurisdiction,
        operatorCuit: filterOperatorCuit,
      },
      disclosure:
        "Today (2026-05-13) all live entries are operated by the same CUIT (Nazareno Clemente). This is NOT a multi-operator ecosystem, it is the reference implementation + 4 demos by the author. Zero (0) productive sociedades-IA exist because the legal regime has not been enacted yet.",
      entries,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, OPTIONS",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
