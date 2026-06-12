/**
 * Drop-in tool collection for Vercel AI SDK 6+. Pair with an Agent.
 *
 * The tool layer leans heavily on the pure calc primitives in calc.ts
 * (calculateRetention, calculateRetentionStream, buildSicoreDdjj). The
 * adapter is only required for `sicore_submit_ddjj` (currently throws
 * by default; wire a custom adapter if your host has AFIP creds).
 */
import { tool } from "ai";
import { z } from "zod";
import type { SicoreAdapter } from "./adapter";
import { UnconfiguredSicoreAdapter } from "./adapter";
import {
  calculateRetention,
  calculateRetentionStream,
  buildSicoreDdjj,
  asEntry,
} from "./calc";
import { DEFAULT_RATE_TABLE } from "./tables";
import type {
  SicoreEntry,
  SicoreRateEntry,
  RetentionInput,
} from "./types";

const categoryEnum = z.enum([
  "servicios",
  "honorarios",
  "bienes",
  "alquileres",
]);
const statusEnum = z.enum(["inscripto", "no_inscripto", "exento"]);

const cuitSchema = z
  .string()
  .regex(/^\d{2}-?\d{8}-?\d{1}$|^\d{11}$/)
  .describe("CUIT with or without hyphens (11 digits).");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Payment date in YYYY-MM-DD.");

const retentionInputSchema = z.object({
  category: categoryEnum,
  status: statusEnum,
  supplierCuit: cuitSchema,
  paymentCentavos: z.number().int().nonnegative(),
  paymentDate: dateSchema,
  accumulatedMonthCentavos: z.number().int().nonnegative().optional(),
  alreadyRetainedThisMonthCentavos: z.number().int().nonnegative().optional(),
});

export interface SicoreToolsOptions {
  /** Adapter for submission. Defaults to UnconfiguredSicoreAdapter. */
  adapter?: SicoreAdapter;
  /** Override the in-package rate-table snapshot. */
  rateTable?: ReadonlyArray<SicoreRateEntry>;
  /** Optional subset of tools to expose. */
  include?: ReadonlyArray<SicoreToolName>;
}

export const ALL_TOOL_NAMES = [
  "sicore_calculate_retention",
  "sicore_calculate_retention_stream",
  "sicore_build_ddjj",
  "sicore_submit_ddjj",
] as const;

export type SicoreToolName = (typeof ALL_TOOL_NAMES)[number];

export function sicoreTools(opts: SicoreToolsOptions = {}) {
  const adapter = opts.adapter ?? new UnconfiguredSicoreAdapter();
  const rateTable = opts.rateTable ?? DEFAULT_RATE_TABLE;
  const wanted = new Set<SicoreToolName>(opts.include ?? ALL_TOOL_NAMES);

  const allTools = {
    sicore_calculate_retention: tool({
      description:
        "Calculate the SICORE income-tax retention on a supplier payment (calcular retención de Ganancias SICORE). Implements the RG 830/00 rule: retention is on the MONTHLY ACCUMULATED amount (passed via accumulatedMonthCentavos), minus what's already been retained this month (alreadyRetainedThisMonthCentavos). Returns 0 when the supplier is exento or the accumulated is below the minimum. Inputs are centavos integers; rates are fractions.",
      inputSchema: retentionInputSchema,
      execute: async (input) => {
        const args: RetentionInput = {
          category: input.category,
          status: input.status,
          supplierCuit: input.supplierCuit,
          paymentCentavos: input.paymentCentavos,
          paymentDate: input.paymentDate,
          ...(input.accumulatedMonthCentavos !== undefined
            ? { accumulatedMonthCentavos: input.accumulatedMonthCentavos }
            : {}),
          ...(input.alreadyRetainedThisMonthCentavos !== undefined
            ? {
                alreadyRetainedThisMonthCentavos:
                  input.alreadyRetainedThisMonthCentavos,
              }
            : {}),
          rateTable,
        };
        return calculateRetention(args);
      },
    }),

    sicore_calculate_retention_stream: tool({
      description:
        "Walk a chronological stream of payments to ONE supplier in ONE month and return the retention per payment, with the accumulator advancing automatically. Use this when reconciling a supplier's invoices for the month, the tool does the bookkeeping so the agent does not have to track running totals.",
      inputSchema: z.object({
        payments: z
          .array(
            z.object({
              category: categoryEnum,
              status: statusEnum,
              supplierCuit: cuitSchema,
              paymentCentavos: z.number().int().nonnegative(),
              paymentDate: dateSchema,
            }),
          )
          .min(1)
          .describe("All payments to one supplier in one month."),
      }),
      execute: async ({ payments }) =>
        calculateRetentionStream(payments, rateTable),
    }),

    sicore_build_ddjj: tool({
      description:
        "Assemble the monthly SICORE return (armar la DDJJ SICORE) from a list of retention results. Returns totals + per-category + per-supplier breakdowns ready for filing. Pure aggregation; does NOT submit.",
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
        buildSicoreDdjj({
          period: input.period,
          agentCuit: input.agentCuit,
          entries: input.entries as SicoreEntry[],
        }),
    }),

    sicore_submit_ddjj: tool({
      description:
        "Submit an assembled SICORE return to AFIP/ARCA (presentar la DDJJ SICORE). Throws SicoreUnconfiguredError unless the host wired a real submission adapter. Confirmation gate REQUIRED in the host UI before invoking, this files a tax return.",
      inputSchema: z.object({
        ddjj: z.unknown().describe("Result of sicore_build_ddjj."),
      }),
      execute: async ({ ddjj }) =>
        adapter.submitDdjj(ddjj as Parameters<SicoreAdapter["submitDdjj"]>[0]),
    }),
  } as const;

  const out: Record<string, (typeof allTools)[SicoreToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) out[name] = allTools[name];
  }
  return out as Pick<typeof allTools, SicoreToolName>;
}

export { asEntry };
