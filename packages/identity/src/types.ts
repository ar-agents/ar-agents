/**
 * Public types for `@ar-agents/identity`. Kept minimal to reduce surface
 * area — the agent-tool layer (`./tools.ts`) is the primary consumer.
 */

/**
 * Tax condition reported by AFIP. The exact set of values AFIP returns
 * evolves over time, so we keep this as a widened string union to avoid
 * forcing callers into stale enums.
 */
export type AfipTaxCondition =
  | "MONOTRIBUTO"
  | "RESPONSABLE INSCRIPTO"
  | "EXENTO"
  | "NO RESPONSABLE"
  | "CONSUMIDOR FINAL"
  | (string & { _afip_tax_condition?: never });

/**
 * Monotributo categories (A through K, plus historical lower categories
 * occasionally seen). `null` when the taxpayer isn't on Monotributo.
 */
export type MonotributoCategoria =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | (string & { _monotributo_cat?: never })
  | null;

/**
 * Result of a successful AFIP padron lookup. Fields are nullable because
 * AFIP's response varies by taxpayer type and registration completeness.
 */
export interface AfipPadronData {
  /** Full legal name as registered with AFIP. */
  nombre: string;
  /** Tax condition (Monotributo, Responsable Inscripto, etc.). */
  condicion: AfipTaxCondition;
  /** Monotributo category if applicable; null otherwise. */
  monotributoCategoria: MonotributoCategoria;
  /** ISO date of registration. May be null for older records. */
  fechaInscripcion: string | null;
  /** Domicilio fiscal (registered address). May be null. */
  domicilioFiscal: string | null;
  /** Activities the taxpayer is registered for. May be empty. */
  actividades: string[];
}

/**
 * Outcome of an AFIP padron lookup. ALWAYS check `available` before reading
 * `data` — the lookup may be unavailable due to missing cert configuration,
 * AFIP service downtime, an unknown CUIT, or the lookup adapter being
 * intentionally stubbed (the default in `UnconfiguredAfipPadronAdapter`).
 */
export interface AfipPadronResult {
  /** The CUIT that was queried, normalized to 11 digits. */
  cuit: string;
  /** True iff `data` is populated with real AFIP information. */
  available: boolean;
  /**
   * Human-readable explanation when `available` is false. Surface this
   * verbatim to end users — it includes actionable recovery steps when
   * possible (e.g., "configure AFIP_CERT_PATH").
   */
  error: string | null;
  /** Set when `available` is true; null otherwise. */
  data: AfipPadronData | null;
}
