/**
 * `POST /api/auto-incorporate`, machine-readable incorporation
 * surface for an external agent.
 *
 * The /incorporar wizard is for humans clicking through a form; this
 * endpoint is the same flow exposed as a single JSON-RPC-style call,
 * so a USA-LLC agent (or any external orchestrator) can self-incorporate
 * an Argentine sociedad-IA programmatically.
 *
 * Pure logic (validation, generation) lives in src/lib/incorporate.ts
 * and is unit-tested. This route is just HTTP plumbing + audit log.
 */

import { kv } from "@vercel/kv";
import { jsonCors, preflight } from "@/lib/cors";
import { type ApproverAttestation, backend as auditBackend } from "@/lib/audit";
import { Body, PIEZA_IDS, REQUIRED_PIEZAS } from "@/lib/incorporate";
import { runIncorporation } from "@/lib/incorporate-run";
import { clientIp, rateLimit, kvRateLimit } from "@/lib/ratelimit";
import { authorizeIncorporate } from "@/lib/incorporate-auth";

export const runtime = "edge";

export async function POST(req: Request) {
  // Incorporation entries are durable KV writes, damp per-IP amplification.
  const ip = clientIp(req);
  if (!rateLimit("auto-incorporate", ip, 10, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  // Durable, cross-isolate quota: the in-memory limiter above only damps one
  // isolate. This endpoint constitutes legal entities, so it gets a real global
  // per-IP cap (KV-backed, fails open). Defense against a distributed mint flood.
  if (!(await kvRateLimit("auto-incorporate", ip, 10, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  // Authenticate before doing anything else (this is an irreversible write
  // surface). Shared secret via Authorization: Bearer or x-api-key, fail closed.
  const auth = await authorizeIncorporate(req);
  if (!auth.ok) {
    return jsonCors({ ok: false, error: auth.error }, { status: auth.status });
  }

  // Idempotency: an agent (or eve's durable-workflow replay across a cold start
  // or redeploy) may POST the same body twice. The incorporate-agent tool sends
  // an Idempotency-Key (sha256 of the body). If we've seen it, return the prior
  // result and do NOT constitute or write the audit log again.
  const idempoKey = req.headers.get("idempotency-key")?.trim();
  const cacheKey = idempoKey ? `idempo:auto-incorporate:${idempoKey}` : null;
  if (cacheKey) {
    const cached = await kv
      .get<Record<string, unknown>>(cacheKey)
      .catch(() => null);
    if (cached) {
      const sid =
        (cached.audit as { sessionId?: string } | undefined)?.sessionId ?? "";
      return jsonCors(cached, {
        headers: { "x-idempotent-replay": "true", "x-play-session": sid },
      });
    }
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

  // Bind WHO authorized this legal act into the signed record. The credential
  // fingerprint (from auth) proves which credential approved; declaredBy names
  // the human administrator (art. 102), taken from the validated body's
  // representante or an x-approver header, recorded as-asserted (never trusted
  // for auth). Both are signed with the entry, so the attestation is tamper-evident.
  const approver: ApproverAttestation = {
    ...auth.approver,
    declaredBy:
      input.representante?.nombre ||
      req.headers.get("x-approver")?.trim() ||
      undefined,
  };

  const result = await runIncorporation(input, {
    approver,
    tool: "auto_incorporate",
  });
  if (!result.ok) {
    return jsonCors(result.body, { status: result.status });
  }

  // Store the exact response so a replay of the same Idempotency-Key returns it
  // verbatim (same sessionId, same audit entry) instead of constituting again.
  if (cacheKey) {
    await kv.set(cacheKey, result.body, { ex: 86_400 }).catch(() => {});
  }

  return jsonCors(result.body, {
    headers: {
      "x-play-session": result.sessionId,
      "x-audit-backend": auditBackend(),
    },
  });
}

export async function GET() {
  // GET returns the endpoint's self-description (machine-readable docs).
  // The real call is POST; we surface this via Allow header so HTTP-aware
  // clients + conformance scanners read it correctly. Cache aggressively
  // because the doc body is stable.
  return jsonCors(
    {
      endpoint: "/api/auto-incorporate",
      method: "POST",
      description:
        "Machine-readable wizard for self-incorporating an Argentine sociedad-IA. POST a body with the schema below; receive package.json + agent.ts + .env.example + README.md + Vercel deploy URL + checklist + signed audit-log reference.",
      inputSchema: {
        denominacion: "string (3-200 chars)",
        tipo: "SAS | SRL | SA | SOCIEDAD-IA",
        capitalSocial: "number > 0 (ARS)",
        objeto: "string (20-2000 chars)",
        representante: "{ nombre: string, cuit: string }? (optional)",
        emailContacto: "string? (email)",
        piezas: `string[]?, subset of [${PIEZA_IDS.join(", ")}]; required pieces auto-added`,
        sessionId: "string?, for audit log continuity across calls",
      },
      requiredPiezas: REQUIRED_PIEZAS,
      rfc001: "https://ar-agents.ar/rfcs/001",
      auditLogReadEndpoint: "/api/play/audit/{sessionId}",
      dashboardEndpoint: "/dashboard/{sessionId}",
    },
    {
      headers: {
        Allow: "POST, OPTIONS",
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}

export async function OPTIONS() {
  return preflight();
}
