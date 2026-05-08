// POST /api/ap2/verify
// Verifies a posted SD-JWT VC presentation against the demo keys, returning
// a structured verification trace suitable for the UI.

import { NextRequest } from "next/server";
import { verifyMandate } from "@/lib/ap2";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { presentation?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, reason: "Body must be JSON: { presentation: \"...\" }" },
      { status: 400 },
    );
  }
  const presentation =
    typeof body?.presentation === "string" ? body.presentation : null;
  if (!presentation) {
    return Response.json(
      { ok: false, reason: "Field `presentation` is required and must be a string." },
      { status: 400 },
    );
  }
  const trace = await verifyMandate(presentation);
  return Response.json(trace);
}
