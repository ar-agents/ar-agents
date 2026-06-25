import { jsonCors, preflight } from "@/lib/cors";
import { z } from "zod";
import { kv } from "@vercel/kv";
import { appendAudit, backend as auditBackend, isSessionIdValid } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import {
  mintCapabilityToken,
  verifyCapabilityToken,
} from "@/lib/capability-token";
import {
  AUDITOR_SESSION_KIND,
  AUDITOR_SESSION_PREFIX,
  PENDING_TTL_SECONDS,
  pendingKey,
  type PendingSubscription,
} from "@/lib/auditor-sub";

/**
 * POST /api/auditor/subscribe, sell "El Auditor" (hosted proof-of-autonomy,
 * RFC-004/005/006) by creating a Mercado Pago subscription (preapproval) and
 * provisioning a signed audit session.
 *
 * Dogfood note: this calls Mercado Pago's preapproval REST API directly via
 * fetch (Edge-safe, zero added deps, no lockfile churn). It can later migrate
 * to `@ar-agents/mercadopago`'s `MercadoPagoClient.createPreapproval` once that
 * package is a landing dependency.
 *
 * Pricing: public price is in USD (global signal, inflation-proof); MP settles
 * in ARS (the practical AR rail). The ARS amount is env-configurable
 * (AUDITOR_PRICE_ARS_*) so it can track the USD peg without a redeploy and
 * without the flaky-on-Edge BCRA rate call on the checkout hot path.
 *
 * Gating: with no MERCADOPAGO_ACCESS_TOKEN the endpoint still works, it
 * returns an "early access" response and provisions a real signed audit
 * session (that IS the product), so it deploys safely before MP is wired.
 */

export const runtime = "edge";

const SITE = "https://ar-agents.ar";
const MP_PREAPPROVAL_URL = "https://api.mercadopago.com/preapproval";

const PLANS = {
  mensual: { usd: 199, arsDefault: 249000, frequency: 1, frequencyType: "months", label: "El Auditor Pro, mensual" },
  anual: { usd: 1990, arsDefault: 2490000, frequency: 12, frequencyType: "months", label: "El Auditor Pro, anual" },
} as const;

type PlanId = keyof typeof PLANS;

const Body = z.object({
  payerEmail: z.string().email(),
  plan: z.enum(["mensual", "anual"]).default("mensual"),
  entityCuit: z.string().max(13).optional(),
  // Session continuity is OPT-IN and OWNERSHIP-PROVEN: to bind this
  // subscription to an existing audit session you MUST present that session's
  // capability token (returned once by the first subscribe that created it).
  // Without both, a fresh server-side session is generated — a caller can no
  // longer point a subscription (or its signed entries) at a session it doesn't
  // control (DeepSec cross-tenant-id). `externalReference` was removed; MP's
  // external_reference is now always the server-resolved session.
  sessionId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/)
    .optional(),
  sessionToken: z.string().optional(),
});

function arsAmount(plan: PlanId): number {
  const env =
    plan === "anual"
      ? process.env.AUDITOR_PRICE_ARS_ANUAL
      : process.env.AUDITOR_PRICE_ARS_MENSUAL;
  const fromEnv = Number(env?.trim());
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : PLANS[plan].arsDefault;
}

function auditUrls(sessionId: string) {
  return {
    sessionId,
    url: `${SITE}/api/play/audit/${sessionId}`,
    verifyUrl: `${SITE}/api/play/audit/${sessionId}?verify=1`,
    dashboardUrl: `${SITE}/dashboard/${sessionId}`,
  };
}

