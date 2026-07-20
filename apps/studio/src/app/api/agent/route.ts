/**
 * `POST /api/agent` (auth): the tool-calling coach loop. Streams an AI SDK v7
 * UI-message response. Enforces the account's monthly cap BEFORE the model
 * call (fail closed, 402), and records token usage + estimated cost AFTER it
 * (best-effort, never fails the already-streamed response). See
 * docs/CONTRACT.md.
 *
 * The model never constitutes anything: there is no "constitute" tool. The
 * tools are read-only / dry-run (preview_society, good_standing, my_society,
 * plus research_web when TAVILY_API_KEY is set, see src/lib/research.ts);
 * the actual, irreversible act lives behind the dedicated
 * POST /api/society/constitute button in the UI.
 */

import {
  convertToModelMessages,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  tool,
} from "ai";
import { z } from "zod";
import { authenticate, getStoredSociety } from "@/lib/account";
import { goodStanding as fetchGoodStanding, previewSociety as fetchPreviewSociety } from "@/lib/aragents";
import { checkCap, recordUsage } from "@/lib/meter";
import { estimateCostMicroUsd, resolveModelForAgent } from "@/lib/models";
import { researchWeb, tavilyConfigured } from "@/lib/research";
import { buildSocietySummary } from "@/lib/society";
import { resolveInitialLocale } from "@/lib/ui/i18n";
import { buildSystemPrompt, STAGES } from "@/coach/system-prompt";

export const runtime = "nodejs";

const BodySchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1),
  stage: z.enum(STAGES).optional(),
  // Loosely typed on purpose (M1-3d): an invalid or missing locale must fall
  // back to "es", not 400 the whole request. resolveInitialLocale (the same
  // helper the language toggle uses to hydrate from localStorage, see
  // src/lib/ui/i18n.ts) does that narrowing below.
  locale: z.unknown().optional(),
});

/** Exported for tests: lets test/research-tool.test.ts assert research_web
 *  is registered/omitted per TAVILY_API_KEY without going through streamText. */
export function buildTools(accountId: string) {
  // Per-request cap on preview generations, mirroring the research_web cap
  // below: in the M1-8 live evals the model reacted to an upstream failure
  // by calling preview_society up to NINE times in one reply. The no-retry
  // note in the failure result is what actually breaks that loop; the
  // counter stops the upstream hammering if the model ignores the note.
  let previewCalls = 0;
  // Bilingual on purpose: this note gets read (and often paraphrased) by the
  // coach model, and an all-Spanish note was dragging English conversations
  // back into Spanish whenever the tool failed (M1-8 live eval finding).
  const PREVIEW_FAILURE_NOTE =
    "El generador de borradores no está disponible en este momento. NO vuelvas a llamar preview_society en esta respuesta: avisale al usuario, EN EL IDIOMA DE LA CONVERSACIÓN, que hubo un problema técnico y que lo intente de nuevo en un rato. / The draft generator is unavailable right now. Do NOT call preview_society again in this reply: tell the user, IN THE LANGUAGE OF THE CONVERSATION, that there was a technical problem and to try again shortly.";

  const base = {
    preview_society: tool({
      description:
        "Convierte una descripción en lenguaje natural de la sociedad en un borrador estructurado (SocietyDraft) + checklist, vía el dry-run público de ar-agents.ar. No constituye nada. Llamala UNA vez; si falla, no reintentes.",
      inputSchema: z.object({ prompt: z.string().min(3).max(4000) }),
      execute: async ({ prompt }) => {
        previewCalls += 1;
        if (previewCalls > MAX_PREVIEW_CALLS_PER_REQUEST) {
          return { ok: false, error: "preview_cap", note: PREVIEW_FAILURE_NOTE };
        }
        // One in-tool retry on upstream failure: the landing dry-run flakes
        // transiently (rate limits, cold starts) and a failed preview sinks
        // the whole journey. Retrying here (server-side, before the model
        // sees the failure) beats teaching the model to retry, which is how
        // it ended up calling this tool nine times in one reply.
        let r = await fetchPreviewSociety(prompt);
        if (!r.ok) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          r = await fetchPreviewSociety(prompt);
        }
        return r.ok ? r.data : { ok: false, error: r.error, note: PREVIEW_FAILURE_NOTE };
      },
    }),
    good_standing: tool({
      description:
        "Consulta el estado (good standing) de una sociedad automatizada existente en el registro público de ar-agents.ar, por id o por URL pública.",
      inputSchema: z.object({ idOrUrl: z.string().min(1).max(500) }),
      execute: async ({ idOrUrl }) => {
        const r = await fetchGoodStanding(idOrUrl);
        return r.ok ? r.data : { ok: false, error: r.error };
      },
    }),
    my_society: tool({
      description: "Devuelve la sociedad ya constituida por esta cuenta, si existe, o null.",
      inputSchema: z.object({}),
      execute: async () => {
        const stored = await getStoredSociety(accountId);
        return stored ? buildSocietySummary(stored) : null;
      },
    }),
  };

  // research_web is only registered when TAVILY_API_KEY is set (see
  // src/lib/research.ts); the system prompt notes when it's unavailable so
  // the model doesn't imply it can browse the live web.
  if (!tavilyConfigured()) return base;

  // Per-request cap on real searches: the first live eval run (ROADMAP.md
  // M1-8) caught the coach spending its whole step budget on research_web
  // calls and never answering the user. The system prompt now instructs
  // "max two searches per reply"; this counter enforces it mechanically.
  // Past the limit the tool returns a cheap, explicit "cap reached" result
  // telling the model to answer with what it already has.
  let researchCalls = 0;

  return {
    ...base,
    research_web: tool({
      description:
        "Busca en la web en tiempo real (vía Tavily) para validar mercado, competencia o datos antes de recomendar un build. Devuelve hasta 5 resultados con título, URL y fragmento. Citá las URLs que uses en tu respuesta al usuario. Máximo dos búsquedas por respuesta.",
      inputSchema: z.object({ query: z.string().min(2).max(300) }),
      execute: async ({ query }) => {
        researchCalls += 1;
        if (researchCalls > MAX_RESEARCH_CALLS_PER_REQUEST) {
          return {
            ok: false,
            error: "research_cap",
            note: "Límite de búsquedas por respuesta alcanzado. Respondele al usuario ahora con lo que ya tenés.",
          };
        }
        return researchWeb(query);
      },
    }),
  };
}

