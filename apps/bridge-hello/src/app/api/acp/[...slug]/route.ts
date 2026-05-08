// Catch-all ACP endpoint. Mounts the bridge under `/api/acp/*`.
//
// Routes handled (matching ACP `2026-04-17`):
//   POST /api/acp/checkout_sessions
//   POST /api/acp/checkout_sessions/{id}
//   GET  /api/acp/checkout_sessions/{id}
//   POST /api/acp/checkout_sessions/{id}/complete
//   POST /api/acp/checkout_sessions/{id}/cancel
//   GET  /api/acp/.well-known/acp.json   (also exposed at /.well-known/acp.json)
//
// The bridge handles version negotiation, idempotency, payload validation,
// and dispatches to the right ACP endpoint.

import { NextRequest } from "next/server";
import { facilitator } from "@/lib/facilitator";

// `nodejs` so all routes share process-global state (the in-memory state
// adapter and the mock MP `payments` Map). In production with
// `VercelKVStateAdapter`, switching to `edge` is fine — KV is the shared store.
export const runtime = "nodejs";

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const rawBody = req.method === "GET" ? "" : await req.text();
  const acpResponse = await facilitator.dispatch({
    method: req.method,
    path: url.pathname,
    headers: Object.fromEntries(req.headers.entries()),
    rawBody,
  });
  return new Response(JSON.stringify(acpResponse.body), {
    status: acpResponse.status,
    headers: acpResponse.headers,
  });
}

export const GET = handle;
export const POST = handle;
