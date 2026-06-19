/**
 * The "prompteándola" step: turn a human's natural-language description of the
 * society they want into the STRUCTURED DATA the locked incorporation templates
 * consume. The LLM emits DATA, never code: generateObject is constrained to a
 * schema derived from the incorporation Body, so the model physically cannot
 * return executable text, only a validated parameter object. That object then
 * flows through the existing validate() + generate*() pipeline unchanged.
 *
 * The model call sits behind an injectable `generate` seam, so the extraction
 * logic (prompt construction, schema validation, error mapping) is unit-tested
 * without a live LLM. The default seam routes through the Vercel AI Gateway,
 * same as /api/demo and /api/play.
 */

import { generateObject } from "ai";
import type { z } from "zod";
import { Body, PIEZA_IDS, REQUIRED_PIEZAS, type IncorporateInput } from "./incorporate";

// What the model is allowed to emit: the user-supplied fields of an
// incorporation, minus sessionId (assigned server-side). Deriving from Body
// keeps this in lockstep with the schema the templates consume, so the model
// cannot invent or rename a field.
export const SocietyDraftSchema = Body.omit({ sessionId: true });
export type SocietyDraft = z.infer<typeof SocietyDraftSchema>;

// Gateway-routed model id. The string form needs no provider import (resolved by
// the Vercel AI Gateway), matching the other LLM routes in this app.
export const EXTRACTION_MODEL = "anthropic/claude-sonnet-4-6";

/**
 * The model seam. Receives the fully-built system + user prompt, returns the raw
 * object the model produced. Swapped for a fake in tests. The return is
 * `unknown` on purpose: extractSocietyDraft re-validates it, so the module never
 * trusts its generator (a fake, or a future non-schema generator, cannot smuggle
 * an off-schema draft through).
 */
export type DraftGenerator = (args: { system: string; prompt: string }) => Promise<unknown>;

const defaultGenerator: DraftGenerator = async ({ system, prompt }) => {
  const { object } = await generateObject({
    model: EXTRACTION_MODEL,
    schema: SocietyDraftSchema,
    system,
    prompt,
  });
  return object;
};

const SYSTEM = [
  "Sos un asistente que estructura la constitución de una sociedad automatizada argentina.",
  "Convertí la descripción en lenguaje natural del usuario en los parámetros de constitución.",
  "Reglas:",
  "- denominacion: nombre de fantasía, 3 a 200 caracteres. No uses palabras reservadas (nacional, estatal, gobierno, estado, oficial).",
  "- tipo: SAS por defecto, salvo que el usuario pida SRL, SA o SOCIEDAD-IA explícitamente.",
  "- capitalSocial: en ARS. Si el usuario no lo dice, proponé el mínimo legal del tipo (SAS y SRL: 100000).",
  "- objeto: el objeto social, 20 a 2000 caracteres, claro y específico a lo que describe el usuario.",
  `- piezas: elegí SOLO de esta lista las capacidades que la sociedad necesita: ${PIEZA_IDS.join(", ")}. identity, gde-tad, mercadopago, banking y facturacion van siempre; agregá las demás según lo que el usuario describe (ej: 'vende por WhatsApp' -> whatsapp, 'hace envíos' -> shipping).`,
  "- representante y emailContacto: completalos solo si el usuario los menciona.",
  "No inventes datos personales (CUIT, nombres) que el usuario no haya dado.",
].join("\n");

export type ExtractResult =
  | { ok: true; draft: SocietyDraft }
  | {
      ok: false;
      error: "empty_prompt" | "invalid_draft" | "generation_failed";
      detail?: unknown;
    };

/**
 * Extract a structured society draft from a natural-language prompt. Returns a
 * schema-validated draft (DATA), or a typed error. It deliberately does NOT run
 * the business validate() (reserved words, capital minimums): that stays at the
 * incorporation boundary, so this module has exactly one job, prompt -> DATA.
 */
export async function extractSocietyDraft(
  userPrompt: string,
  opts: { generate?: DraftGenerator } = {},
): Promise<ExtractResult> {
  const prompt = (userPrompt ?? "").trim();
  if (prompt.length < 3) return { ok: false, error: "empty_prompt" };

  const generate = opts.generate ?? defaultGenerator;
  let raw: unknown;
  try {
    raw = await generate({ system: SYSTEM, prompt });
  } catch (e) {
    return {
      ok: false,
      error: "generation_failed",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  // Re-validate regardless of source: the schema is the only boundary. Unknown
  // keys are stripped, off-schema values are rejected. Nothing the model says
  // becomes anything other than a Body-shaped parameter object.
  const parsed = SocietyDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid_draft", detail: parsed.error.format() };
  }
  return { ok: true, draft: parsed.data };
}

/** Promote a validated draft to a full incorporation input (assigns sessionId). */
export function draftToInput(draft: SocietyDraft, sessionId?: string): IncorporateInput {
  return sessionId ? { ...draft, sessionId } : { ...draft };
}

export { REQUIRED_PIEZAS };
