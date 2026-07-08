/**
 * `POST /api/agent` (auth): the tool-calling coach loop. Streams an AI SDK v7
 * UI-message response. Enforces the account's monthly cap BEFORE the model
 * call (fail closed, 402), and records token usage + estimated cost AFTER it
 * (best-effort, never fails the already-streamed response). See
 * docs/CONTRACT.md.
 *
 * The model never constitutes anything: there is no "constitute" tool. The
 * only three tools are read-only / dry-run (preview_society, good_standing,
 * my_society); the actual, irreversible act lives behind the dedicated
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
import { buildSocietySummary } from "@/lib/society";

export const runtime = "nodejs";

const STAGES = ["idea", "validacion", "spec", "constitucion", "operacion"] as const;
const BodySchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1),
  stage: z.enum(STAGES).optional(),
});

const STAGE_LABELS: Record<(typeof STAGES)[number], string> = {
  idea: "idea",
  validacion: "validación",
  spec: "especificación",
  constitucion: "constitución",
  operacion: "operación",
};

function systemPrompt(stage?: (typeof STAGES)[number]): string {
  const lines = [
    "Sos un coach de startups que ayuda a un humano a llevar una idea de negocio hasta una sociedad automatizada operando en Argentina, bajo el anteproyecto de reforma a la Ley General de Sociedades (art. 14 y 102), todavía no sancionado.",
    "Las etapas son: idea -> validación -> spec -> constitución -> operación. Guiá la charla en ese orden, sin saltar pasos.",
    stage ? `Etapa actual: ${STAGE_LABELS[stage]}.` : "",
    "Sé honesto: esto es una simulación previa a la ley. Nada de lo que generás acá inscribe algo ante un organismo real (IGJ, AFIP, etc). Nunca digas que ya presentaste o inscribiste algo de verdad.",
    "Tu objetivo es llegar a un borrador concreto (nombre, tipo societario, capital, objeto, capacidades) y usar preview_society para convertirlo en un borrador estructurado + checklist. Empujá la charla hacia eso.",
    "Usá good_standing para consultar el estado de una sociedad existente (por id o URL) y my_society para ver si esta cuenta ya tiene una sociedad constituida.",
    "IMPORTANTE: vos nunca constituís una sociedad. Es un acto irreversible que solo el humano puede confirmar, apretando el botón de constituir en la interfaz y aceptando la responsabilidad de administrador (art. 102). Cuando el borrador esté listo, decile al usuario que lo revise y apriete ese botón; vos no podés hacerlo.",
  ].filter(Boolean);
  return lines.join("\n\n");
}

function buildTools(accountId: string) {
  return {
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
      system: systemPrompt(parsed.data.stage),
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
