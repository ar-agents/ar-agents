// Exposes /.well-known/acp.json at the canonical RFC 8615 path. The bridge
// catch-all handles `/api/acp/*` only, so we add a thin wrapper here that
// reuses the same facilitator.

import { NextRequest } from "next/server";
import { facilitator } from "@/lib/facilitator";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const acpResponse = await facilitator.discovery({
    method: "GET",
    path: "/.well-known/acp.json",
    headers: Object.fromEntries(req.headers.entries()),
    rawBody: "",
  });
  return new Response(JSON.stringify(acpResponse.body), {
    status: acpResponse.status,
    headers: acpResponse.headers,
  });
}
