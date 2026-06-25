/**
 * Drop-in tool collection for Vercel AI SDK 6+.
 *
 * Four tools: three direct passthroughs (debt / historical /
 * cheques) + one helper that fetches debt + returns the summarized
 * roll-up + a risk band. The helper is what most agents want
 * day-to-day, the raw entries are exposed for cases where the
 * agent does its own scoring.
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { BcraAdapter } from "./adapter";
import { UnconfiguredBcraAdapter } from "./adapter";
import { riskBand, summarizeDebt } from "./summarize";

const cuitSchema = z
  .string()
  .regex(/^\d{2}-?\d{8}-?\d{1}$|^\d{11}$/)
  .describe("CUIT con o sin guiones, 11 dígitos.");

export interface BcraToolsOptions {
  adapter?: BcraAdapter;
  include?: ReadonlyArray<BcraToolName>;
}

export const ALL_TOOL_NAMES = [
  "bcra_get_debt",
  "bcra_get_debt_summary",
  "bcra_get_historical_debt",
  "bcra_get_bounced_checks",
] as const;

export type BcraToolName = (typeof ALL_TOOL_NAMES)[number];

export function bcraTools(opts: BcraToolsOptions = {}): ToolSet {
  const adapter = opts.adapter ?? new UnconfiguredBcraAdapter();
  const wanted = new Set<BcraToolName>(opts.include ?? ALL_TOOL_NAMES);

  const allTools = {
    bcra_get_debt: tool({
      description:
        "Raw current debt status from the BCRA Central de Deudores (consultar deudas en el BCRA): one row per entidad reporting, with situación 1-6, monto, judicial/fraude/refinanciación flags. Returns BcraNotFoundError for CUITs the BCRA has no records on, treat as 'clean' rather than as an error.",
      inputSchema: z.object({ cuit: cuitSchema }),
      execute: async ({ cuit }) => adapter.getDebt(cuit),
    }),

    bcra_get_debt_summary: tool({
      description:
        "One-shot credit check for a CUIT (consultar deudores BCRA, riesgo crediticio): total reported debt (centavos), worst situación across entidades, judicial/fraude/refinanciación flags, plus a risk band ('clean' | 'low' | 'watch' | 'high') for direct gating. The right tool for 'should we extend credit to this CUIT?'.",
      inputSchema: z.object({ cuit: cuitSchema }),
      execute: async ({ cuit }) => {
        const raw = await adapter.getDebt(cuit);
        const summary = summarizeDebt(raw);
        return { ...summary, riskBand: riskBand(summary) };
      },
    }),

    bcra_get_historical_debt: tool({
      description:
        "24-month debt history for a CUIT (historial de deudas BCRA). Use for trend analysis ('has this taxpayer been deteriorating?') or to confirm a one-off vs a chronic pattern.",
      inputSchema: z.object({ cuit: cuitSchema }),
      execute: async ({ cuit }) => adapter.getHistoricalDebt(cuit),
    }),

    bcra_get_bounced_checks: tool({
      description:
        "Bounced-check history for a CUIT (cheques rechazados) (causa de rechazo + monto + fecha + whether subsequently paid). Independent of the Central de Deudores debt status, a clean debt record + bounced checks still flags a risk.",
      inputSchema: z.object({ cuit: cuitSchema }),
      execute: async ({ cuit }) => adapter.getBouncedChecks(cuit),
    }),
  } as const;

  const out: Record<string, (typeof allTools)[BcraToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) out[name] = allTools[name];
  }
  return out as Pick<typeof allTools, BcraToolName>;
}
