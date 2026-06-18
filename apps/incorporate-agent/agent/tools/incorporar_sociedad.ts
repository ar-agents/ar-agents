import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { createHash } from "node:crypto";
import { z } from "zod";

const ENDPOINT = "https://ar-agents.ar/api/auto-incorporate";
const TIMEOUT_MS = 60_000;

type IncorporateInput = {
  denominacion: string;
  tipo: string;
  objeto: string;
  capitalSocial: number;
  representante?: { nombre: string; cuit: string };
};

// Stable idempotency key from the meaningful inputs. eve runs each session as a
// durable workflow that can replay across cold starts and redeploys; a bare
// non-idempotent POST could constitute the company twice on replay or on a
// deliberate retry. Same inputs -> same key, so a dedupe-aware server returns
// the prior result instead of incorporating again.
function idempotencyKey(input: IncorporateInput): string {
  const seed = [
    input.denominacion,
    input.tipo,
    input.objeto,
    input.capitalSocial,
    input.representante?.cuit ?? "",
  ].join("|");
  return createHash("sha256").update(seed).digest("hex");
}

/**
 * Incorporate the company through ar-agents.
 *
 * always() approval is not decoration: art. 102 of the draft General Companies
 * Law makes the human administrator liable for what the AI does and bars
 * delegating the supervision duty. So the run pauses here for a person to sign
 * off before the company is constituted. eve parks the turn durably until they
 * answer. This is the human-in-the-loop the regime requires, expressed as one
 * line of config.
 *
 * Hardening: the denomination must contain "Automatizada" (art. 14) — enforced
 * at the schema boundary, not just asked for. The POST carries an
 * Idempotency-Key and (optionally) an INCORPORATE_API_KEY, and is bounded by a
 * timeout + the framework abort signal. Failures return a typed result so the
 * model treats an irreversible call as state-unknown rather than retrying blind.
 */
export default defineTool({
  description:
    "Incorporate an Argentine company via ar-agents (POST /api/auto-incorporate). IRREVERSIBLE: it constitutes the company and returns generated source files, a Vercel deploy URL, and a signed audit-log reference. The denomination MUST include the word 'Automatizada' (art. 14, enforced). capitalSocial (ARS, > 0) is required. Requires human approval before running (art. 102: the administrator answers for the AI). On a timeout/network failure the result is state-unknown — re-confirm with the human, do not auto-retry.",
  inputSchema: z.object({
    denominacion: z
      .string()
      .min(3)
      .max(200)
      .refine((v) => /\bautomatizada\b/i.test(v), {
        message: "La denominación debe incluir 'Automatizada' (art. 14).",
      })
      .describe("Company name. MUST include 'Automatizada' for a Sociedad Automatizada (art. 14)."),
    tipo: z
      .enum(["SAS", "SRL", "SA", "SOCIEDAD-IA"])
      .describe("Society type. Automatización (art. 14) is a declaration on any of these."),
    objeto: z
      .string()
      .min(20)
      .max(2000)
      .describe("Corporate purpose (objeto social)."),
    capitalSocial: z
      .number()
      .positive()
      .describe("Capital social en ARS, mayor a 0. Required by the endpoint."),
    representante: z
      .object({
        nombre: z.string(),
        cuit: z
          .string()
          .regex(/^\d{2}-?\d{8}-?\d$/, "CUIT inválido (formato XX-XXXXXXXX-X)."),
      })
      .optional()
      .describe("Human legal representative on record (validate the CUIT with validate_cuit first)."),
    emailContacto: z
      .string()
      .email()
      .optional()
      .describe("Contact email for the deploy and the checklist."),
    piezas: z
      .array(z.string())
      .optional()
      .describe("Extra artifacts/pieces to generate (optional)."),
    sessionId: z
      .string()
      .optional()
      .describe("Carries the audit log across calls. Reuse it to keep one verifiable session."),
  }),
  needsApproval: always(),
  async execute(input) {
    const apiKey = process.env.INCORPORATE_API_KEY?.trim();

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey(input),
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      // Network/timeout: the incorporation state is UNKNOWN. Surface a typed
      // result so the model re-confirms with the human; the Idempotency-Key
      // makes a deliberate retry safe.
      const name = (e as { name?: string } | null)?.name;
      const code = name === "TimeoutError" ? "timeout" : "network";
      return { ok: false as const, code, retriable: true as const };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const retriable = res.status === 429 || res.status === 503;
      return {
        ok: false as const,
        status: res.status,
        code: retriable ? "retriable" : "invalid",
        retriable,
        error: data,
      };
    }
    return { ok: true as const, ...data };
  },
});
