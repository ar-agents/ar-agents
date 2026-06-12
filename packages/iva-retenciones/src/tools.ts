/**
 * Drop-in tool collection for Vercel AI SDK 6+.
 */
import { tool } from "ai";
import { z } from "zod";
import type { IvaRetentionAdapter } from "./adapter";
import { UnconfiguredIvaRetentionAdapter } from "./adapter";
import { calculateRetention, buildRetentionDdjj, asEntry } from "./calc";
import { DEFAULT_RATE_TABLE } from "./tables";
import type {
  IvaRetentionRateEntry,
  RetentionEntry,
} from "./types";

const regimeEnum = z.enum([
  "rg_2854_general",
  "rg_5057_servicios_digitales",
]);
const operationTypeEnum = z.enum([
  "servicios",
  "cosas_muebles",
  "locaciones_inmuebles",
]);
const supplierStatusEnum = z.enum([
  "responsable_inscripto",
  "monotributista",
  "exento",
  "no_categorizado",
]);

const cuitSchema = z
  .string()
  .regex(/^\d{2}-?\d{8}-?\d{1}$|^\d{11}$/)
  .describe("CUIT with or without hyphens.");

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export interface IvaRetentionToolsOptions {
  adapter?: IvaRetentionAdapter;
  rateTable?: ReadonlyArray<IvaRetentionRateEntry>;
  include?: ReadonlyArray<IvaRetentionToolName>;
}

export const ALL_TOOL_NAMES = [
  "iva_retention_calculate",
  "iva_retention_build_ddjj",
  "iva_retention_submit_ddjj",
] as const;

export type IvaRetentionToolName = (typeof ALL_TOOL_NAMES)[number];

export function ivaRetentionTools(opts: IvaRetentionToolsOptions = {}) {
  const adapter = opts.adapter ?? new UnconfiguredIvaRetentionAdapter();
  const rateTable = opts.rateTable ?? DEFAULT_RATE_TABLE;
  const wanted = new Set<IvaRetentionToolName>(opts.include ?? ALL_TOOL_NAMES);

  const allTools = {
    iva_retention_calculate: tool({
      description:
        "Compute the VAT retention on a supplier payment (calcular retención de IVA) per RG 2854/10. Returns 0 with `waiverReason` when the supplier is exento / monotributista, when the IVA component is below the mínimo, or when a non-retention certificate is on file. Rate is applied to the IVA component of the comprobante (NOT to the net or total).",
      inputSchema: z.object({
        regime: regimeEnum,
        operationType: operationTypeEnum,
        supplierStatus: supplierStatusEnum,
        supplierCuit: cuitSchema,
        paymentDate: dateSchema,
        ivaCentavos: z
          .number()
          .int()
          .nonnegative()
          .describe(
            "IVA component of the comprobante in ARS centavos (NOT net + IVA).",
          ),
        supplierHasNonRetentionCertificate: z.boolean().optional(),
      }),
      execute: async (input) =>
        calculateRetention({
          regime: input.regime,
          operationType: input.operationType,
          supplierStatus: input.supplierStatus,
          supplierCuit: input.supplierCuit,
          ivaCentavos: input.ivaCentavos,
          paymentDate: input.paymentDate,
          rateTable,
          ...(input.supplierHasNonRetentionCertificate !== undefined
            ? {
                supplierHasNonRetentionCertificate:
                  input.supplierHasNonRetentionCertificate,
              }
            : {}),
        }),
    }),

    iva_retention_build_ddjj: tool({
      description:
        "Assemble the monthly SIRE retention return (armar DDJJ SIRE de retenciones de IVA) with per-regime and per-supplier breakdowns. Pure aggregation.",
      inputSchema: z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/),
        agentCuit: cuitSchema,
        entries: z
          .array(
            z.object({
              comprobanteRef: z.string().min(1),
              retention: z.unknown(),
            }),
          )
          .min(1),
      }),
      execute: async (input) =>
        buildRetentionDdjj({
          period: input.period,
          agentCuit: input.agentCuit,
          entries: input.entries as RetentionEntry[],
        }),
    }),

    iva_retention_submit_ddjj: tool({
      description:
        "Submit an assembled SIRE retention return to AFIP/ARCA (presentar DDJJ de retenciones de IVA). Throws unless the host wired a real adapter. Files a tax return, confirmation gate required.",
      inputSchema: z.object({ ddjj: z.unknown() }),
      execute: async ({ ddjj }) =>
        adapter.submitDdjj(
          ddjj as Parameters<IvaRetentionAdapter["submitDdjj"]>[0],
        ),
    }),
  } as const;

  const out: Record<string, (typeof allTools)[IvaRetentionToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) out[name] = allTools[name];
  }
  return out as Pick<typeof allTools, IvaRetentionToolName>;
}

export { asEntry };
