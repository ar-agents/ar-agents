/**
 * Pure roll-up helpers. The BCRA API returns a row per (entidad,
 * periodo); most callers want a single "risk-score-able" summary.
 *
 * `summarizeDebt` is the canonical reduction.
 */

import type {
  DebtEntry,
  DebtResponse,
  DebtSummary,
  SituacionCrediticia,
} from "./types";
import { BcraValidationError } from "./errors";

const CUIT_RE = /^\d{11}$/;

export function normalizeCuit(value: string, field = "cuit"): string {
  const clean = value.replace(/-/g, "");
  if (!CUIT_RE.test(clean)) {
    throw new BcraValidationError(
      field,
      "must be 11 digits (with or without hyphens)",
    );
  }
  return clean;
}

/**
 * Reduce a DebtResponse into a single-row summary. Honors the
 * BCRA-convention `montoEnMiles` (debt amount is in ARS THOUSANDS in
 * their response) and produces a centavos integer.
 *
 *   1 ARS-thousand × 1_000 ARS × 100 centavos = 100_000 centavos
 */
export function summarizeDebt(response: DebtResponse): DebtSummary {
  const entidades = response.entidades;
  let totalCentavos = 0;
  let worst: SituacionCrediticia | 0 = 0;
  let hasProcesoJudicial = false;
  let hasSituacionFraude = false;
  let hasRefinanciaciones = false;
  for (const e of entidades) {
    totalCentavos += Math.round(e.montoEnMiles * 100_000);
    if (e.situacion > worst) worst = e.situacion;
    if (e.procesoJud) hasProcesoJudicial = true;
    if (e.situacionFraude) hasSituacionFraude = true;
    if (e.refinanciaciones) hasRefinanciaciones = true;
  }
  return {
    cuit: response.cuit,
    periodo: response.periodo,
    entidadesCount: entidades.length,
    totalCentavos,
    worstSituacion: worst,
    hasProcesoJudicial,
    hasSituacionFraude,
    hasRefinanciaciones,
  };
}

/**
 * Convert a single DebtEntry's `montoEnMiles` to centavos. Used by
 * callers who want to render per-entidad amounts in the same unit
 * as the rolled-up total.
 */
export function entryAmountCentavos(entry: DebtEntry): number {
  return Math.round(entry.montoEnMiles * 100_000);
}

/**
 * Convenience: derive a risk band from a summary. Heuristic only;
 * tune per-product.
 *
 *   "clean"    nothing reported
 *   "low"      worstSituacion ≤ 2, no judiciales
 *   "watch"    worstSituacion = 3 OR has refinanciaciones
 *   "high"     worstSituacion ≥ 4 OR has proceso judicial / fraude
 */
export function riskBand(
  summary: DebtSummary,
): "clean" | "low" | "watch" | "high" {
  if (summary.entidadesCount === 0 || summary.worstSituacion === 0) {
    return "clean";
  }
  if (summary.hasProcesoJudicial || summary.hasSituacionFraude) {
    return "high";
  }
  if (summary.worstSituacion >= 4) return "high";
  if (summary.worstSituacion === 3 || summary.hasRefinanciaciones) {
    return "watch";
  }
  return "low";
}
