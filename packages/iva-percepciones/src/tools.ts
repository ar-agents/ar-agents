/**
 * Drop-in tool collection for Vercel AI SDK 6+. Pair with an Agent.
 */
import { tool } from "ai";
import { z } from "zod";
import type { IvaPerceptionAdapter } from "./adapter";
import { UnconfiguredIvaPerceptionAdapter } from "./adapter";
import {
  calculatePerception,
  buildPerceptionDdjj,
  asEntry,
} from "./calc";
import { DEFAULT_RATE_TABLE } from "./tables";
import type {
  IvaPerceptionRateEntry,
  PerceptionEntry,
} from "./types";

const regimeEnum = z.enum([
  "rg_2408_general",
  "rg_3337_combustibles",
  "rg_2126_servicios",
]);
const buyerConditionEnum = z.enum([
  "responsable_inscripto",
  "monotributista",
  "exento",
  "consumidor_final",
  "no_categorizado",
]);

const cuitSchema = z
  .string()
  .regex(/^\d{2}-?\d{8}-?\d{1}$|^\d{11}$/)
  .describe("CUIT with or without hyphens.");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

export interface IvaPerceptionToolsOptions {
  adapter?: IvaPerceptionAdapter;
  rateTable?: ReadonlyArray<IvaPerceptionRateEntry>;
  include?: ReadonlyArray<IvaPerceptionToolName>;
}

export const ALL_TOOL_NAMES = [
  "iva_perception_calculate",
  "iva_perception_build_ddjj",
  "iva_perception_submit_ddjj",
] as const;

export type IvaPerceptionToolName = (typeof ALL_TOOL_NAMES)[number];

export function ivaPerceptionTools(opts: IvaPerceptionToolsOptions = {}) {
  const adapter = opts.adapter ?? new UnconfiguredIvaPerceptionAdapter();
  const rateTable = opts.rateTable ?? DEFAULT_RATE_TABLE;
  const wanted = new Set<IvaPerceptionToolName>(opts.include ?? ALL_TOOL_NAMES);

  const allTools = {
    iva_perception_calculate: tool({
      description:
        "Compute the IVA perception (extra charge added on top of IVA) for a sale invoice. Returns 0 with a `waiverReason` when the buyer is exento / monotributista / consumidor final, when below the mínimo, or when a non-perception certificate is on file. Inputs in ARS centavos.",
      inputSchema: z.object({
        regime: regimeEnum,
        buyerCondition: buyerConditionEnum,
        buyerCuit: cuitSchema,
        netCentavos: z.number().int().nonnegative(),
        operationDate: dateSchema,
        buyerHasNonPerceptionCertificate: z.boolean().optional(),
      }),
      execute: async (input) =>
        calculatePerception({
          regime: input.regime,
          buyerCondition: input.buyerCondition,
          buyerCuit: input.buyerCuit,
          netCentavos: input.netCentavos,
          operationDate: input.operationDate,
          rateTable,
          ...(input.buyerHasNonPerceptionCertificate !== undefined
            ? {
                buyerHasNonPerceptionCertificate:
                  input.buyerHasNonPerceptionCertificate,
              }
            : {}),
        }),
    }),

    iva_perception_build_ddjj: tool({
      description:
        "Aggregate perception results into a monthly SIRE DDJJ with per-regime and per-buyer breakdowns. Pure aggregation.",
      inputSchema: z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/),
        agentCuit: cuitSchema,
        entries: z
          .array(
            z.object({
              comprobanteRef: z.string().min(1),
              perception: z.unknown(),
            }),
          )
          .min(1),
      }),
      execute: async (input) =>
        buildPerceptionDdjj({
          period: input.period,
          agentCuit: input.agentCuit,
          entries: input.entries as PerceptionEntry[],
        }),
    }),

    iva_perception_submit_ddjj: tool({
      description:
        "Submit an assembled SIRE perception DDJJ. Throws unless the host wired a real adapter. Files a tax return — confirmation gate required.",
      inputSchema: z.object({
        ddjj: z.unknown(),
      }),
      execute: async ({ ddjj }) =>
        adapter.submitDdjj(
          ddjj as Parameters<IvaPerceptionAdapter["submitDdjj"]>[0],
        ),
    }),
  } as const;

  const out: Record<string, (typeof allTools)[IvaPerceptionToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) out[name] = allTools[name];
  }
  return out as Pick<typeof allTools, IvaPerceptionToolName>;
}

export { asEntry };
