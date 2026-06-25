/**
 * The "prompteándola" step: turn a human's natural-language description of the
 * society they want into the STRUCTURED DATA the locked incorporation templates
 * consume. The LLM emits DATA, never code: generateObject is constrained to a
 * schema, so the model physically cannot return executable text, only a
 * parameter object that is then validated against the strict incorporation Body
 * and flows through the existing validate() + generate*() pipeline unchanged.
 *
 * Two schemas, on purpose:
 *  - ExtractionSchema is the MODEL contract: flat, every field present, optional
 *    fields nullable (Anthropic structured output emits an explicit null far
 *    more reliably than it omits a key), no defaults/refinements. This is what
 *    generateObject enforces, and it is what makes the live model call succeed.
 *  - Body (from incorporate.ts) is the STORAGE contract: strict, with min/max,
 *    capital minimums, the pieza enum + defaults. The extracted candidate is
 *    re-validated against it, so nothing the model says becomes anything other
 *    than a real incorporation input.
 *
 * The model call sits behind an injectable `generate` seam, so the extraction
 * logic is unit-tested without a live LLM. The default seam routes through the
 * Vercel AI Gateway, same as /api/demo and /api/play.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { Body, PIEZA_IDS, REQUIRED_PIEZAS, type IncorporateInput } from "./incorporate";

// The model contract. Kept deliberately simple so Anthropic structured output
// matches it first try: all fields required, optionals expressed as nullable,
// capital coerced from a possible string, no defaults or refinements (those
// live in Body, applied after).
export const ExtractionSchema = z.object({
  denominacion: z
    .string()
    .describe("Nombre de fantasía de la sociedad, 3 a 200 caracteres, sin palabras reservadas (nacional, estatal, gobierno, estado, oficial)."),
  tipo: z
    .enum(["SAS", "SRL", "SA", "SOCIEDAD-IA"])
    .describe("Tipo societario. SAS por defecto salvo que el usuario pida otro explícitamente."),
  capitalSocial: z.coerce
    .number()
    .describe("Capital social en pesos argentinos (ARS), número. Si el usuario no lo dice, el mínimo del tipo (SAS y SRL: 100000)."),
  objeto: z.string().describe("Objeto social, 20 a 2000 caracteres, específico a lo que describe el usuario."),
  piezas: z
    .array(z.enum(PIEZA_IDS))
    .nullable()
    .describe(`Capacidades de la sociedad, elegidas SOLO de: ${PIEZA_IDS.join(", ")}. identity, gde-tad, mercadopago, banking y facturacion van siempre; agregá las demás según el caso (ej: 'vende por WhatsApp' -> whatsapp, 'hace envíos' -> shipping). null si no hay ninguna extra.`),
  representante: z
    .object({
      nombre: z.string().describe("Nombre del representante legal."),
      cuit: z.string().describe("CUIT del representante, 11 dígitos."),
    })
    .nullable()
    .describe("Representante legal si el usuario lo menciona; null si no."),
  emailContacto: z
    .string()
    .nullable()
    .describe("Email de contacto si el usuario lo menciona; null si no."),
});
export type SocietyExtraction = z.infer<typeof ExtractionSchema>;

// The validated draft (storage contract minus the server-assigned sessionId).
export const SocietyDraftSchema = Body.omit({ sessionId: true });
export type SocietyDraft = z.infer<typeof SocietyDraftSchema>;

// Gateway-routed model id. The string form needs no provider import (resolved by
// the Vercel AI Gateway), matching the other LLM routes in this app.
export const EXTRACTION_MODEL = "anthropic/claude-sonnet-4-6";

/**
 * The model seam. Receives the system + user prompt, returns the raw object the
 * model produced. Swapped for a fake in tests. The return is `unknown` on
 * purpose: extractSocietyDraft re-validates it, so the module never trusts its
 * generator.
 */
export type DraftGenerator = (args: { system: string; prompt: string }) => Promise<unknown>;

const defaultGenerator: DraftGenerator = async ({ system, prompt }) => {
  const { object } = await generateObject({
    model: EXTRACTION_MODEL,
    schema: ExtractionSchema,
    instructions: system,
    prompt,
    // The draft is small; bound the output so a hostile prompt can't run the
    // bill up via a huge generation.
    maxOutputTokens: 800,
  });
  return object;
};

/** Hard cap on the prompt length, so a single request can't drive a large
 *  (billed) model call. Rejected before the model is ever consulted. */
const MAX_PROMPT_CHARS = 4000;

const SYSTEM = [
  "Sos un asistente que estructura la constitución de una sociedad automatizada argentina.",
  "Convertí la descripción en lenguaje natural del usuario en los parámetros de constitución.",
  "Completá TODOS los campos. Para los opcionales que el usuario no mencione, usá null.",
  "No inventes datos personales (CUIT, nombres) que el usuario no haya dado: si no los dio, representante y emailContacto van en null.",
].join("\n");

export type ExtractResult =
  | { ok: true; draft: SocietyDraft }
  | {
      ok: false;
      error: "empty_prompt" | "prompt_too_long" | "invalid_draft" | "generation_failed";
      detail?: unknown;
    };

/** Map the lenient model candidate onto the strict Body input shape. */
function candidateToBodyInput(c: SocietyExtraction): Record<string, unknown> {
  return {
    denominacion: c.denominacion,
    tipo: c.tipo,
    capitalSocial: c.capitalSocial,
    objeto: c.objeto,
    ...(c.piezas && c.piezas.length ? { piezas: c.piezas } : {}),
    ...(c.representante ? { representante: c.representante } : {}),
    ...(c.emailContacto ? { emailContacto: c.emailContacto } : {}),
  };
}

/**
 * Extract a structured society draft from a natural-language prompt. Returns a
 * Body-validated draft (DATA), or a typed error. It deliberately does NOT run
 * the business validate() (reserved words, capital minimums): that stays at the
 * incorporation boundary, so this module has exactly one job, prompt -> DATA.
 */
export async function extractSocietyDraft(
  userPrompt: string,
  opts: { generate?: DraftGenerator } = {},
): Promise<ExtractResult> {
  const prompt = (userPrompt ?? "").trim();
  if (prompt.length < 3) return { ok: false, error: "empty_prompt" };
  if (prompt.length > MAX_PROMPT_CHARS) return { ok: false, error: "prompt_too_long" };

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

  // Stage 1: the model contract (also re-validates an injected fake's output).
  const candidate = ExtractionSchema.safeParse(raw);
  if (!candidate.success) {
    return { ok: false, error: "invalid_draft", detail: candidate.error.format() };
  }

  // Stage 2: the strict storage contract. Unknown keys are stripped, min/max +
  // pieza enum + defaults applied. Nothing becomes anything but a Body input.
  const draft = SocietyDraftSchema.safeParse(candidateToBodyInput(candidate.data));
  if (!draft.success) {
    return { ok: false, error: "invalid_draft", detail: draft.error.format() };
  }
  return { ok: true, draft: draft.data };
}

/** Promote a validated draft to a full incorporation input (assigns sessionId). */
export function draftToInput(draft: SocietyDraft, sessionId?: string): IncorporateInput {
  return sessionId ? { ...draft, sessionId } : { ...draft };
}

export { REQUIRED_PIEZAS };
