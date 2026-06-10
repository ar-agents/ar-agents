import { jsonCors, preflight } from "@/lib/cors";
import { z } from "zod";
import { kv } from "@vercel/kv";
import {
  appendAudit,
  backend as auditBackend,
  isSessionIdValid,
  pinSession,
} from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/**
 * POST /api/auditor/activate — close the El Auditor money loop.
 *
 * /api/auditor/subscribe creates a Mercado Pago preapproval and hands the
 * payer an init_point. Until this endpoint existed, an authorized payment
 * provisioned NOTHING — MP would charge monthly and ar-agents never knew.
 * Activation turns an authorized preapproval into a working product:
 *
 *   1. Verifies the preapproval against MP's API (status must be "authorized").
 *   2. Issues an API key (idempotent — re-activating returns the same key,
 *      possession of the preapproval_id is the bearer proof MP gave the payer).
 *   3. Pins the customer's audit session as durable (no 7-day TTL — a paid
 *      proof-of-autonomy log that evaporates is not a product).
 *   4. The key authenticates POST /api/auditor/log for signed durable writes.
 *
 * MP redirects the payer to back_url (/auditor/gracias) with ?preapproval_id=,
 * and that page calls this endpoint — but an agent can also call it directly:
 * the whole loop (subscribe → authorize → activate → log) is machine-operable.
 */

export const runtime = "edge";

const SITE = "https://ar-agents.ar";
const MP_PREAPPROVAL_URL = "https://api.mercadopago.com/preapproval";

const SUB_KEY_PREFIX = "auditor:sub:"; // preapprovalId → issued key record
const KEY_KEY_PREFIX = "auditor:key:"; // apiKey → entitlement record