/** Max real research_web executions per POST /api/agent request; exported
 *  for tests. See the comment above the counter in buildTools. */
export const MAX_RESEARCH_CALLS_PER_REQUEST = 2;

/** Max real preview_society generations per POST /api/agent request;
 *  exported for tests. See the comment above the counter in buildTools. */
export const MAX_PREVIEW_CALLS_PER_REQUEST = 2;

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "cuerpo_invalido", detail: parsed.error.format() },
      { status: 400 },
    );
  }

  // Structural validation only (no `tools` schema passed): this just rejects
  // a malformed messages array (bad roles/parts), it does not need to know
  // our specific tool input schemas to do that.
  const validated = await safeValidateUIMessages({ messages: parsed.data.messages });
  if (!validated.success) {
    return Response.json({ ok: false, error: "mensajes_invalidos" }, { status: 400 });
  }

  const tools = buildTools(auth.accountId);

  const cap = await checkCap(auth.accountId);
  if (!cap.allowed) {
    return Response.json({ ok: false, error: "cap" }, { status: 402 });
  }

  const resolved = resolveModelForAgent();
  if (!resolved) {
    return Response.json({ ok: false, error: "no_model_configured" }, { status: 503 });
  }

  // Only "es" | "en" ever reach buildSystemPrompt; anything else (missing,
  // wrong type, unrecognized code) resolves to "es" via the same helper the
  // client-side language toggle uses (src/lib/ui/i18n.ts).
  const rawLocale = parsed.data.locale;
  const locale = resolveInitialLocale(typeof rawLocale === "string" ? rawLocale : null);

  try {
    const result = streamText({
      model: resolved.model,
      // Low temperature on purpose: the coach's job is consistent
      // rule-following (draft on request, fixed pricing script, language
      // mirroring), not creative writing. At the provider default the free
      // coach models flip behavior run to run (measured in the M1-8 live
      // evals: same prompt, same persona, opposite outcomes).
      temperature: 0.2,
      system: buildSystemPrompt(parsed.data.stage, { webSearchAvailable: tavilyConfigured(), locale }),
      messages: await convertToModelMessages(validated.data),
      tools,
      // 8 steps (was 6): with the research_web per-request cap above, the
      // worst case is 2 searches + 1 preview_society + text, with headroom;
      // a research-heavy turn no longer exhausts the budget before the model
      // gets to answer (first live eval finding, ROADMAP.md M1-8).
      stopWhen: stepCountIs(8),
      onFinish: async (event) => {
        const inputTokens = event.usage.inputTokens ?? 0;
        const outputTokens = event.usage.outputTokens ?? 0;
        await recordUsage(auth.accountId, {
          inputTokens,
          outputTokens,
          model: resolved.modelId,
          costMicroUsd: estimateCostMicroUsd(resolved.modelId, { inputTokens, outputTokens }),
        });
      },
    });
    return result.toUIMessageStreamResponse({
      // Without an explicit id, the stream carries no message id and every
      // consumer that merges messages by id (the eval driver, any persisted
      // chat) collapses successive assistant replies into one. Found live
      // during M1-8: eval transcripts kept only the LAST assistant turn.
      generateMessageId: () => crypto.randomUUID(),
      // Model-call failures surface mid-stream, after headers are sent, so
      // status codes cannot carry them. Map the known provider failures to
      // stable codes the UI can explain instead of a generic message.
      onError: (error) => {
        // Include responseBody when present: provider error CODES live there
        // (the Error message carries only the human-readable sentence).
        const body =
          error && typeof error === "object" && "responseBody" in error
            ? String((error as { responseBody?: unknown }).responseBody ?? "")
            : "";
        const text = (error instanceof Error ? error.message : String(error)) + " " + body;
        if (text.includes("insufficient_funds") || text.includes("credit balance")) {
          return "proveedor_sin_credito";
        }
        if (text.includes("rate limit") || text.includes("429")) return "proveedor_saturado";
        return "agent_failed";
      },
    });
  } catch {
    return Response.json({ ok: false, error: "agent_failed" }, { status: 500 });
  }
}
