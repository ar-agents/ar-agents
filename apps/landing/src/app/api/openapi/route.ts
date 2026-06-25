/**
 * GET /api/openapi.json (served at /api/openapi)
 *
 * Machine-readable OpenAPI 3.1 schema for the public /api/play/* surface
 * + /api/discovery + /api/auto-incorporate. Designed for AI agents that
 * introspect this site (Claude, ChatGPT, Perplexity, custom orchestrators)
 * + for tooling generators (openapi-typescript, openapi-fetch, etc.).
 *
 * Edge runtime, static JSON; no I/O. The spec is the shared `openApiSpec`
 * object (also serialized to YAML by /api/openapi.yaml).
 */

import { NextResponse } from "next/server";
import { openApiSpec } from "../../../lib/openapi-spec";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
