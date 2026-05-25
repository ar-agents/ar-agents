import { z } from "zod";
import { tool } from "ai";
import type { AnsesAdapter } from "./adapter";
import { UnconfiguredAnsesAdapter } from "./adapter";
import { AnsesValidationError } from "./errors";

export const ALL_TOOL_NAMES = [
  "anses_get_cuil_status",
  "anses_get_family_allowances",
  "anses_get_minimo_jubilatorio",
] as const;
export type AnsesToolName = (typeof ALL_TOOL_NAMES)[number];

export interface AnsesToolsOptions {
  adapter?: AnsesAdapter;
}

const CUIL_RE = /^\d{11}$/;

function normalizeCuil(value: string): string {
  const clean = value.replace(/-/g, "");
  if (!CUIL_RE.test(clean)) {
    throw new AnsesValidationError("cuil", "must be 11 digits (with or without hyphens)");
  }
  return clean;
}

export function ansesTools(opts: AnsesToolsOptions = {}) {
  const adapter = opts.adapter ?? new UnconfiguredAnsesAdapter();
  return {
    anses_get_cuil_status: tool({
      description:
        "Look up a CUIL's ANSES status — activo / jubilado / pensionado / desempleado_con_subsidio / desempleado_sin_subsidio / inactivo / fallecido. Returns last-reported employer (for `activo`) and last-activity period. `{found: false}` for unknown CUILs is a valid answer.",
      inputSchema: z.object({
        cuil: z
          .string()
          .describe("11-digit CUIL, with or without hyphens (e.g. 20-12345678-9)."),
      }),
      execute: async (input) => {
        const cuil = normalizeCuil(input.cuil);
        return adapter.getCuilStatus(cuil);
      },
    }),

    anses_get_family_allowances: tool({
      description:
        "List the family-allowance entitlements ANSES has on file for this CUIL: AUH (per-child), AUE (pregnancy), SUAF (formal workers), Pensión No Contributiva, Tarjeta Alimentar. Each entitlement carries the beneficiary count and current monthly amount in centavos.",
      inputSchema: z.object({
        cuil: z.string().describe("11-digit CUIL."),
      }),
      execute: async (input) => {
        const cuil = normalizeCuil(input.cuil);
        return adapter.getFamilyAllowances(cuil);
      },
    }),

    anses_get_minimo_jubilatorio: tool({
      description:
        "Look up the haber mínimo jubilatorio (minimum monthly pension) for a given period, returned in ARS centavos. Use to compare against an actual jubilación amount or to populate compliance UIs.",
      inputSchema: z.object({
        period: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .describe("YYYY-MM, e.g. 2026-05."),
      }),
      execute: async (input) => adapter.getMinimoJubilatorio(input.period),
    }),
  } as const;
}
