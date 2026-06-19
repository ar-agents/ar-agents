/**
 * `POST /api/incorporate-attested`, the human constitution surface.
 *
 * After previewing (/api/incorporate-preview), a person constitutes the society
 * by DECLARING their administrator identity (nombre + CUIT) and explicitly
 * ACCEPTING art. 102 responsibility. No shared secret: the gate is the
 * identified, logged, non-delegable human approval itself. The attestation
 * (method "self-attested", principal "cuit:<n>") is bound into the signed,
 * durable audit entry, so the record proves who took responsibility.
 *
 * It takes the already-extracted draft (what the human previewed and possibly
 * edited), not the prompt, so it constitutes exactly what they saw and spends no
 * model call. The draft is re-validated against the strict Body (never trusted).
 *
 * Pre-law this records an attested INTENT to constitute (it generates the repo +
 * a signed record); it files nothing with the state and moves no money. The
 * real registry/IGJ steps stay in the human checklist. Rate-limited (it writes a
 * durable record) and CUIT-validated. Stronger KYC (identity-attest OTP) is the
 * documented upgrade for true mass use.
 */

import { jsonCors, preflight } from "@/lib/cors";
import {
  type ApproverAttestation,
  backend as auditBackend,
  isSessionIdValid,
} from "@/lib/audit";
import { normalizeCuit } from "@/lib/incorporate";
import { runIncorporation } from "@/lib/incorporate-run";
import { draftToInput, SocietyDraftSchema } from "@/lib/prompt-to-society";
import { clientIp, kvRateLimit, rateLimit } from "@/lib/ratelimit";
import { parseCuit } from "@ar-agents/identity";

export const runtime = "edge";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit("incorporate-attested", ip, 5, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("incorporate-attested", ip, 5, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonCors({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const body = raw as {
    draft?: unknown;
    administrador?: { nombre?: unknown; cuit?: unknown };
    acepta102?: unknown;
    sessionId?: unknown;
  };

  // art. 102 acceptance is mandatory: a human takes non-delegable responsibility.
  if (body.acepta102 !== true) {
    return jsonCors(
      {
        ok: false,
        error: "art102_no_aceptado",
        message: "Tenés que aceptar la responsabilidad como administrador (art. 102).",
      },
      { status: 400 },
    );
  }

  const nombre =
    typeof body.administrador?.nombre === "string" ? body.administrador.nombre.trim() : "";
  const cuitRaw = typeof body.administrador?.cuit === "string" ? body.administrador.cuit : "";
  if (nombre.length < 2) {
    return jsonCors(
      { ok: false, error: "administrador_invalido", message: "Falta el nombre del administrador." },
      { status: 400 },
    );
  }
  if (!parseCuit(cuitRaw).valid) {
    return jsonCors(
      { ok: false, error: "cuit_invalido", message: "El CUIT del administrador no es válido." },
      { status: 422 },
    );
  }

  // Re-validate the draft against the strict storage contract: the human may
  // have edited the previewed draft, and the client is never trusted.
  const parsed = SocietyDraftSchema.safeParse(body.draft);
  if (!parsed.success) {
    return jsonCors(
      { ok: false, error: "draft_invalido", detail: parsed.error.format() },
      { status: 422 },
    );
  }

  const sessionId =
    typeof body.sessionId === "string" && isSessionIdValid(body.sessionId)
      ? body.sessionId
      : undefined;
  const input = draftToInput(parsed.data, sessionId);

  const approver: ApproverAttestation = {
    method: "self-attested",
    principal: `cuit:${normalizeCuit(cuitRaw)}`,
    principalKind: "declared-cuit",
    declaredBy: nombre,
  };

  const result = await runIncorporation(input, { approver, tool: "incorporate_attested" });
  if (!result.ok) {
    return jsonCors(result.body, { status: result.status });
  }
  return jsonCors(result.body, {
    headers: { "x-play-session": result.sessionId, "x-audit-backend": auditBackend() },
  });
}

export async function GET() {
  return jsonCors(
    {
      endpoint: "/api/incorporate-attested",
      method: "POST",
      description:
        "Human constitution. POST { draft, administrador: { nombre, cuit }, acepta102: true }. Constitutes the previewed society, binding the self-attested administrator (art. 102) into a signed, durable audit entry. No shared secret: the gate is the identified, logged human approval. Pre-law this records an attested intent; it files nothing with the state.",
      inputSchema: {
        draft: "the SocietyDraft returned by /api/incorporate-preview",
        administrador: "{ nombre: string, cuit: string }",
        acepta102: "true (explicit art. 102 acceptance, required)",
        sessionId: "string?, for audit continuity",
      },
      previewEndpoint: "/api/incorporate-preview",
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
