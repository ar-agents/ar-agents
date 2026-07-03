// `/api/x402/constancia`, the machine-payable Constancia Oracle: a signed ARCA
// good-standing attestation for a CUIT, paid per-call in USDC over the x402
// protocol (HTTP 402 + X-PAYMENT header, settled by a facilitator).
//
// This is the REAL product (the "El Padrón" agent door), not the toy
// /api/x402/cuit check-digit demo: a counterparty agent asks "is this party in
// good standing?" before transacting, pays a few cents USDC, and gets back an
// Ed25519-signed attestation it can verify offline against
// /.well-known/sociedad-ia/keys.
//
// Honesty (this is what makes it a moat, not a scam):
//   - no X402_PAYTO_ADDRESS env  -> 503 "x402 not configured yet"
//   - request without X-PAYMENT  -> 402 + PaymentRequirements
//   - bad CUIT on a verified req  -> 400 WITHOUT settling (never charged)
//   - verdict not live yet (no ARCA fetcher configured) -> 503 WITHOUT settling
//     (we refuse to charge for a good-standing verdict we cannot actually
//     produce; the endpoint goes live the moment the AFIP cert is wired)
//   - real verdict -> settle, return { goodStanding, attestation }
//
// GET takes ?cuit=..., POST takes JSON { cuit }. Runtime nodejs to match
// /api/constancia/lookup (@ar-agents/constancia + KV transitive deps exceed the
// Edge 1MB budget).

import { parseCuit } from "@ar-agents/identity";
import { normalizeCuit } from "@ar-agents/constancia";
import {
  FacilitatorClient,
  paymentRequiredResponse,
  verifyPayment,
  settleAndRespond,
} from "@ar-agents/x402";
import { CORS_HEADERS, jsonCors, preflight } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { appendAudit } from "@/lib/audit";
import { buildConstanciaRequirements, readX402Config } from "@/lib/x402";
import {
  getConstanciaFetcher,
  isFetcherConfigured,
} from "@/lib/constancia";
import {
  buildConstanciaAttestation,
  type ConstanciaGoodStanding,
} from "@/lib/constancia-attestation";

export const runtime = "nodejs";

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
  if (!rateLimit("x402-constancia", clientIp(req), RL_MAX, RL_WINDOW_MS)) {
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
          "X402_PAYTO_ADDRESS is not set on this deployment, so the endpoint cannot advertise payment requirements it could settle. The free check-digit tier is at /api/constancia/lookup.",
      },
      { status: 503 },
    );
  }

  const reqUrl = new URL(req.url);
  const resource = `${reqUrl.origin}${reqUrl.pathname}`;
  const requirements = buildConstanciaRequirements(resource, cfg);

  if (!req.headers.get("X-PAYMENT")) {
    return paymentRequiredResponse(requirements, { headers: CORS_HEADERS });
  }

  const facilitator = new FacilitatorClient({ baseUrl: cfg.facilitatorUrl });
  const verified = await verifyPayment(req, requirements, facilitator);
  if (!verified.verified) return verified.response;

  // Input validation AFTER verify but BEFORE settle: a malformed request is
  // rejected without charging the payment authorization.
  const rawCuit = await extractCuit(req);
  if (!rawCuit) {
    return jsonCors(
      {
        error: "bad_request",
        note: 'Pass ?cuit=XX-XXXXXXXX-X (GET) or JSON { "cuit": "..." } (POST). The payment was NOT settled.',
      },
      { status: 400 },
    );
  }

  const parsed = parseCuit(rawCuit);
  const bare = normalizeCuit(rawCuit) ?? parsed.normalized;
  if (!parsed.valid) {
    return jsonCors(
      {
        error: "invalid_cuit",
        note: "CUIT fails the mod-11 check digit. The payment was NOT settled.",
        validationError: parsed.error,
      },
      { status: 400 },
    );
  }

  // Fetch the REAL good-standing verdict. If no ARCA fetcher is configured
  // (the pre-cert dormant state), we refuse to settle: charging USDC for a
  // verdict we cannot produce would be the exact dishonesty the moat forbids.
  let attGoodStanding: ConstanciaGoodStanding | null = null;
  try {
    const fetcher = getConstanciaFetcher();
    const constancia = await fetcher.getConstancia(bare);
    if (!constancia.available || !constancia.data) {
      return jsonCors(
        {
          error: "verdict_unavailable",
          note: isFetcherConfigured()
            ? constancia.error ?? "ARCA did not return a verdict for this CUIT. The payment was NOT settled."
            : "The good-standing verdict is not live on this deployment yet (no ARCA fetcher configured). The payment was NOT settled.",
        },
        { status: 503 },
      );
    }
    attGoodStanding = {
      source: constancia.source === "browse-skill" ? "browse-skill" : "padron-soap",
      condicion: constancia.data.condicion,
      ...(constancia.data.denominacion
        ? { denominacion: constancia.data.denominacion }
        : {}),
      ...(constancia.data.estado ? { estado: constancia.data.estado } : {}),
    };
  } catch {
    return jsonCors(
      {
        error: "verdict_error",
        note: "The constancia service did not respond. The payment was NOT settled.",
      },
      { status: 503 },
    );
  }

  // Sign the verdict (the portable, offline-verifiable attestation = the product).
  const attestation = await buildConstanciaAttestation({
    cuit: bare,
    checkDigitValid: true,
    goodStanding: attGoodStanding,
  });

  // Same forensic trail as every other hosted surface; never fails the call.
  try {
    await appendAudit(
      `x402-constancia-${new Date().toISOString().slice(0, 10)}`,
      {
        tool: "x402_constancia_attestation",
        governance: "audit-logged",
        input: { cuit: bare },
        output: { condicion: attGoodStanding.condicion, source: attGoodStanding.source },
      },
      { durable: true },
    );
  } catch {
    // best-effort
  }

  const success = jsonCors({
    ok: true,
    paid: true,
    verdictAvailable: true,
    goodStanding: attGoodStanding,
    attestation,
  });
  return settleAndRespond(verified.payload, requirements, facilitator, success);
}

export { handle as GET, handle as POST };

export function OPTIONS(): Response {
  const headers = new Headers(preflight().headers);
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT, Accept");
  headers.set("Access-Control-Expose-Headers", "X-PAYMENT-RESPONSE");
  return new Response(null, { status: 204, headers });
}