export async function POST(req: Request) {
  // Abuse damping: each accepted call creates an MP preapproval + KV writes.
  if (!rateLimit("auditor-subscribe", clientIp(req), 5, 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonCors({ error: "bad_json" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return jsonCors(
      { error: "invalid_input", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const plan = input.plan as PlanId;

  // Resolve the session SERVER-SIDE before any signed write. Continuing an
  // existing session requires proving control of it via its capability token;
  // otherwise a fresh, unguessable session is minted (and its token returned
  // once). This is what stops a caller from binding a subscription — or
  // injecting signed entries — into a session it does not own.
  let sessionId: string;
  let sessionToken: string | null = null;
  if (input.sessionId) {
    if (
      !input.sessionToken ||
      !isSessionIdValid(input.sessionId) ||
      !(await verifyCapabilityToken(
        AUDITOR_SESSION_KIND,
        input.sessionId,
        input.sessionToken,
      ))
    ) {
      return jsonCors(
        {
          ok: false,
          error: "session_token_required",
          note: "Para continuar una sesión existente pasá su sessionToken (el que devolvió el primer subscribe). Omití sessionId para crear una nueva.",
        },
        { status: 403 },
      );
    }
    sessionId = input.sessionId;
  } else {
    sessionId = crypto.randomUUID();
    sessionToken = await mintCapabilityToken(
      AUDITOR_SESSION_KIND,
      AUDITOR_SESSION_PREFIX,
      sessionId,
    );
  }

  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();

  // ── Early-access fallback (no MP token). Still provision a real, signed
  //    audit session, proof-of-autonomy is the product. No charge.
  if (!mpToken) {
    const entry = await appendAudit(sessionId, {
      tool: "auditor_subscribe",
      governance: "audit-logged",
      input: { plan, payerEmail: input.payerEmail, entityCuit: input.entityCuit },
      output: { earlyAccess: true, priceUsd: PLANS[plan].usd },
    });
    return jsonCors(
      {
        ok: true,
        earlyAccess: true,
        message:
          "El Auditor está en early access. Te anotamos y tu sesión de auditoría ya quedó firmada. Te contactamos a la brevedad.",
        plan: { id: plan, priceUsd: PLANS[plan].usd },
        subscription: null,
        checkout: null,
        // Returned ONCE — keep it to continue this session in a later subscribe.
        sessionToken,
        audit: { backend: auditBackend(), entry, ...auditUrls(sessionId) },
      },
      { headers: { "x-play-session": sessionId, "x-audit-backend": auditBackend() } },
    );
  }

  // ── Live path: create the MP preapproval. Landmines honored, back_url must
  //    be HTTPS; payer_email must differ from the seller account; status
  //    "pending" returns an init_point the payer opens to authorize.
  const amount = arsAmount(plan);
  const backUrl = process.env.AUDITOR_BACK_URL?.trim() || `${SITE}/auditor/gracias`;
  // notification_url closes the lifecycle loop: MP calls it on cancel/pause/auth
  // so /api/auditor/webhook can revoke access. Without it, churn is invisible.
  const notificationUrl = process.env.AUDITOR_WEBHOOK_URL?.trim() || `${SITE}/api/auditor/webhook`;
  // Always the server-resolved session — never a caller-chosen reference.
  const externalReference = sessionId;

  let mp: { id?: string; init_point?: string; status?: string };
  try {
    const res = await fetch(MP_PREAPPROVAL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: PLANS[plan].label,
        external_reference: externalReference,
        payer_email: input.payerEmail,
        back_url: backUrl,
        notification_url: notificationUrl,
        status: "pending",
        auto_recurring: {
          frequency: PLANS[plan].frequency,
          frequency_type: PLANS[plan].frequencyType,
          transaction_amount: amount,
          currency_id: "ARS",
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message =
        (json?.message as string) || (json?.error as string) || `mp_http_${res.status}`;
      await appendAudit(sessionId, {
        tool: "auditor_subscribe",
        governance: "requires-confirmation",
        input: { plan, payerEmail: input.payerEmail, amount, currency: "ARS" },
        output: { mpStatus: res.status, mpMessage: message },
        errored: true,
      });
      return jsonCors(
        { ok: false, error: "mp_error", status: res.status, message },
        { status: 502, headers: { "x-play-session": sessionId } },
      );
    }
    mp = {
      id: json.id as string,
      init_point: json.init_point as string,
      status: json.status as string,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "mp_network_error";
    await appendAudit(sessionId, {
      tool: "auditor_subscribe",
      governance: "requires-confirmation",
      input: { plan, payerEmail: input.payerEmail, amount, currency: "ARS" },
      output: { error: message },
      errored: true,
    });
    return jsonCors(
      { ok: false, error: "mp_network_error", message },
      { status: 502, headers: { "x-play-session": sessionId } },
    );
  }

  // Server-authoritative binding: record which session THIS preapproval
  // activates. `activate` reads the session from here (by preapproval id), not
  // from MP's external_reference — closing the cross-tenant session takeover.
  if (mp.id) {
    const pending: PendingSubscription = {
      sessionId,
      payerEmail: input.payerEmail,
      plan,
      createdAt: new Date().toISOString(),
    };
    await kv.set(pendingKey(mp.id), pending, { ex: PENDING_TTL_SECONDS });
  }

  // Forensic entry: the subscription intent itself is logged + signed.
  const entry = await appendAudit(sessionId, {
    tool: "auditor_subscribe",
    governance: "requires-confirmation",
    input: {
      plan,
      payerEmail: input.payerEmail,
      amount,
      currency: "ARS",
      entityCuit: input.entityCuit,
    },
    output: { preapprovalId: mp.id, status: mp.status },
  });

  return jsonCors(
    {
      ok: true,
      subscription: {
        id: mp.id,
        status: mp.status,
        plan,
        amount,
        currency: "ARS",
        priceUsd: PLANS[plan].usd,
        frequency: `${PLANS[plan].frequency} ${PLANS[plan].frequencyType}`,
      },
      checkout: {
        initPoint: mp.init_point,
        note: "El primer pago requiere abrir este link y autorizar con tarjeta + CVV.",
      },
      activation: {
        endpoint: `${SITE}/api/auditor/activate`,
        method: "POST",
        body: { preapprovalId: mp.id },
        note:
          "Una vez autorizado el checkout, este POST devuelve tu API key para POST /api/auditor/log (entradas firmadas durables). MP también te redirige a /auditor/gracias, que lo hace solo.",
      },
      // Returned ONCE — keep it to continue this session in a later subscribe.
      sessionToken,
      audit: { backend: auditBackend(), entry, ...auditUrls(sessionId) },
    },
    { headers: { "x-play-session": sessionId, "x-audit-backend": auditBackend() } },
  );
}

// Machine-readable self-description: an agent can GET this to learn how to
// subscribe El Auditor (agents.md ergonomics).
export async function GET() {
  const mpReady = Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim());
  return jsonCors(
    {
      endpoint: "/api/auditor/subscribe",
      method: "POST",
      product: "El Auditor, hosted proof-of-autonomy (RFC-004/005/006)",
      legalHook:
        "art. 102, el administrador responde por la IA; este registro firmado es la prueba del procedimiento de decisión adecuado (art. 101).",
      pricing: {
        mensual: { usd: PLANS.mensual.usd },
        anual: { usd: PLANS.anual.usd },
        settlement: "ARS via Mercado Pago, pegged to USD",
      },
      request: {
        payerEmail: "string (email, distinto al de la cuenta vendedora)",
        plan: "mensual | anual",
        sessionId: "opcional (continuidad) — requiere sessionToken para probar control",
        sessionToken: "requerido si pasás sessionId; es el token que devolvió el primer subscribe",
        entityCuit: "opcional",
      },
      live: mpReady,
      flow: [
        "1. POST acá → checkout.initPoint de Mercado Pago",
        "2. El pagador autoriza → redirect a /auditor/gracias?preapproval_id=...",
        "3. POST /api/auditor/activate { preapprovalId } → API key",
        "4. POST /api/auditor/log (header x-api-key) → entradas firmadas DURABLES, públicamente verificables",
      ],
      note: mpReady
        ? "Live: devuelve un checkout init_point de Mercado Pago."
        : "Early access: MP sin configurar; devuelve una sesión de auditoría provisionada.",
    },
    { headers: { Allow: "GET, POST, OPTIONS", "Cache-Control": "public, max-age=300" } },
  );
}

export async function OPTIONS() {
  return preflight();
}
