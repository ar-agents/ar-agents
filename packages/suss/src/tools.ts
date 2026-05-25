/**
 * Drop-in tool collection for Vercel AI SDK 6+.
 */
import { tool } from "ai";
import { z } from "zod";
import type { SussAdapter } from "./adapter";
import { UnconfiguredSussAdapter } from "./adapter";
import { calculateEmployeeMonth, buildSicossDdjj } from "./calc";
import type {
  ContributionRateTable,
  EmployeeMonthInput,
  EmployeeMonthResult,
  EmployerContributionRegime,
} from "./types";

const regimeEnum = z.enum([
  "general",
  "grandes_empleadores",
  "promocion_empleo",
]);

const modeEnum = z.enum(["full_time", "part_time", "casas_particulares", "rural"]);

const cuilSchema = z
  .string()
  .regex(/^\d{2}-?\d{8}-?\d{1}$|^\d{11}$/)
  .describe("CUIL with or without hyphens.");

const cuitSchema = z
  .string()
  .regex(/^\d{2}-?\d{8}-?\d{1}$|^\d{11}$/)
  .describe("CUIT with or without hyphens.");

const employeeInputSchema = z.object({
  cuil: cuilSchema,
  nombre: z.string().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  remuneracionBrutaCentavos: z.number().int().nonnegative(),
  noRemunerativosCentavos: z.number().int().nonnegative().optional(),
  hijos: z.number().int().nonnegative().optional(),
  mode: modeEnum.optional(),
});

export interface SussToolsOptions {
  adapter?: SussAdapter;
  rateTable?: ContributionRateTable;
  include?: ReadonlyArray<SussToolName>;
}

export const ALL_TOOL_NAMES = [
  "suss_calculate_employee_month",
  "suss_build_ddjj",
  "suss_submit_ddjj",
] as const;

export type SussToolName = (typeof ALL_TOOL_NAMES)[number];

export function sussTools(opts: SussToolsOptions = {}) {
  const adapter = opts.adapter ?? new UnconfiguredSussAdapter();
  const rateTable = opts.rateTable;
  const wanted = new Set<SussToolName>(opts.include ?? ALL_TOOL_NAMES);

  const allTools = {
    suss_calculate_employee_month: tool({
      description:
        "Calculate the monthly aportes (employee-side) + contribuciones (employer-side) for one employee per F.931 / SICOSS. Returns the structured breakdown (jubilación, INSSJP, obra social, asignaciones familiares, FNE, ART) + the vector totals AFIP expects on the submission. Inputs in ARS centavos integers.",
      inputSchema: z.object({
        employee: employeeInputSchema,
        employerRegime: regimeEnum.optional(),
        artRate: z.number().min(0).max(1).optional(),
      }),
      execute: async (input) =>
        calculateEmployeeMonth({
          employee: input.employee as EmployeeMonthInput,
          ...(input.employerRegime
            ? { employerRegime: input.employerRegime as EmployerContributionRegime }
            : {}),
          ...(input.artRate !== undefined ? { artRate: input.artRate } : {}),
          ...(rateTable ? { rateTable } : {}),
        }),
    }),

    suss_build_ddjj: tool({
      description:
        "Aggregate per-employee monthly results into the monthly SICOSS DDJJ with vector totals (Seguridad Social, Obra Social, ART) + per-employee detail. Pure aggregation, does NOT submit. Accepts either pre-computed results or raw employee inputs (computed inline).",
      inputSchema: z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/),
        employerCuit: cuitSchema,
        employerRegime: regimeEnum.optional(),
        defaultArtRate: z.number().min(0).max(1).optional(),
        employees: z.array(z.unknown()).min(1),
      }),
      execute: async (input) =>
        buildSicossDdjj({
          period: input.period,
          employerCuit: input.employerCuit,
          ...(input.employerRegime
            ? { employerRegime: input.employerRegime as EmployerContributionRegime }
            : {}),
          ...(input.defaultArtRate !== undefined
            ? { defaultArtRate: input.defaultArtRate }
            : {}),
          employees: input.employees as Array<
            EmployeeMonthInput | EmployeeMonthResult
          >,
        }),
    }),

    suss_submit_ddjj: tool({
      description:
        "Submit a SICOSS DDJJ to AFIP. v0.1 ships only the contract — the real upload (fixed-width F.931 / SI.AP.RE web service) requires a custom adapter; throws SussUnconfiguredError otherwise. Confirmation gate REQUIRED before invoking — this files a tax return.",
      inputSchema: z.object({ ddjj: z.unknown() }),
      execute: async ({ ddjj }) =>
        adapter.submitDdjj(
          ddjj as Parameters<SussAdapter["submitDdjj"]>[0],
        ),
    }),
  } as const;

  const out: Record<string, (typeof allTools)[SussToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) out[name] = allTools[name];
  }
  return out as Pick<typeof allTools, SussToolName>;
}
