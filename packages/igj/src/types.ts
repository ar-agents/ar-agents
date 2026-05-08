/**
 * Public types for `@ar-agents/igj`.
 *
 * IGJ open data lives at `datos.jus.gob.ar`, exposed via CKAN. The
 * datasets we wrap:
 *
 *   - `entidades-constituidas-en-la-inspeccion-general-de-justicia-igj`
 *     (sample/muestreo): entities + addresses + balances + authorities
 *     + asambleas as separate CSV resources.
 *   - `igj-autoridades-genero` (sample): authorities w/ inferred gender.
 *
 * IMPORTANT: These are *sample* datasets (`muestreo`), updated
 * periodically. They are NOT real-time. For live entity verification
 * (does ACME S.A. exist *today*?), only the IGJ portal works — no
 * documented API. Document this prominently to agents.
 */

/**
 * Type of IGJ-registered entity. Driven by the `tipoEntidad` column in
 * the open dataset.
 */
export type IgjEntityType =
  | "sa"
  | "srl"
  | "asociacion_civil"
  | "fundacion"
  | "cooperativa"
  | "mutual"
  | "sociedad_extranjera"
  | "sas"
  | "otro";

/**
 * One entity row from the IGJ dataset. CUIT may be missing for older
 * registrations or for foreign entities.
 */
export interface IgjEntity {
  /** Internal IGJ correlativo / id, when present in the dataset. */
  id: string;
  /** Razón social. */
  nombre: string;
  /** CUIT, when registered. May be empty. */
  cuit?: string;
  /** Entity type. */
  tipoEntidad: IgjEntityType;
  /** ISO date of inscripción/constitución (YYYY-MM-DD). */
  fechaInscripcion?: string;
  /** Inscripción number / matrícula. */
  matricula?: string;
  /** Raw dataset row, for forward-compat. */
  raw?: Record<string, unknown>;
}

/**
 * Domicilio de una entidad. One entity can have multiple domicilios
 * (legal, fiscal, real). The `tipo` field disambiguates.
 */
export interface IgjDomicilio {
  entityId: string;
  tipo?: string; // "legal", "fiscal", "real"...
  calle?: string;
  numero?: string;
  piso?: string;
  departamento?: string;
  localidad?: string;
  provincia?: string;
  codigoPostal?: string;
  raw?: Record<string, unknown>;
}

export interface IgjAutoridad {
  entityId: string;
  /** Nombre y apellido as published. */
  nombre: string;
  /** Cargo (presidente, director, vocal, ...). */
  cargo?: string;
  /** ISO date when the appointment was registered. */
  fechaDesignacion?: string;
  /** Inferred gender from `igj-autoridades-genero` when matched. */
  genero?: "M" | "F" | "otro" | null;
  raw?: Record<string, unknown>;
}

export interface IgjBalance {
  entityId: string;
  /** Closing date of the ejercicio (YYYY-MM-DD). */
  cierreEjercicio?: string;
  /** Reporting period number, when present. */
  numeroEjercicio?: number;
  /** ISO date the balance was filed. */
  fechaPresentacion?: string;
  raw?: Record<string, unknown>;
}

export interface IgjAsamblea {
  entityId: string;
  /** Tipo de asamblea (ordinaria, extraordinaria). */
  tipo?: string;
  /** ISO date the asamblea was held. */
  fecha?: string;
  raw?: Record<string, unknown>;
}

export interface IgjSearchQuery {
  /** Free-text query (matches against nombre + cuit + raw). */
  query?: string;
  /** Restrict to specific entity types. */
  tipos?: IgjEntityType[];
  /** Filter by CUIT (exact match, post-normalization). */
  cuit?: string;
  /** ISO date lower bound for fechaInscripcion. */
  from?: string;
  /** ISO date upper bound. */
  to?: string;
  /** Pagination cursor. Cursor format defined by fetcher. */
  cursor?: string;
  /** Page size. Default 20, max 100. */
  pageSize?: number;
}

export interface IgjSearchResult {
  results: IgjEntity[];
  total?: number;
  nextCursor: string | null;
  /** Source of the data — "live" = CKAN, "mock" = test fixture, "unconfigured" = stub. */
  source: "live" | "mock" | "unconfigured";
  /**
   * Coverage qualifier. The IGJ open dataset is a SAMPLE
   * (`muestreo`) — coverage of all real IGJ entities is partial.
   * Surface this verbatim to users so decisions don't rely on absence.
   */
  coverageNote: string;
}
