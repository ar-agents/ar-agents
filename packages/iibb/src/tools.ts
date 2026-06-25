/**
 * Drop-in tool collection for Vercel AI SDK 6+. Pair with an Agent.
 *
 * The tool layer leans heavily on the pure calc primitives in calc.ts
 * (computeDdjj, calculateRetention), the adapter is only required for
 * `iibb_lookup_padron`. Agents that only need to assemble DDJJ data and
 * compute retentions can run with the default UnconfiguredIibbAdapter.
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { IibbAdapter } from "./adapter";
import { UnconfiguredIibbAdapter } from "./adapter";
import {
  RateBook,
  computeDdjj,
  calculateRetention,
  calculatePerception,
} from "./calc";
import type { Alicuota, IngresoLine, JurisdictionCode } from "./types";

const jurisdictionEnum = z.enum([
  "CABA",
  "BSAS",
  "CTM",
  "CBA",
  "CRR",
  "CHA",
  "CHU",
  "ER",
  "FRM",
  "JUJ",
  "LP",
  "LR",
  "MZA",
  "MIS",
  "NQN",
  "RN",
  "SAL",
  "SJ",
  "SL",
  "SC",
  "SF",
  "SE",
  "TF",
  "TUC",
  "CM",
]);

const alicuotaSchema = z.object({
  jurisdiction: jurisdictionEnum,
  activityCode: z.string().min(1),
  rate: z.number().min(0).max(1),
  validUntil: z.string().optional(),
});

const lineSchema = z.object({
  dateIso: z.string(),
  jurisdiction: jurisdictionEnum,
  activityCode: z.string().min(1),
  baseImponibleCentavos: z.number().int().nonnegative(),
  reference: z.string().optional(),
});

export interface IibbToolsOptions {
  /** Map of jurisdiction → adapter. Each adapter handles its own
   * jurisdiction's padron lookup + DDJJ submission. */
  adapters?: Partial<Record<JurisdictionCode, IibbAdapter>>;
  /** Optional subset of tools to expose. */
  include?: ReadonlyArray<IibbToolName>;
}

export const ALL_TOOL_NAMES = [
  "iibb_calculate_retention",
  "iibb_calculate_perception",
  "iibb_compute_ddjj",
  "iibb_lookup_padron",
] as const;

export type IibbToolName = (typeof ALL_TOOL_NAMES)[number];

export function iibbTools(opts: IibbToolsOptions = {}): ToolSet {
  const adapters = opts.adapters ?? {};
  const wanted = new Set<IibbToolName>(opts.include ?? ALL_TOOL_NAMES);

  function getAdapter(jur: JurisdictionCode): IibbAdapter {
    return adapters[jur] ?? new UnconfiguredIibbAdapter(jur);
  }

  const allTools = {
    iibb_calculate_retention: tool({
      description:
        "Calculate the IIBB gross-receipts retention (calcular retención de Ingresos Brutos) on a base imponible in a given jurisdiction. Pure math: amount = base × rate (fraction), unless base < minimumThresholdCentavos. Pass `overrideRate` explicitly (the rate-book lookup belongs to compute_ddjj).",
      inputSchema: z.object({
        jurisdiction: jurisdictionEnum.describe(
          "The jurisdiction whose retention regime applies.",
        ),
        activityCode: z
          .string()
          .min(1)
          .describe(
            "CIIU / NAES activity code. Used for audit trail; rate comes from overrideRate.",
          ),
        baseCentavos: z
          .number()
          .int()
          .nonnegative()
          .describe("Base imponible in ARS centavos (integers, not floats)."),
        overrideRate: z
          .number()
          .min(0)
          .max(1)
          .describe(
            "Alicuota as a fraction (0.035 = 3.5%). NOT a percentage.",
          ),
        minimumThresholdCentavos: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            "Minimum base below which the retention is waived. Centavos.",
          ),
      }),
      execute: async (input) => calculateRetention(input),
    }),

    iibb_calculate_perception: tool({
      description:
        "Calculate the IIBB perception (calcular percepción de Ingresos Brutos) on a base imponible in a given jurisdiction. Symmetrical to retention in v0.1; some jurisdictions add a fixed component which will be refined as rate-books grow.",
      inputSchema: z.object({
        jurisdiction: jurisdictionEnum,
        activityCode: z.string().min(1),
        baseCentavos: z.number().int().nonnegative(),
        overrideRate: z.number().min(0).max(1),
        minimumThresholdCentavos: z.number().int().nonnegative().optional(),
      }),
      execute: async (input) => calculatePerception(input),
    }),

    iibb_compute_ddjj: tool({
      description:
        "Assemble a monthly IIBB tax return (armar la DDJJ mensual de Ingresos Brutos) from raw income lines + a rate-book. Supports the LOCAL regime (single jurisdiction) and the CM general regime (Article 2, requires cmCoefficients). Returns per-jurisdiction breakdown + totals. Does NOT submit; submission is the adapter's job.",
      inputSchema: z.object({
        period: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .describe("Period being filed, YYYY-MM."),
        regime: z
          .enum(["local", "cm"])
          .describe(
            "Single-jurisdiction (local) or multi-jurisdiction (cm) regime.",
          ),
        filerCode: jurisdictionEnum.describe(
          "Filer's primary jurisdiction (e.g. CABA for local AGIP, or CM for Convenio).",
        ),
        lines: z
          .array(lineSchema)
          .describe("All income lines realized during `period`."),
        rates: z
          .array(alicuotaSchema)
          .describe(
            "Rate-book entries covering every (jurisdiction, activityCode) pair touched by `lines`.",
          ),
        cmCoefficients: z
          .record(z.string(), z.number().min(0).max(1))
          .optional()
          .describe(
            "CM-only: coeficiente unificado per jurisdiction (sums to 1.0). Required when regime='cm'.",
          ),
      }),
      execute: async (input) => {
        const rateBook = new RateBook(input.rates as ReadonlyArray<Alicuota>);
        return computeDdjj({
          period: input.period,
          regime: input.regime,
          filerCode: input.filerCode,
          lines: input.lines as ReadonlyArray<IngresoLine>,
          rateBook,
          cmCoefficients: input.cmCoefficients,
        });
      },
    }),

    iibb_lookup_padron: tool({
      description:
        "Look up a CUIT in a jurisdiction's IIBB registry (consultar padrón de Ingresos Brutos). Returns null if not registered. Throws IibbUnconfiguredError if the adapter for that jurisdiction is not wired (the default in v0.1 for AGIP/ARBA/COMARB).",
      inputSchema: z.object({
        cuit: z
          .string()
          .regex(/^\d{2}-\d{8}-\d{1}$|^\d{11}$/)
          .describe("CUIT with or without hyphens."),
        jurisdiction: jurisdictionEnum.describe(
          "Jurisdiction to query (e.g. CABA, BSAS, CM).",
        ),
      }),
      execute: async ({ cuit, jurisdiction }) => {
        const adapter = getAdapter(jurisdiction);
        return adapter.lookupPadron(cuit.replace(/-/g, ""));
      },
    }),
  } as const;

  const out: Record<string, (typeof allTools)[IibbToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) out[name] = allTools[name];
  }
  return out as Pick<typeof allTools, IibbToolName>;
}
