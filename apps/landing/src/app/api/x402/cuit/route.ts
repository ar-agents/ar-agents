// `/api/x402/cuit`, an x402-priced micro-API: CUIT validation for $0.001
// USDC per call, paid over the x402 protocol (HTTP 402 + X-PAYMENT header,
// settled by a facilitator). Demonstrates @ar-agents/x402's seller helpers
// against the simplest possible resource, the same pure mod-11 algorithm
// that's free at /play and on the hosted MCP endpoint. The point is the
// payment rail, not the data.
//
// Flow:
//   no X402_PAYTO_ADDRESS env       -> 503 "x402 not configured yet"
//   request without X-PAYMENT       -> 402 + PaymentRequirements
//   request with X-PAYMENT          -> facilitator /verify, then the work,
//                                      then facilitator /settle, response
//                                      carries X-PAYMENT-RESPONSE
//   bad input on a verified request -> 400 WITHOUT settling (the payment
//                                      authorization is never charged)
//
// GET takes ?cuit=..., POST takes JSON { cuit }. Edge runtime: the x402
// helpers and parseCuit are pure Web API code.

import { parseCuit } from "@ar-agents/identity";
import {
  FacilitatorClient,
  paymentRequiredResponse,
  verifyPayment,
  settleAndRespond,
} from "@ar-agents/x402";
import { CORS_HEADERS, jsonCors, preflight } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { appendAudit } from "@/lib/audit";
import { buildCuitRequirements, readX402Config } from "@/lib/x402";

export const runtime = "edge";

const RL_MAX = 30;
const RL_WINDOW_MS = 60_000;

async function extractCuit(req: Request): Promise<string | null> {
  if (req.method === "GET") {
    return new URL(req.url).searchParams.get("cuit");
  }
  try {
    const body = (await req.json()) as { cuit?: unknown };
    return typeof body.cuit === "string" ? body.cuit : null;
  } catch {
    return null;
  }
}

async function handle(req: Request): Promise<Response> {
  if (!rateLimit("x402-cuit", clientIp(req), RL_MAX, RL_WINDOW_MS)) {
    return jsonCors(
      { error: "rate_limited", note: "30 requests per minute per IP." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const cfg = readX402Config();
  if (!cfg) {
    return jsonCors(
      {
        error: "unavailable",
        note: "x402 not configured yet",
        detail:
          "X402_PAYTO_ADDRESS is not set on this deployment, so the endpoint cannot advertise payment requirements it could settle. The same validation is free at /api/mcp (tool validate_cuit).",
      },
      { status: 503 },
    );
  }

  const reqUrl = new URL(req.url);
  const resource = `${reqUrl.origin}${reqUrl.pathname}`;
  const requirements = buildCuitRequirements(resource, cfg);

  if (!req.headers.get("X-PAYMENT")) {
    return paymentRequiredResponse(requirements, { headers: CORS_HEADERS });
  }

  const facilitator = new FacilitatorClient({ baseUrl: cfg.facilitatorUrl });
  const verified = await verifyPayment(req, requirements, facilitator);
  if (!verified.verified) return verified.response;

  // Input validation AFTER verify but BEFORE settle: a malformed request
  // is rejected without charging the payment authorization.
  const cuit = await extractCuit(req);
  if (!cuit) {
    return jsonCors(
      {
        error: "bad_request",
        note: "Pass ?cuit=XX-XXXXXXXX-X (GET) or JSON { \"cuit\": \"...\" } (POST). The payment was NOT settled.",
      },
      { status: 400 },
    );
  }

  const result = parseCuit(cuit);

  // Same forensic trail as every other hosted surface; never fails the call.
  try {
    await appendAudit(`x402-public-${new Date().toISOString().slice(0, 10)}`, {
      tool: "x402_validate_cuit",
      governance: "algorithm-only",
      input: { cuit },
      output: result,
    });
  } catch {
    // best-effort
  }

  const success = jsonCors({ ok: true, paid: true, result });
  return settleAndRespond(verified.payload, requirements, facilitator, success);
}

export { handle as GET, handle as POST };

export function OPTIONS(): Response {
  const headers = new Headers(preflight().headers);
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, X-PAYMENT, Accept",
  );
  headers.set("Access-Control-Expose-Headers", "X-PAYMENT-RESPONSE");
  return new Response(null, { status: 204, headers });
}
