/**
 * `POST /api/incorporate-preview`, the public dry run behind the prompt UI.
 *
 * A human types a description; we extract the structured DATA (prompt-to-society)
 * and show what WOULD be constituted, with NO audit write and no auth. It
 * constitutes nothing, so it is safe to expose. The actual, irreversible
 * constitution lives behind /api/incorporate-from-prompt (auth + signed audit +
 * approver attestation, art. 102). This split is the point: previewing is free
 * and instant; the legal act needs a human to approve.
 *
 * Unauthenticated + it spends an LLM call per request, so the per-IP cap is
 * tighter than the constitute endpoints.
 */

import { jsonCors, preflight } from "@/lib/cors";
import { previewIncorporation } from "@/lib/incorporate-run";
import { draftToInput, extractSocietyDraft } from "@/lib/prompt-to-society";
import { clientIp, kvRateLimit, rateLimit } from "@/lib/ratelimit";

// nodejs (Fluid), not edge: the OpenRouter free-tier path needs retries and
// its latency varies; the edge runtime's 25s initial-response cap 504'd live
// draft generation (2026-07-20). Fluid keeps the same regions and pricing.
export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit("incorporate-preview", ip, 8, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("incorporate-preview", ip, 8, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  // Global daily ceiling (NOT per-IP): caps total preview spend on the SHARED
  // ar-agents gateway key regardless of caller, so a party rotating IPs (or
  // spoofing x-forwarded-for) can't drain it and 402 every product on the key.
  if (!(await kvRateLimit("incorporate-preview-global", "all", 2000, 86_400))) {
    return jsonCors({ ok: false, error: "rate_limited_global" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonCors({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const prompt =
    typeof (raw as { prompt?: unknown })?.prompt === "string"
      ? (raw as { prompt: string }).prompt
      : "";

  const extracted = await extractSocietyDraft(prompt);
  if (!extracted.ok) {
    const status =
      extracted.error === "empty_prompt" || extracted.error === "prompt_too_long"
        ? 400
        : extracted.error === "invalid_draft"
          ? 422
          : 502;
    return jsonCors(
      { ok: false, error: extracted.error, detail: extracted.detail },
      { status },
    );
  }

  const input = draftToInput(extracted.draft);
  const preview = previewIncorporation(input);

  return jsonCors({
    ok: true,
    dryRun: true,
    sociedad: {
      denominacion: input.denominacion,
      tipo: input.tipo,
      capitalSocial: input.capitalSocial,
      slug: preview.slug,
    },
    draft: extracted.draft,
    validation: preview.validation,
    configFiles: preview.configFiles,
    envVars: preview.envVars,
    checklist: preview.checklist,
    deploy: { target: "vercel", oneClickUrl: preview.deployUrl },
    note: "Esto es un dry run: no se constituyó nada. Constituir de verdad y dejar el acto en el audit log firmado requiere aprobación humana (art. 102).",
  });
}

export async function GET() {
  return jsonCors(
    {
      endpoint: "/api/incorporate-preview",
      method: "POST",
      description:
        "Public dry run for the prompt UI. POST { prompt }; returns the structured DATA the prompt maps to plus the scaffold it would generate, constituting nothing. The real, irreversible act is /api/incorporate-from-prompt (auth + signed audit).",
      inputSchema: { prompt: "string (description of the society)" },
      constitutes: false,
      realEndpoint: "/api/incorporate-from-prompt",
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
