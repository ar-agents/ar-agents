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
import { buildSystemPrompt, STAGES } from "@/coach/system-prompt";

export const runtime = "nodejs";

const BodySchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1),
  stage: z.enum(STAGES).optional(),
});

/** Exported for tests: lets test/research-tool.test.ts assert research_web
 *  is registered/omitted per TAVILY_API_KEY without going through streamText. */
export function buildTools(accountId: string) {
  const base = {
    preview_society: tool({
      description:
        "Convierte una descripción en lenguaje natural de la sociedad en un borrador estructurado (SocietyDraft) + checklist, vía el dry-run público de ar-agents.ar. No constituye nada.",
      inputSchema: z.object({ prompt: z.string().min(3).max(4000) }),
      execute: async ({ prompt }) => {
        const r = await fetchPreviewSociety(prompt);
        return r.ok ? r.data : { ok: false, error: r.error };
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

  return {
    ...base,
    research_web: tool({
      description:
        "Busca en la web en tiempo real (vía Tavily) para validar mercado, competencia o datos antes de recomendar un build. Devuelve hasta 5 resultados con título, URL y fragmento. Citá las URLs que uses en tu respuesta al usuario.",
      inputSchema: z.object({ query: z.string().min(2).max(300) }),
      execute: async ({ query }) => researchWeb(query),
    }),
  };
}

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

  try {
    const result = streamText({
      model: resolved.model,
      system: buildSystemPrompt(parsed.data.stage, { webSearchAvailable: tavilyConfigured() }),
      messages: await convertToModelMessages(validated.data),
      tools,
      stopWhen: stepCountIs(6),
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
