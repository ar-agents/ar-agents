import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

const ENDPOINT = "https://ar-agents.ar/api/auto-incorporate";

/**
 * Incorporate the company through ar-agents.
 *
 * always() approval is not decoration: art. 102 of the draft General Companies
 * Law makes the human administrator liable for what the AI does and bars
 * delegating the supervision duty. So the run pauses here for a person to sign
 * off before the company is constituted. eve parks the turn durably until they
 * answer. This is the human-in-the-loop the regime requires, expressed as one
 * line of config.
 */
export default defineTool({
  description:
    "Incorporate an Argentine company via ar-agents (POST /api/auto-incorporate). IRREVERSIBLE: it constitutes the company and returns generated source files, a Vercel deploy URL, and a signed audit-log reference. The denomination must include the word 'Automatizada' (art. 14). Requires human approval before running (art. 102: the administrator answers for the AI).",
  inputSchema: z.object({
    denominacion: z
      .string()
      .min(3)
      .max(200)
      .describe("Company name. Must include 'Automatizada' for a Sociedad Automatizada."),
    tipo: z
      .enum(["SAS", "SRL", "SA", "SOCIEDAD-IA"])
      .describe("Society type. Automatización (art. 14) is a declaration on any of these."),
    objeto: z
      .string()
      .min(20)
      .max(2000)
      .describe("Corporate purpose (objeto social)."),
    representante: z
      .object({ nombre: z.string(), cuit: z.string() })
      .optional()
      .describe("Human legal representative on record (validate the CUIT first)."),
    sessionId: z
      .string()
      .optional()
      .describe("Carries the audit log across calls. Reuse it to keep one verifiable session."),
  }),
  needsApproval: always(),
  async execute(input) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false as const, status: res.status, error: data };
    }
    return { ok: true as const, ...data };
  },
});
