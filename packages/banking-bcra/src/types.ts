/**
 * Types for BCRA Central de Deudores responses.
 *
 * Endpoints we wrap (all public, no auth required):
 *   - GET /centraldedeudores/v1.0/Deudas/{cuit}
 *       current debt status — list of entidades with totals + situación
 *   - GET /centraldedeudores/v1.0/Deudas/Historicas/{cuit}
 *       monthly historical snapshots (24 months by default)
 *   - GET /centraldedeudores/v1.0/Deudas/ChequesRechazados/{cuit}
 *       bounced-check history with cause codes
 *
 * Base host: https://api.bcra.gob.ar
 *
 * Field names mirror what BCRA returns (camelCase Spanish) so anyone
 * familiar with their docs can map 1:1. We do NOT translate to
 * English — the conceptual taxonomy is AR-specific and translation
 * loses precision.
 */

/** CUIT with hyphens stripped (11 digits) as the API expects. */
export type Cuit = string;

/**
 * Situación crediticia (BCRA debt-status code). Lower is better.
 *
 *   1 = situación normal
 *   2 = riesgo bajo / con seguimiento especial
 *   3 = problemas potenciales
 *   4 = con alto riesgo de insolvencia
 *   5 = irrecuperable
 *   6 = irrecuperable por disposición técnica
 */
export type SituacionCrediticia = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * One entidad's reported debt on a single periodo. The BCRA API can
 * return a row per (entidad, periodo) combination — the helper
 * `summarizeDebt` aggregates these into a single rollup.
 */
export interface DebtEntry {
  /** Numeric entidad id assigned by BCRA. */
  entidad: number;
  /** Human-readable name. */
  nombre: string;
  /** YYYYMM as returned by BCRA. */
  periodo: string;
  /** Worst (highest) situación for this entidad in the period. */
  situacion: SituacionCrediticia;
  /** Total reported, in ARS thousands (BCRA convention). The helpers
   * expose a `*Centavos` variant that multiplies. */
  montoEnMiles: number;
  /** True if the cuit has had a "proceso judicial" attached this
   * period (bankruptcy, etc.). */
  procesoJud: boolean;
  /** True if this is a refinanciación de pasivos. */
  refinanciaciones: boolean;
  /** True if this is a categoría de "situación de fraude". */
  situacionFraude: boolean;
  /** True if there's an active mora. */
  enRevision: boolean;
  /** Free-form details when BCRA marks the row as observado. */
  diasAtrasoPago?: number;
}

export interface DebtResponse {
  cuit: Cuit;
  /** Latest single periodo (YYYYMM) the API has for the cuit. */
  periodo: string;
  /** One row per entidad reporting on the cuit. */
  entidades: DebtEntry[];
}

export interface HistoricalDebtPeriodo {
  /** YYYYMM. */
  periodo: string;
  entidades: DebtEntry[];
}

export interface HistoricalDebtResponse {
  cuit: Cuit;
  periodos: HistoricalDebtPeriodo[];
}

export interface BouncedCheckEntry {
  /** Numeric entidad id of the bank that bounced the cheque. */
  entidad: number;
  nombre: string;
  /** YYYY-MM-DD of the rechazo. */
  fechaRechazo: string;
  /** Cheque amount in ARS (NOT centavos — BCRA returns ARS). */
  monto: number;
  /** Numero de cheque rechazado. */
  numeroCheque: string;
  /** Causa de rechazo. Most common: "Sin fondos suficientes",
   * "Defectos formales". */
  causa: string;
  /** Si fue pagado posteriormente. */
  fechaPago?: string | undefined;
}

export interface BouncedChecksResponse {
  cuit: Cuit;
  cheques: BouncedCheckEntry[];
}

/**
 * Output of `summarizeDebt`. Convenient pre-rolled status for risk
 * scoring without re-iterating entidades on every consumer.
 */
export interface DebtSummary {
  cuit: Cuit;
  /** Latest periodo reported. YYYYMM. */
  periodo: string;
  /** Number of entidades reporting. */
  entidadesCount: number;
  /** Total reported debt summed across entidades, ARS centavos. */
  totalCentavos: number;
  /** Worst situación across entidades (max). Capped to 1-6; 0 means no debts. */
  worstSituacion: SituacionCrediticia | 0;
  /** True if ANY entidad has proceso judicial flag. */
  hasProcesoJudicial: boolean;
  /** True if ANY entidad has situación de fraude flag. */
  hasSituacionFraude: boolean;
  /** True if ANY entidad has refinanciaciones flag. */
  hasRefinanciaciones: boolean;
}
