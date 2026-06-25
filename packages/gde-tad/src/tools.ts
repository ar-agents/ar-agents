/**
 * Vercel AI SDK tool collection for `@ar-agents/gde-tad`.
 *
 * The 4 tools are split by mutability:
 *   - **read-only** (`list_domicilio_inbox`, `list_mis_tramites`,
 *     `get_critical_notifications`), safe to call repeatedly; results
 *     drive the agent's situational awareness loop.
 *   - **algorithm-only** (`validate_igj_inscription`), pure preflight,
 *     no network. Use freely.
 *
 * Write operations (filing trámites) are intentionally NOT exposed yet -
 * the legal liability surface is too large until RFC-001 § 3.4 lands.
 * This is the moat: nobody else has even shipped this much.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  UnconfiguredDomicilioAdapter,
  UnconfiguredTramitesAdapter,
} from "./adapters";
import { computeSeverity } from "./severity";
import { validateIgjInscription, type IgjInscriptionInput } from "./igj-preflight";
import type { DomicilioAdapter, TramitesAdapter } from "./types";
import { normalizeCuit } from "./cuit";

export interface GdeTadToolsOptions {
  /** Domicilio Electrónico adapter. Falls back to the unconfigured shim. */
  domicilio?: DomicilioAdapter;
  /** Mis Trámites adapter. Falls back to the unconfigured shim. */
  tramites?: TramitesAdapter;
}

const cuitSchema = z
  .string()
  .min(1, "El CUIT es obligatorio.")
  .describe("CUIT con o sin guiones (20-12345678-9 o 20123456789).");

const sociedadInputSchema = z.object({
  denominacion: z.string().min(3),
  type: z.enum(["SAS", "SRL", "SA", "SOCIEDAD-IA"]),
  sede: z.object({
    calle: z.string().min(1),
    numero: z.string().min(1),
    ciudad: z.string().min(1),
    provincia: z.string().min(1),
    cpa: z.string().min(1),
  }),
  capitalSocial: z.number().positive(),
  objeto: z.string().min(20),
  constituyentes: z
    .array(
      z.object({
        cuit: z.string().min(1),
        razonSocial: z.string().optional(),
        apellido: z.string().optional(),
        nombre: z.string().optional(),
        aporte: z.number().positive(),
      }),
    )
    .min(1),
  sociedadIa: z.boolean().optional(),
});

export type GdeTadToolName =
  | "list_domicilio_inbox"
  | "list_mis_tramites"
  | "get_critical_notifications"
  | "validate_igj_inscription";

export function gdeTadTools(options: GdeTadToolsOptions = {}): ToolSet {
  const domicilio = options.domicilio ?? new UnconfiguredDomicilioAdapter();
  const tramites = options.tramites ?? new UnconfiguredTramitesAdapter();

  return {
    list_domicilio_inbox: tool({
      description:
        "List electronic-domicile notifications (notificaciones del Domicilio Electrónico Constituido, DEC) de una sociedad/persona. Cada notificación incluye organismo, asunto, fecha de notificación, fecha de respuesta (si aplica), cuerpo y severidad calculada (critical/important/info). Use this BEFORE making any major decision so you know if there's a binding deadline pending.",
      inputSchema: z.object({ cuit: cuitSchema }),
      execute: async ({ cuit }) => {
        const result = await domicilio.list(normalizeCuit(cuit));
        return {
          ...result,
          notifications: result.notifications.map((n) => ({
            ...n,
            severity: n.severity ?? computeSeverity(n),
          })),
        };
      },
    }),

    list_mis_tramites: tool({
      description:
        "List TAD case files where the company/person is a party (expedientes y trámites en TAD). Útil para reporting, due diligence, y para el agente saber qué tiene en curso vs. qué resolvió. Read-only, no inicia ni modifica trámites.",
      inputSchema: z.object({ cuit: cuitSchema }),
      execute: async ({ cuit }) => tramites.list(normalizeCuit(cuit)),
    }),

    get_critical_notifications: tool({
      description:
        "List only critical DEC notifications (notificaciones críticas del DEC), ordenadas por fecha de respuesta más cercana. Use this in the agent's morning loop to know what MUST be answered today/this week. Returns an empty list if the DEC inbox is empty or only has informational notices.",
      inputSchema: z.object({ cuit: cuitSchema }),
      execute: async ({ cuit }) => {
        const inbox = await domicilio.list(normalizeCuit(cuit));
        if (!inbox.available) {
          return { cuit: inbox.cuit, available: false, error: inbox.error, critical: [] };
        }
        const critical = inbox.notifications
          .filter((n) => (n.severity ?? computeSeverity(n)) === "critical")
          .sort((a, b) => {
            const aDue = a.responseDueBy ? Date.parse(a.responseDueBy) : Number.POSITIVE_INFINITY;
            const bDue = b.responseDueBy ? Date.parse(b.responseDueBy) : Number.POSITIVE_INFINITY;
            return aDue - bDue;
          });
        return { cuit: inbox.cuit, available: true, error: null, critical };
      },
    }),

    validate_igj_inscription: tool({
      description:
        "Pre-flight validator para una inscripción IGJ (SAS/SRL/SA/SOCIEDAD-IA). Catches the ~30% of rejections that are mechanical (denominación reservada, capital bajo el mínimo, aportes que no suman, CUIT inválido, sede incompleta). No network, pure algorithm. Run this BEFORE submitting via TAD to save 5–10 working days per round-trip.",
      inputSchema: sociedadInputSchema,
      execute: async (input) =>
        validateIgjInscription(input as IgjInscriptionInput),
    }),
  };
}
