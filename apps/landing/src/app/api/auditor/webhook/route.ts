import { kv } from "@vercel/kv";
import { appendAudit } from "@/lib/audit";
import { jsonCors, preflight } from "@/lib/cors";

/**
 * POST /api/auditor/webhook: Mercado Pago subscription lifecycle sink.
 *
 * Without this, a paid El Auditor subscription was a one-way door: we took the
 * money and issued a key, but if the customer cancelled in MP or their monthly
 * charge failed (MP pauses the preapproval after repeated failures), we never
 * learned, and the key kept working forever. That is silent revenue leak with
 * no churn signal. This endpoint closes the loop.
 *
 * Flow: MP notifies us of a preapproval event → we RE-FETCH the preapproval
 * from MP's API (using our own token, so the status is authoritative and a
 * forged notification can only trigger a harmless re-sync, never a fraudulent
 * grant) → we map MP status to the entitlement status that /api/auditor/log
 * gates on. authorized → active; paused/cancelled → access stops.
 *
 * Signature: when MERCADOPAGO_WEBHOOK_SECRET is set we verify MP's x-signature
 * (HMAC-SHA256 over `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`) as
 * defense in depth. We process regardless, because the status is taken from
 * MP's API, not from the notification body.
 */

export const runtime = "edge";

const MP_PREAPPROVAL_URL = "https://api.mercadopago.com/preapproval";
const SUB_KEY_PREFIX = "auditor:sub:";
const KEY_KEY_PREFIX = "auditor:key:";

// MP preapproval status -> our entitlement status. log/route.ts serves only
// when status === "active".
const STATUS_MAP: Record<string, "active" | "paused" | "cancelled"> = {
  authorized: "active",
  paused: "paused",
  cancelled: "cancelled",
};

const enc = new TextEncoder();

async function signatureValid(req: Request, dataId: string): Promise<boolean> {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // Fail OPEN only when MP isn't live at all. If a prod MP token IS set but the
    // webhook secret is missing, that's a dangerous misconfiguration — fail CLOSED
    // so an unauthenticated caller can't drive entitlement (key) changes. The
    // route still re-fetches authoritative status from MP after this gate.
    return !process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  }
  const sig = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id") ?? "";
  if (!sig) return false;
  const parts = Object.fromEntries(
    sig.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k?.trim(), v?.trim()];
    }),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(manifest));
    const hex = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex === v1;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // MP sometimes sends an empty body with everything in the query string.
  }

  const type = (body.type as string) || (body.topic as string) || url.searchParams.get("type") || url.searchParams.get("topic") || "";
  const data = (body.data as { id?: string }) || {};
  const dataId =
    data.id ||
    (body.id as string) ||
    url.searchParams.get("data.id") ||
    url.searchParams.get("id") ||
    "";

  // We only act on preapproval (subscription) events. Acknowledge everything
  // else with 200 so MP doesn't retry storms.
  const isPreapproval = type.includes("preapproval") || type.includes("subscription");
  if (!isPreapproval || !dataId) {
    return jsonCors({ ok: true, ignored: true, type: type || null });
  }

  if (!(await signatureValid(req, dataId))) {
    return jsonCors({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!mpToken) {
    return jsonCors({ ok: true, ignored: true, reason: "mp_not_configured" });
  }

  // Authoritative status straight from MP.
  let status: string | undefined;
  try {
    const res = await fetch(`${MP_PREAPPROVAL_URL}/${dataId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!res.ok) {
      // 200 so MP stops retrying a notification we can't resolve; we logged nothing.
      return jsonCors({ ok: true, unresolved: true, mpStatus: res.status });
    }
    const pa = (await res.json()) as { status?: string };
    status = pa.status;
  } catch {
    return jsonCors({ ok: false, error: "mp_network_error" }, { status: 502 });
  }

  const mapped = status ? STATUS_MAP[status] : undefined;
  const sub = await kv.get<{ apiKey?: unknown; sessionId?: unknown }>(`${SUB_KEY_PREFIX}${dataId}`);
  if (!sub || typeof sub.apiKey !== "string" || typeof sub.sessionId !== "string") {
    // Event for a preapproval we never activated (still pending, or not ours).
    return jsonCors({ ok: true, noEntitlement: true, mpStatus: status ?? null });
  }

  if (mapped) {
    const ent = await kv.get<Record<string, unknown>>(`${KEY_KEY_PREFIX}${sub.apiKey}`);
    if (ent && ent.status !== mapped) {
      await kv.set(`${KEY_KEY_PREFIX}${sub.apiKey}`, { ...ent, status: mapped });
      // Forensic record of the lifecycle transition on the customer's own log.
      await appendAudit(
        sub.sessionId,
        {
          tool: "auditor_subscription_status",
          governance: "audit-logged",
          input: { preapprovalId: dataId, mpStatus: status },
          output: { entitlementStatus: mapped },
        },
        { durable: true },
      );
    }
  }

  return jsonCors({ ok: true, mpStatus: status ?? null, entitlementStatus: mapped ?? "unchanged" });
}

export async function GET() {
  return jsonCors({
    endpoint: "/api/auditor/webhook",
    method: "POST",
    purpose:
      "Sink de eventos de Mercado Pago para el ciclo de vida de la suscripción de El Auditor (cancelaciones, pausas por pago fallido, autorizaciones). Re-consulta el preapproval en MP y sincroniza el entitlement.",
    note: "Configurá esta URL como notification_url en la app de Mercado Pago. Verifica x-signature si MERCADOPAGO_WEBHOOK_SECRET está seteado.",
  });
}

export async function OPTIONS() {
  return preflight();
}
