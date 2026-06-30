import { kv } from "@vercel/kv";
import { jsonCors, preflight } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getUsage } from "@/lib/metering";

/**
 * GET /api/auditor/status: let a paying customer (or their agent) check their
 * own subscription without exposing any secret. Authenticated with the same
 * x-api-key as /api/auditor/log. Returns the non-secret entitlement fields and
 * the public audit URLs for the customer's session.
 *
 * A real paid product needs a "is my subscription active?" surface; this is it.
 */

export const runtime = "edge";
const SITE = "https://ar-agents.ar";
const KEY_KEY_PREFIX = "auditor:key:";

interface Entitlement {
  preapprovalId: string;
  payerEmail: string | null;
  plan: string | null;
  sessionId: string;
  createdAt: string;
  status: string;
}

export async function GET(req: Request) {
  const apiKey = req.headers.get("x-api-key")?.trim();
  if (!apiKey || !/^arag_live_[0-9a-f]{48}$/.test(apiKey)) {
    return jsonCors(
      { ok: false, error: "unauthorized", note: "Header x-api-key requerido." },
      { status: 401 },
    );
  }
  if (!rateLimit("auditor-status", clientIp(req), 60, 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const ent = await kv.get<Entitlement>(`${KEY_KEY_PREFIX}${apiKey}`);
  if (!ent) {
    return jsonCors({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  return jsonCors({
    ok: true,
    subscription: {
      status: ent.status, // active | paused | cancelled
      plan: ent.plan,
      preapprovalId: ent.preapprovalId,
      payerEmail: ent.payerEmail,
      since: ent.createdAt,
      active: ent.status === "active",
    },
    usage: await getUsage(apiKey),
    audit: {
      sessionId: ent.sessionId,
      url: `${SITE}/api/play/audit/${ent.sessionId}`,
      verifyUrl: `${SITE}/api/play/audit/${ent.sessionId}?verify=1`,
      dashboardUrl: `${SITE}/dashboard/${ent.sessionId}`,
    },
    manage:
      "Para cancelar o pausar, gestioná la suscripción desde tu cuenta de Mercado Pago; el cambio se sincroniza vía webhook y corta el acceso.",
  });
}

export async function OPTIONS() {
  return preflight();
}
