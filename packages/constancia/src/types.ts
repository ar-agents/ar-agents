/**
 * Public types for `@ar-agents/constancia`.
 *
 * ARCA (ex-AFIP) publishes a *Constancia de Inscripción* — the official,
 * legally-citable document that states a taxpayer's fiscal situation
 * (régimen, monotributo categoría, impuestos, domicilio fiscal,
 * actividades). It is produced by a PUBLIC web form (no Clave Fiscal):
 * `https://www.afip.gob.ar/genericos/constanciainscripcion/`.
 *
 * There is no JSON API that returns the PDF artifact. The SOAP padrón
 * webservices (`@ar-agents/identity`'s `lookup_cuit_afip`) return the
 * *data* but never the document. This package fills that gap by driving
 * the public form via a browser runtime (the companion
 * `afip-constancia` skill on browserbase/skills) and returning both the
 * parsed fields AND the official PDF.
 */

/**
 * Coarse fiscal régimen of a taxpayer, as stated on the constancia.
 *
 * - **monotributo** — Régimen Simplificado. `monotributoCategoria` set.
 * - **responsable_inscripto** — Régimen General, IVA inscripto.
 * - **exento** — IVA exento.
 * - **no_alcanzado** — Not reached by the tax.
 * - **no_inscripto** — CUIT exists but no active inscription.
 * - **desconocida** — Could not be determined from the document.
 */
export type CondicionFiscal =
  | "monotributo"
  | "responsable_inscripto"
  | "exento"
  | "no_alcanzado"
  | "no_inscripto"
  | "desconocida";

/** A registered AFIP/CLAE economic activity. */
export interface ConstanciaActividad {
  /** CLAE / AFIP activity code, e.g., "620100". */
  codigo: string;
  /** Human description as printed, e.g., "Servicios de consultores en informática". */
  descripcion: string;
  /** Whether this is the primary ("principal") activity. */
  principal: boolean;
}

/** A tax the taxpayer is registered for, as listed on the constancia. */
export interface ConstanciaImpuesto {
  /** Description as printed, e.g., "IVA", "GANANCIAS", "MONOTRIBUTO". */
  descripcion: string;
  /** ISO date (`YYYY-MM-DD`) the registration took effect, when present. */
  desde?: string;
}

/** Domicilio fiscal block, when present on the document. */
export interface ConstanciaDomicilio {
  direccion?: string;
  localidad?: string;
  provincia?: string;
  codigoPostal?: string;
}

/**
 * The structured content of a Constancia de Inscripción.
 *
 * Field availability depends on the régimen — `monotributoCategoria` is
 * only present for monotributistas; `actividades`/`impuestos` may be
 * empty for a bare CUIT.
 */
export interface Constancia {
  /** Bare 11-digit CUIT. */
  cuit: string;
  /** Apellido y nombre (persona física) or razón social (persona jurídica). */
  denominacion: string;
  /** Whether the holder is a person or a company. */
  tipoPersona: "fisica" | "juridica";
  /** Coarse régimen. */
  condicion: CondicionFiscal;
  /** Monotributo category ("A".."K"), only when `condicion === "monotributo"`. */
  monotributoCategoria?: string;
  domicilioFiscal?: ConstanciaDomicilio;
  actividades?: ConstanciaActividad[];
  impuestos?: ConstanciaImpuesto[];
  /** ISO date (`YYYY-MM-DD`) of inscription, when present. */
  fechaInscripcion?: string;
  /** Estado, e.g., "ACTIVO", when present. */
  estado?: string;
}

/**
 * The official PDF artifact. ARCA stamps every constancia with a
 * verification code; storing the document (not just the data) is what
 * KYC / alta-de-proveedor / expediente flows actually need.
 */
export interface ConstanciaPdf {
  /** Base64-encoded PDF bytes, when the runtime captured the document. */
  base64?: string;
  /** Direct URL to the generated PDF (often short-lived), when exposed. */
  url?: string;
  /** ARCA verification code printed on the constancia, when parseable. */
  codigoVerificador?: string;
}

/**
 * Result of a constancia lookup. Mirrors the `available`/`error`/`data`
 * convention used across `@ar-agents/*` so tools are always safe to call.
 */
export interface ConstanciaResult {
  /** Bare 11-digit CUIT that was looked up. */
  cuit: string;
  /**
   * `true` only when a real lookup ran AND a constancia was produced.
   * `false` for: not configured, CUIT not found, or a blocked lookup —
   * always with an actionable `error`.
   */
  available: boolean;
  /** `null` on success; a human-actionable message otherwise. */
  error: string | null;
  /** Parsed fields. `null` when unavailable or CUIT not found. */
  data: Constancia | null;
  /** The official PDF artifact. `null` when not captured. */
  pdf: ConstanciaPdf | null;
  /**
   * Where the result came from. `"browse-skill"` = real run via the
   * browser runtime; `"mock"` = `MockConstanciaFetcher`;
   * `"unconfigured"` = no real lookup was made.
   */
  source: "browse-skill" | "mock" | "unconfigured";
}

/**
 * Loose shape the companion browser skill is expected to emit on stdout
 * as JSON. Deliberately permissive — `parseSkillOutput` normalizes it
 * into a `ConstanciaResult` and throws on a structural mismatch rather
 * than returning wrong data.
 */
export interface RawSkillOutput {
  cuit?: unknown;
  found?: unknown;
  denominacion?: unknown;
  tipoPersona?: unknown;
  condicion?: unknown;
  monotributoCategoria?: unknown;
  domicilioFiscal?: unknown;
  actividades?: unknown;
  impuestos?: unknown;
  fechaInscripcion?: unknown;
  estado?: unknown;
  pdf?: unknown;
  error?: unknown;
}
