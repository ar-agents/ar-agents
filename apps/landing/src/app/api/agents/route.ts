/**
 * `GET /api/agents`, the dynamic discovery feed of verified agents.
 *
 * This is the registry the self-serve "verify your agent" flow populates. Where
 * /api/registro is a hand-curated array that grows only by PR, this list grows
 * itself: every agent that proves control of a signed identity doc lands here,
 * in our RFC-002 / registry.v1 shape, ready for a crawler, a counterparty, or a
 * comparison dashboard to consume.
 *
 * Every entry is independently re-verifiable via GET /api/identity/{id} (which
 * returns the full signed doc). The listing asserts ONLY the signature facts;
 * name/operator/jurisdiction are self-declared and labeled as such.
 *
 * CORS-open + cacheable, like /api/registro. Runtime nodejs (KV).
 */

import { NextResponse } from "next/server";
import {
  countAgents,
  listRecentAgents,
  toSummary,
} from "@/lib/agent-registry";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 100, 1),
    500,
  );
  const filterScheme = url.searchParams.get("scheme");

  const records = await listRecentAgents(limit);
  const total = await countAgents();

  let entries = records.map(toSummary);
  if (filterScheme) entries = entries.filter((e) => e.scheme === filterScheme);

  const byScheme = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.scheme] = (acc[r.scheme] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json(
    {
      $schema: "https://ar-agents.ar/schemas/agents-directory.v1.json",
      spec: "https://ar-agents.ar/rfcs/002",
      generated: new Date().toISOString(),
      summary: {
        total,
        listed: entries.length,
        byScheme,
      },
      disclosure:
        "Self-serve directory. Each entry proved control of its own signing key over a published RFC-002 identity doc (verifiable at /api/identity/{id}); ar-agents never holds a key. Names, operators and evidence links are self-declared, not audited. There is no rating. Works in LAW_STATUS 'pre': listing here implies nothing about the Argentine sociedades-de-IA regime, which is still an anteproyecto.",
      verifyMethod:
        "https://github.com/ar-agents/ar-agents/tree/main/packages/identity-attest",
      entries,
    },
    {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    },
  );
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, OPTIONS",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
