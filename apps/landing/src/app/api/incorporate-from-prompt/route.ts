/**
 * `POST /api/incorporate-from-prompt`, the "prompteándola" surface.
 *
 * A human (or an agent) sends a natural-language description of the society they
 * want. We extract the structured parameters (DATA, never code: see
 * prompt-to-society.ts, the model is constrained to the incorporation schema)
 * and run the SAME pipeline + rails as /api/auto-incorporate: auth, rate limit,
 * signed durable audit, approver attestation. One coherent act, two front doors,
 * sharing runIncorporation so the rails can never drift between them.
 *
 * The model call is the only added failure surface; it is mapped to a typed
 * error (and live verification waits on AI Gateway credit). Everything else is
 * the proven incorporation path.
 */

import { kv } from "@vercel/kv";
import { jsonCors, preflight } from "@/lib/cors";
import {
  type ApproverAttestation,
  backend as auditBackend,
  isSessionIdValid,
} from "@/lib/audit";
import { runIncorporation } from "@/lib/incorporate-run";
import { draftToInput, extractSocietyDraft } from "@/lib/prompt-to-society";
import { clientIp, kvRateLimit, rateLimit } from "@/lib/ratelimit";
import { authorizeIncorporate } from "@/lib/incorporate-auth";

export const runtime = "edge";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit("incorporate-from-prompt", ip, 10, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  // Same durable cross-isolate cap as auto-incorporate: this surface also
  // constitutes legal entities, and it additionally spends LLM tokens per call.
  if (!(await kvRateLimit("incorporate-from-prompt", ip, 10, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const auth = await authorizeIncorporate(req);
  if (!auth.ok) {
    return jsonCors({ ok: false, error: auth.error }, { status: auth.status });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonCors({ error: "bad_json" }, { status: 400 });
  }
  const prompt =
    typeof (raw as { prompt?: unknown })?.prompt === "string"
      ? (raw as { prompt: string }).prompt
      : "";
  const sessionIdIn = (raw as { sessionId?: unknown })?.sessionId;
  const sessionId =
    typeof sessionIdIn === "string" && isSessionIdValid(sessionIdIn)
      ? sessionIdIn
      : undefined;

  // Optional client-controlled idempotency (the extraction is non-deterministic,
  // so the client owns the key). Replay returns the prior result verbatim.
  const idempoKey = req.headers.get("idempotency-key")?.trim();
  const cacheKey = idempoKey ? `idempo:incorporate-from-prompt:${idempoKey}` : null;
  if (cacheKey) {
    const cached = await kv.get<Record<string, unknown>>(cacheKey).catch(() => null);
    if (cached) {
      const sid = (cached.audit as { sessionId?: string } | undefined)?.sessionId ?? "";
      return jsonCors(cached, {
        headers: { "x-idempotent-replay": "true", "x-play-session": sid },
      });
    }
  }

  // prompt -> structured DATA. The model can only return a Body-shaped object.
  const extracted = await extractSocietyDraft(prompt);
  if (!extracted.ok) {
    const status =
      extracted.error === "empty_prompt"
        ? 400
        : extracted.error === "invalid_draft"
          ? 422
          : 502; // generation_failed: upstream model/gateway failure
    return jsonCors(
      { ok: false, error: extracted.error, detail: extracted.detail },
      { status },
    );
  }

  const input = draftToInput(extracted.draft, sessionId);

  // Same attestation binding as auto-incorporate. declaredBy comes from the
  // extracted representante (if the prompt named one) or an x-approver header.
  const approver: ApproverAttestation = {
    ...auth.approver,
    declaredBy:
      extracted.draft.representante?.nombre ||
      req.headers.get("x-approver")?.trim() ||
      undefined,
  };

  const result = await runIncorporation(input, {
    approver,
    tool: "incorporate_from_prompt",
  });
  if (!result.ok) {
    return jsonCors(result.body, { status: result.status });
  }

  // Echo back how the prompt was interpreted, so the caller can verify the
  // extraction before deploying the scaffold.
  const responseBody = {
    ...result.body,
    prompt: { received: prompt, draft: extracted.draft },
  };
  if (cacheKey) {
    await kv.set(cacheKey, responseBody, { ex: 86_400 }).catch(() => {});
  }

  return jsonCors(responseBody, {
    headers: {
      "x-play-session": result.sessionId,
      "x-audit-backend": auditBackend(),
    },
  });
}

export async function GET() {
  return jsonCors(
    {
      endpoint: "/api/incorporate-from-prompt",
      method: "POST",
      description:
        "Constitute an Argentine sociedad-IA from a natural-language prompt. POST { prompt }; the prompt is turned into structured incorporation DATA (the model is constrained to the incorporation schema, so it emits data not code), then run through the same pipeline as /api/auto-incorporate (validation, locked-template scaffold, signed durable audit, approver attestation). Response adds prompt.draft so you can verify the interpretation.",
      inputSchema: {
        prompt: "string (the description of the society to incorporate)",
        sessionId: "string?, for audit log continuity across calls",
      },
      headers: {
        authorization: "Bearer <INCORPORATE_API_KEY>  (or x-api-key)",
        "x-approver": "optional human administrator identifier (art. 102), recorded as-asserted",
        "idempotency-key": "optional, client-controlled replay key",
      },
      sibling: "/api/auto-incorporate (structured-body surface)",
      rfc001: "https://ar-agents.ar/rfcs/001",
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
