/**
 * CNV issuer types.
 *
 * Public issuers ("Emisoras") file through the AIF (Autopista de
 * Información Financiera). This package wraps the read-side of AIF that
 * matters for agents tracking listed Argentine companies.
 */

export interface IssuerRecord {
  /** CNV-assigned issuer code, stable across renames. */
  code: string;
  /** Denominación (legal name). */
  denomination: string;
  /** CUIT of the issuer. */
  cuit?: string;
  /** Categoría (Régimen general, PyME CNV, etc.). */
  categoria?: string;
  /** Sector clasification per CNV. */
  sector?: string;
  /** Whether the issuer is currently active. */
  active: boolean;
}

export type HechoRelevanteCategory =
  | "asamblea"
  | "dividendo"
  | "estado_financiero"
  | "oferta_publica"
  | "cambio_control"
  | "garantia"
  | "otro";

export interface HechoRelevante {
  id: string;
  issuerCode: string;
  /** YYYY-MM-DDTHH:mm:ssZ. */
  publishedAt: string;
  category: HechoRelevanteCategory;
  /** Short title published in AIF. */
  title: string;
  /** URL to the PDF / HTML in AIF. */
  documentUrl?: string;
}

export type FinancialStatementKind =
  | "anual"
  | "trimestral_q1"
  | "trimestral_q2"
  | "trimestral_q3"
  | "intermedio";

export interface FinancialStatementRecord {
  id: string;
  issuerCode: string;
  kind: FinancialStatementKind;
  /** YYYY-MM-DD end of period covered. */
  periodEnd: string;
  /** YYYY-MM-DDTHH:mm:ssZ submitted to CNV. */
  submittedAt: string;
  /** URL to the AIF folder. */
  folderUrl?: string;
}
