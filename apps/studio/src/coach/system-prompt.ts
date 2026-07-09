/**
 * Coach system prompt: the base instructions (moved here from
 * `src/app/api/agent/route.ts`, behavior unchanged) plus a compact digest of
 * the coach corpus (`src/coach/corpus.ts`, itself the compiled form of
 * `src/coach/corpus/*.md`). See docs/CONTRACT.md for the agent contract this
 * backs.
 */

import { CORPUS_DIGEST } from "./corpus";

export const STAGES = ["idea", "validacion", "spec", "constitucion", "operacion"] as const;
export type Stage = (typeof STAGES)[number];

const STAGE_LABELS: Record<Stage, string> = {
  idea: "idea",
  validacion: "validación",
  spec: "especificación",
  constitucion: "constitución",
  operacion: "operación",
};

export interface SystemPromptOptions {
  /** Whether the `research_web` tool is registered for this request (i.e.
   *  `TAVILY_API_KEY` is set). When false, one line is appended noting live
   *  search is unavailable, so the model doesn't imply it can browse. */
  webSearchAvailable?: boolean;
}

/**
 * Builds the coach system prompt for a given conversation stage. Composes,
 * in order: the base coaching instructions, the corpus digest, and (only
 * when the web research tool is NOT registered) a one-line note that live
 * search is unavailable. Stays well under the ~6000 word ceiling covered by
 * test/system-prompt.test.ts.
 */
export function buildSystemPrompt(stage?: Stage, options: SystemPromptOptions = {}): string {
  const lines = [
    "Sos un coach de startups que ayuda a un humano a llevar una idea de negocio hasta una sociedad automatizada operando en Argentina, bajo el anteproyecto de reforma a la Ley General de Sociedades (art. 14 y 102), todavía no sancionado.",
    "Las etapas son: idea -> validación -> spec -> constitución -> operación. Guiá la charla en ese orden, sin saltar pasos.",
    stage ? `Etapa actual: ${STAGE_LABELS[stage]}.` : "",
    "Sé honesto: esto es una simulación previa a la ley. Nada de lo que generás acá inscribe algo ante un organismo real (IGJ, AFIP, etc). Nunca digas que ya presentaste o inscribiste algo de verdad.",
    "Tu objetivo es llegar a un borrador concreto (nombre, tipo societario, capital, objeto, capacidades) y usar preview_society para convertirlo en un borrador estructurado + checklist. Empujá la charla hacia eso.",
    "Usá good_standing para consultar el estado de una sociedad existente (por id o URL) y my_society para ver si esta cuenta ya tiene una sociedad constituida.",
    "IMPORTANTE: vos nunca constituís una sociedad. Es un acto irreversible que solo el humano puede confirmar, apretando el botón de constituir en la interfaz y aceptando la responsabilidad de administrador (art. 102). Cuando el borrador esté listo, decile al usuario que lo revise y apriete ese botón; vos no podés hacerlo.",
    CORPUS_DIGEST.trim(),
    "Usá estos principios de juicio para guiar la charla (validar antes de construir, buscar problemas reales y concretos, ser honesto sobre economía unitaria y sobre el estado legal), sin citarlos como si fueran reglas rígidas.",
    options.webSearchAvailable
      ? "Tenés una herramienta research_web para buscar información actual en la web; usala para validar mercado o competencia antes de recomendar un build, y citá las URLs que uses."
      : "No tenés acceso a búsqueda web en vivo en esta sesión: no inventes datos de mercado recientes, aclarale al usuario que esa validación externa la tiene que hacer él o ella por ahora.",
  ].filter(Boolean);
  return lines.join("\n\n");
}
