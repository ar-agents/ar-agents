/**
 * ANSES types.
 *
 * CUIL = Código Único de Identificación Laboral. Same 11-digit shape as
 * CUIT (`XX-NNNNNNNN-D`). CUIL is for natural persons (workers + jubilados);
 * CUIT is for entities + autónomos. Both share the algorithm.
 *
 * The Mi ANSES API exposes per-CUIL data; everyone-else aggregates come
 * from datos.gob.ar (open data).
 */

/** Worker/jubilado lifecycle state as ANSES reports it. */
export type CuilStatus =
  | "activo" // currently employed in registered work
  | "jubilado" // retired (jubilación común or moratoria)
  | "pensionado" // pension recipient (e.g. PNC, viudez)
  | "desempleado_con_subsidio"
  | "desempleado_sin_subsidio"
  | "inactivo" // no recent activity
  | "fallecido";

export interface CuilStatusResult {
  cuil: string;
  /** Was the CUIL found in ANSES? */
  found: boolean;
  status?: CuilStatus;
  /** Display name from ANSES (may be partial). */
  nombre?: string;
  /** Last reported employer CUIT (if `status: activo`). */
  empleadorCuit?: string;
  /** When ANSES last saw activity, YYYY-MM. */
  ultimaActividad?: string;
  note?: string;
}

/** A single family-allowance entitlement from Mi ANSES. */
export type FamilyAllowanceKind =
  | "AUH" // Asignación Universal por Hijo
  | "AUE" // Asignación Universal por Embarazo
  | "SUAF" // Sistema Único de Asignaciones Familiares (formal workers)
  | "PENSION_NO_CONTRIBUTIVA"
  | "TARJETA_ALIMENTAR";

export interface FamilyAllowanceEntitlement {
  kind: FamilyAllowanceKind;
  /** Number of children covered (for per-child benefits). */
  beneficiariesCount?: number;
  /** Monthly amount in ARS centavos. */
  amountCentavos?: number;
  /** YYYY-MM when this entitlement became active. */
  activeSince?: string;
}

/** ANSES open-data reference: monthly minimum jubilación (haber mínimo). */
export interface MinimoJubilatorioRecord {
  /** YYYY-MM. */
  period: string;
  amountCentavos: number;
  /** Decreto / Resolución that set this value. */
  source?: string;
}
