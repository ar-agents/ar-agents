/**
 * ARCA Aduana types.
 *
 * María / SIM is the long-running customs system Argentina has used for
 * imports/exports since the 1990s. In 2025 ARCA (the renamed AFIP)
 * published a public REST surface that exposes a subset of the data:
 *
 *   - despacho (declaration) status by SUSI / KIM / OM number
 *   - currently active tariff nomenclature (NCM) lookups
 *   - some open-data aggregates per period
 *
 * This package wraps the SDK-relevant slice for agents that need to
 * track shipments or verify HS codes.
 */

/** Identifier types ARCA Aduana exposes. */
export type AduanaIdKind = "SUSI" | "KIM" | "OM";

export interface DespachoIdentifier {
  kind: AduanaIdKind;
  /** Numeric or alphanumeric value, exactly as printed on the declaration. */
  value: string;
}

/** Operation type per ARCA classification. */
export type OperationKind =
  | "IM4" // Importación a consumo
  | "IT4" // Importación temporaria
  | "EC4" // Exportación a consumo
  | "ET4" // Exportación temporaria
  | "OTRO";

/** Current state of a despacho. The list mirrors ARCA's enumeration. */
export type DespachoStatus =
  | "registrado"
  | "oficializado"
  | "canalizado_verde"
  | "canalizado_naranja"
  | "canalizado_rojo"
  | "libre_disponibilidad"
  | "anulado";

export interface DespachoLookupResult {
  identifier: DespachoIdentifier;
  found: boolean;
  status?: DespachoStatus;
  operationKind?: OperationKind;
  ncmCode?: string;
  /** YYYY-MM-DD when the declaration was registered. */
  registeredAt?: string;
  /** Aduana office code (DGA's 3-digit code). */
  oficinaAduana?: string;
  /** CUIT of the importer/exporter (NOT public for all despachos). */
  cuit?: string;
  /** Free-form note when ARCA returns a message alongside the state. */
  note?: string;
}

export interface NcmLookupResult {
  /** Full 8-digit NCM code, e.g. "84713010". */
  code: string;
  description: string;
  /** Currently in force? Codes get phased in/out per Decreto. */
  active: boolean;
  /** Mercosur common external tariff (AEC), percent. */
  aecPercent?: number;
  /** Imports tax (DIE), percent. */
  diePercent?: number;
}