const Body = z.object({
  preapprovalId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

interface Entitlement {
  preapprovalId: string;
  payerEmail: string | null;
  plan: string | null;
  sessionId: string;
  createdAt: string;
  status: "active";
}

function newApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `arag_live_${hex}`;
}

function maskKey(k: string): string {
  return `${k.slice(0, 10)}…${k.slice(-4)}`;
}

function auditUrls(sessionId: string) {
  return {
    sessionId,
    url: `${SITE}/api/play/audit/${sessionId}`,
    verifyUrl: `${SITE}/api/play/audit/${sessionId}?verify=1`,
    dashboardUrl: `${SITE}/dashboard/${sessionId}`,
  };
}

function logUsage(apiKeyHint: string) {
  return {
    endpoint: `${SITE}/api/auditor/log`,
    method: "POST",
    headers: { "x-api-key": apiKeyHint, "Content-Type": "application/json" },
    body: {
      tool: "nombre_de_la_accion",
      governance: "audit-logged | requires-confirmation | algorithm-only | mocked-upstream",
      input: "objeto JSON con lo que decidió tu agente",
      output: "opcional, el resultado",
    },
    note: "Cada entrada queda firmada HMAC-SHA256 + Ed25519, durable (sin TTL), públicamente verificable.",
  };
}

export async function POST(req: Request) {
  if (!rateLimit("auditor-activate", clientIp(req), 10, 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonCors({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return jsonCors(
      { ok: false, error: "invalid_input", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const { preapprovalId } = parsed.data;

  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!mpToken) {
    return jsonCors(
      { ok: false, error: "not_configured", note: "MP no está configurado en este deploy." },
      { status: 503 },
    );
  }

  // Idempotent re-activation: same preapproval → same key. Validate the stored
  // shape (a poisoned/legacy value must not slip through and re-issue a key).
  const existing = await kv.get<{ apiKey?: unknown; sessionId?: unknown }>(
    `${SUB_KEY_PREFIX}${preapprovalId}`,
  );
  if (
    existing &&
    typeof existing.apiKey === "string" &&
    typeof existing.sessionId === "string"
  ) {
    return jsonCors({
      ok: true,
      alreadyActive: true,
      apiKey: existing.apiKey,
      audit: { backend: auditBackend(), ...auditUrls(existing.sessionId) },
      log: logUsage(existing.apiKey),
    });
  }

  // Verify the preapproval with MP — the payer must have authorized it.
  let mp: {
    id?: string;
    status?: string;
    payer_email?: string;
    external_reference?: string;
    reason?: string;
  };
  try {
    const res = await fetch(`${MP_PREAPPROVAL_URL}/${preapprovalId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return jsonCors(
        {
          ok: false,
          error: "mp_error",
          status: res.status,
          message: (json?.message as string) || `mp_http_${res.status}`,
        },
        { status: 502 },
      );
    }
    mp = json as typeof mp;
  } catch (e) {
    return jsonCors(
      { ok: false, error: "mp_network_error", message: e instanceof Error ? e.message : "" },
      { status: 502 },
    );
  }

  if (mp.status !== "authorized") {
    return jsonCors(
      {
        ok: false,
        error: "not_authorized_yet",
        mpStatus: mp.status ?? "unknown",
        note:
          "La suscripción todavía no está autorizada. Abrí el init_point del checkout, autorizá con tarjeta y reintentá.",
      },
      { status: 409 },
    );
  }

  // Issue the entitlement. The audit session is the one the subscribe call
  // provisioned (external_reference), kept if valid; else a fresh one.
  const sessionId =
    mp.external_reference && isSessionIdValid(mp.external_reference)
      ? mp.external_reference
      : crypto.randomUUID();
  const apiKey = newApiKey();

  // Atomic idempotency claim: only the FIRST concurrent activation sets the
  // mapping (nx). The /auditor/gracias page auto-fires on load and agents
  // retry on timeout, so concurrent calls for one preapproval are routine —
  // without this, each would mint a distinct valid key for one paid sub.
  const claimed = await kv.set(
    `${SUB_KEY_PREFIX}${preapprovalId}`,
    { apiKey, sessionId },
    { nx: true },
  );

  let effectiveKey = apiKey;
  let effectiveSession = sessionId;
  if (!claimed) {
    // Lost the race (or a prior activation already claimed). Adopt the winner's
    // key + session so we return the ONE key that exists, never a second.
    const winner = await kv.get<{ apiKey?: unknown; sessionId?: unknown }>(
      `${SUB_KEY_PREFIX}${preapprovalId}`,
    );
    if (winner && typeof winner.apiKey === "string" && typeof winner.sessionId === "string") {
      effectiveKey = winner.apiKey;
      effectiveSession = winner.sessionId;
    }
    // else (pathological: claim failed yet nothing readable) → keep our own
    // values and write them below; a working key beats a stuck request.
  }

  // Ensure the entitlement exists for the effective key. Creates it on a fresh
  // activation; REPAIRS it if a prior activation crashed after claiming the
  // mapping but before writing the entitlement (which would otherwise leave a
  // dead key). Idempotent — concurrent losers write identical content.
  const entitlement: Entitlement = {
    preapprovalId,
    payerEmail: mp.payer_email ?? null,
    plan: mp.reason ?? null,
    sessionId: effectiveSession,
    createdAt: new Date().toISOString(),
    status: "active",
  };
  await kv.set(`${KEY_KEY_PREFIX}${effectiveKey}`, entitlement);
  await pinSession(effectiveSession);

  // Forensic record of the activation itself — masked key, never the secret.
  const entry = await appendAudit(
    effectiveSession,
    {
      tool: "auditor_activate",
      governance: "audit-logged",
      input: { preapprovalId },
      output: { plan: entitlement.plan, apiKey: maskKey(effectiveKey), durable: true },
    },
    { durable: true },
  );

  return jsonCors({
    ok: true,
    alreadyActive: !claimed,
    apiKey: effectiveKey,
    note: "Guardá esta key. Autentica POST /api/auditor/log (header x-api-key).",
    subscription: { preapprovalId, plan: entitlement.plan, status: "active" },
    audit: { backend: auditBackend(), entry, ...auditUrls(effectiveSession) },
    log: logUsage(effectiveKey),
  });
}

// Machine-readable self-description (agents.md ergonomics).
export async function GET() {
  return jsonCors(
    {
      endpoint: "/api/auditor/activate",
      method: "POST",
      purpose:
        "Canjear una suscripción autorizada de Mercado Pago por una API key de El Auditor. Idempotente.",
      request: { preapprovalId: "string — el preapproval_id que MP devuelve tras autorizar" },
      flow: [
        "1. POST /api/auditor/subscribe → checkout.initPoint",
        "2. El pagador autoriza en MP → redirect a /auditor/gracias?preapproval_id=...",
        "3. POST /api/auditor/activate { preapprovalId } → { apiKey }",
        "4. POST /api/auditor/log con header x-api-key → entradas firmadas durables",
      ],
      errors: {
        "409 not_authorized_yet": "el checkout no fue autorizado todavía",
        "429 rate_limited": "máx 10/min por IP",
        "502 mp_error": "MP no reconoce el preapprovalId",
      },
    },
    { headers: { Allow: "GET, POST, OPTIONS", "Cache-Control": "public, max-age=300" } },
  );
}

export async function OPTIONS() {
  return preflight();
}
