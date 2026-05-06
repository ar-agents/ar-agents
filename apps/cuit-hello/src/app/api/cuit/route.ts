import { NextRequest, NextResponse } from "next/server";
import { describePersonType, parseCuit } from "@ar-agents/identity";
import { bodySizeGuard, rateLimit, withApiHeaders } from "@/lib/security";

export const runtime = "nodejs";

/**
 * Pure-algorithm CUIT validation endpoint. No LLM, no AFIP API call. Cheap,
 * deterministic, fast — designed for form-validation use cases that don't
 * need an agent in the loop.
 *
 * GET /api/cuit?value=20-41758101-5
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return withApiHeaders(limited);

  const value = new URL(req.url).searchParams.get("value");
  if (!value) {
    return withApiHeaders(
      NextResponse.json(
        { error: "Missing required query param: value" },
        { status: 400 },
      ),
    );
  }
  const result = parseCuit(value);
  return withApiHeaders(
    NextResponse.json({
      ...result,
      personTypeDescription: describePersonType(result.personType),
    }),
  );
}

/**
 * POST /api/cuit
 * Body: { value: string } | { values: string[] } for batch validation.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return withApiHeaders(limited);

  const oversized = bodySizeGuard(req);
  if (oversized) return withApiHeaders(oversized);

  let body: { value?: string; values?: string[] };
  try {
    body = await req.json();
  } catch {
    return withApiHeaders(
      NextResponse.json(
        { error: "Body must be valid JSON" },
        { status: 400 },
      ),
    );
  }

  if (body.values && Array.isArray(body.values)) {
    // Cap batch size — guards against DoS via huge batch arrays
    if (body.values.length > 100) {
      return withApiHeaders(
        NextResponse.json(
          { error: "Batch size limited to 100 values" },
          { status: 413 },
        ),
      );
    }
    return withApiHeaders(
      NextResponse.json({
        results: body.values.map((v) => ({
          input: v,
          ...parseCuit(v),
          personTypeDescription: describePersonType(parseCuit(v).personType),
        })),
      }),
    );
  }

  if (typeof body.value !== "string") {
    return withApiHeaders(
      NextResponse.json(
        { error: "Body must be { value: string } or { values: string[] }" },
        { status: 400 },
      ),
    );
  }

  const result = parseCuit(body.value);
  return withApiHeaders(
    NextResponse.json({
      ...result,
      personTypeDescription: describePersonType(result.personType),
    }),
  );
}
