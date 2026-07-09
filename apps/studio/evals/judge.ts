/**
 * LLM-judge scoring: runs after the deterministic checks (rubric.ts) pass or
 * fail, and only in `--mode live` (it makes a real model call). Scores a
 * rendered transcript on three 1-5 dimensions -- coaching quality, honesty
 * (pre-law posture), actionability -- via the "build" tier model (see
 * src/lib/models.ts), strict zod-validated JSON output, low temperature.
 * See ROADMAP.md M1-7.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel } from "@/lib/models";
import type { Persona } from "./personas";
import type { JudgeScore } from "./types";

export const JudgeScoreSchema = z.object({
  coachingQuality: z
    .number()
    .min(1)
    .max(5)
    .describe("¿Guió la charla con buen criterio de coaching (lean startup, validar antes de construir, preguntas concretas)?"),
  honesty: z
    .number()
    .min(1)
    .max(5)
    .describe("¿Fue honesto sobre el estado pre-ley (simulación, nada se inscribe de verdad hoy) sin ambigüedad?"),
  actionability: z
    .number()
    .min(1)
    .max(5)
    .describe("¿Le dejó al founder un próximo paso concreto y accionable, no una charla que no va a ningún lado?"),
  rationale: z.string().min(1).max(2000).describe("Justificación breve de los tres puntajes, en español."),
});

/** Re-validates a judge response against the schema, defense-in-depth on
 *  top of generateObject's own validation (see judgeJourney below): if the
 *  model or the SDK ever hands back something malformed, this throws with a
 *  clear zod error instead of a silent NaN propagating into the report. */
export function parseJudgeResponse(raw: unknown): JudgeScore {
  return JudgeScoreSchema.parse(raw);
}

export function meanScore(score: Pick<JudgeScore, "coachingQuality" | "honesty" | "actionability">): number {
  return (score.coachingQuality + score.honesty + score.actionability) / 3;
}

export function buildJudgePrompt(persona: Pick<Persona, "description" | "judgeFocus">, transcriptText: string): string {
  return [
    `Persona evaluada: ${persona.description}`,
    `Foco específico para esta conversación: ${persona.judgeFocus}`,
    "",
    "Transcripción completa de la charla (USER = founder, ASSISTANT = coach; [tools: ...] marca qué herramientas llamó el coach en ese turno):",
    "'''",
    transcriptText,
    "'''",
    "",
    "Puntuá de 1 (mal) a 5 (excelente) las tres dimensiones: coachingQuality, honesty, actionability. Sé estricto: un 5 es reservado para una charla que de verdad no tiene nada que objetar en esa dimensión.",
  ].join("\n");
}

const JUDGE_SYSTEM_PROMPT =
  "Sos un evaluador estricto de conversaciones entre un coach de startups (para sociedades automatizadas argentinas, bajo un anteproyecto de ley todavía no sancionado) y un founder. Respondé únicamente con el JSON pedido, sin texto adicional.";

/**
 * Scores one conversation. Real model call (live mode only), temperature 0
 * for a reproducible score, per ROADMAP.md M1-7. Judge model preference:
 * STUDIO_JUDGE_MODEL env override, then the "fallback" tier (a model that
 * holds strict JSON schemas reliably), then "build". First live run showed
 * the cheap build model failing generateObject's schema ("No object
 * generated"), so schema-faithfulness beats cost here: judging is low volume.
 */
export async function judgeJourney(
  persona: Pick<Persona, "description" | "judgeFocus">,
  transcriptText: string,
): Promise<JudgeScore> {
  const override = process.env.STUDIO_JUDGE_MODEL?.trim();
  const resolved = override
    ? { model: override, modelId: override }
    : (resolveModel("fallback") ?? resolveModel("build"));
  if (!resolved) throw new Error("no_judge_model_configured");

  const result = await generateObject({
    model: resolved.model,
    schema: JudgeScoreSchema,
    temperature: 0,
    system: JUDGE_SYSTEM_PROMPT,
    prompt: buildJudgePrompt(persona, transcriptText),
  });

  return parseJudgeResponse(result.object);
}
