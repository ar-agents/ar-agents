/**
 * `registrar_decision` -- the dogfood society's "one real, visible business
 * task" that needs NO external credentials (ROADMAP.md M3-4). Every other
 * tool wired in `lib/agent.ts` degrades to `available: false` until AFIP,
 * Mercado Pago, or WhatsApp are configured; this one works on a fresh
 * deploy with only a model key.
 *
 * Low-stakes by design: `packages/core/src/risk-manifest.ts` classifies
 * `registrar_decision` as `"create"` (not gated behind human approval),
 * specifically because it only appends to the audit log -- it moves no
 * money, files nothing with AFIP/ARCA, and is not irreversible. The write
 * itself is not this tool's job: EVERY tool call is audited by the central
 * `withLocalAudit` wrapper in `lib/agent.ts` (see `./audit-middleware`),
 * so `execute` here only has to validate input and echo it back. That
 * wrapper also special-cases this tool's name to use the decision text
 * itself as the audit summary (see `./audit-middleware`'s
 * `summarizeSuccess`), since recording the decision IS the point.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

const MAX_DECISION_LEN = 500;
const MAX_RATIONALE_LEN = 1000;

export function decisionTools(): ToolSet {
  return {
    registrar_decision: tool({
      description:
        "Registrá una decisión de negocio que tomaste (registrar decisión, log a business decision, record a decision). USE ESTO cuando resolviste algo relevante para el founder y querés que quede en el historial auditable de la sociedad -- por ejemplo, una política que adoptaste, un cliente al que decidiste no facturarle todavía, o una prioridad que fijaste para hoy. NO mueve dinero, NO presenta nada ante AFIP/ARCA ni ningún organismo, NO es irreversible: es sólo una anotación. Queda registrada con timestamp en el audit log de esta sociedad, visible en el cockpit de studio ('Acciones recientes'). No hace falta ningún cliente externo configurado para usar esta tool.",
      inputSchema: z.object({
        decision: z
          .string()
          .min(1)
          .max(MAX_DECISION_LEN)
          .describe("Descripción corta y concreta de la decisión tomada."),
        rationale: z
          .string()
          .max(MAX_RATIONALE_LEN)
          .optional()
          .describe("Opcional: por qué se tomó esta decisión."),
      }),
      execute: async ({ decision, rationale }) => {
        return {
          recorded: true,
          decision,
          rationale: rationale ?? null,
          ts: new Date().toISOString(),
        };
      },
    }),
  } satisfies ToolSet;
}
