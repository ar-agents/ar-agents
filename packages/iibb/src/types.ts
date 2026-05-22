/**
 * IIBB (Impuesto sobre los Ingresos Brutos) types.
 *
 * IIBB is the Argentine gross-income tax, levied per-jurisdiction. Two
 * regimes exist:
 *
 *   - LOCAL: the taxpayer operates entirely within one jurisdiction
 *     (e.g. CABA only). DDJJ is filed monthly with that jurisdiction's
 *     authority (AGIP for CABA, ARBA for Buenos Aires, etc.).
 *
 *   - CONVENIO MULTILATERAL (CM): the taxpayer operates in two or more
 *     jurisdictions. They register once with the Comisión Arbitral and
 *     file a single CM-05 form monthly, distributing the tax base
 *     across jurisdictions per Article 2 (general regime) or Articles
 *     6-13 (special regimes for specific industries).
 *
 * This package handles the calculation + DDJJ assembly. Submission to
 * the real jurisdictional portals is the adapter's job (and is mostly
 * stubbed in v0.1; most jurisdictions still require a manual upload).
 */

/** Standard ISO-3166-2:AR jurisdiction codes plus CM for Convenio Multilateral. */
export type JurisdictionCode =
  // CABA + 23 provinces
  | "CABA" // AR-C — Ciudad Autónoma de Buenos Aires
  | "BSAS" // AR-B — Provincia de Buenos Aires
  | "CTM" // AR-K — Catamarca
  | "CBA" // AR-X — Córdoba
  | "CRR" // AR-W — Corrientes
  | "CHA" // AR-H — Chaco
  | "CHU" // AR-U — Chubut
  | "ER" // AR-E — Entre Ríos
  | "FRM" // AR-P — Formosa
  | "JUJ" // AR-Y — Jujuy
  | "LP" // AR-L — La Pampa
  | "LR" // AR-F — La Rioja
  | "MZA" // AR-M — Mendoza
  | "MIS" // AR-N — Misiones
  | "NQN" // AR-Q — Neuquén
  | "RN" // AR-R — Río Negro
  | "SAL" // AR-A — Salta
  | "SJ" // AR-J — San Juan
  | "SL" // AR-D — San Luis
  | "SC" // AR-Z — Santa Cruz
  | "SF" // AR-S — Santa Fe
  | "SE" // AR-G — Santiago del Estero
  | "TF" // AR-V — Tierra del Fuego
  | "TUC" // AR-T — Tucumán
  // CM = Convenio Multilateral umbrella; not a real territory but the
  // regime under which a multi-jurisdiction taxpayer files (CM-05).
  | "CM";

/** Authority owning each jurisdictional regime. */
export type Authority =
  | "AGIP" // CABA
  | "ARBA" // Buenos Aires
  | "ATER" // Entre Ríos
  | "API" // Santa Fe
  | "DGR" // Generic — most provinces use "Dirección General de Rentas"
  | "COMARB"; // Comisión Arbitral (Convenio Multilateral)

export const AUTHORITY_BY_JURISDICTION: Record<JurisdictionCode, Authority> = {
  CABA: "AGIP",
  BSAS: "ARBA",
  ER: "ATER",
  SF: "API",
  CM: "COMARB",
  // Most provinces default to a generic DGR; refine per province as the
  // package grows real adapters.
  CTM: "DGR",
  CBA: "DGR",
  CRR: "DGR",
  CHA: "DGR",
  CHU: "DGR",
  FRM: "DGR",
  JUJ: "DGR",
  LP: "DGR",
  LR: "DGR",
  MZA: "DGR",
  MIS: "DGR",
  NQN: "DGR",
  RN: "DGR",
  SAL: "DGR",
  SJ: "DGR",
  SL: "DGR",
  SC: "DGR",
  SE: "DGR",
  TF: "DGR",
  TUC: "DGR",
};

/** Tax-base treatment in CM-05. */
export type CmRegime =
  // Article 2 — General: distribute base 50% by gross income, 50% by
  // expenses, both per the previous calendar year (the "coeficiente
  // unificado"). Default for activities not covered by a special regime.
  | "art_2_general"
  // Articles 6-13 — Special regimes for specific industries (construction,
  // grain trading, professional services, etc.). Distribution rules differ
  // per article.
  | "art_6_construction"
  | "art_7_insurance"
  | "art_8_transport"
  | "art_9_professional_services"
  | "art_10_intermediaries"
  | "art_11_grain"
  | "art_12_finance"
  | "art_13_agro_industrial";

export interface Alicuota {
  jurisdiction: JurisdictionCode;
  /** Activity code (CIIU / NAES) for which this rate applies. */
  activityCode: string;
  /** Alicuota as a fraction (0.035 = 3.5%). Stored as a fraction, NOT a
   * percentage, to avoid floating-point footguns when multiplying. */
  rate: number;
  /** Optional: when this rate is no longer in force. */
  validUntil?: string | undefined;
}

export interface Padron {
  cuit: string;
  jurisdiction: JurisdictionCode;
  /** Is the CUIT currently registered as an IIBB taxpayer in this jurisdiction? */
  inscribed: boolean;
  /** Whether the taxpayer is in the local regime or CM. */
  regime: "local" | "cm";
  /** CM article if applicable. */
  cmArticle?: CmRegime | undefined;
  /** Convenio Multilateral coefficient share (0.0-1.0) for this
   * jurisdiction, when applicable. */
  cmCoefficient?: number | undefined;
  inscriptionNumber?: string | undefined;
  effectiveFrom?: string | undefined;
}

/** A single line-item input to a monthly DDJJ. Each invoice / sale of
 * the taxpayer maps to one IngresoLine. */
export interface IngresoLine {
  /** When the income was realized. */
  dateIso: string;
  /** Jurisdiction in which the income was realized. */
  jurisdiction: JurisdictionCode;
  /** CIIU / NAES activity code. Drives the alicuota lookup. */
  activityCode: string;
  /** Base imponible in ARS centavos (avoid floats). */
  baseImponibleCentavos: number;
  /** Optional reference (invoice number, transaction id). */
  reference?: string | undefined;
}

/** Per-jurisdiction summary of the DDJJ. */
export interface DdjjJurisdictionSummary {
  jurisdiction: JurisdictionCode;
  authority: Authority;
  totalBaseCentavos: number;
  /** Weighted-average alicuota actually applied (informational). */
  weightedAlicuota: number;
  /** Tax due, in ARS centavos. */
  taxDueCentavos: number;
  lineCount: number;
}

/** Monthly DDJJ result, regardless of regime. */
export interface DdjjResult {
  /** YYYY-MM. */
  period: string;
  regime: "local" | "cm";
  /** For local regime: the single jurisdiction. For CM: "CM". */
  filerCode: JurisdictionCode;
  totals: {
    baseCentavos: number;
    taxDueCentavos: number;
    lineCount: number;
  };
  /** Per-jurisdiction breakdown, populated for both regimes. */
  byJurisdiction: ReadonlyArray<DdjjJurisdictionSummary>;
  /** CM-only: the coeficiente unificado per jurisdiction (sums to 1.0). */
  cmCoefficients?: Record<string, number> | undefined;
}

// ── Retention / perception (third-party withholding) ────────────

export interface RetentionInput {
  /** Jurisdiction whose regime applies. */
  jurisdiction: JurisdictionCode;
  /** Activity code (drives the rate). */
  activityCode: string;
  /** Base on which the retention applies, in ARS centavos. */
  baseCentavos: number;
  /** Override the lookup with an explicit alicuota (fraction, e.g. 0.035). */
  overrideRate?: number | undefined;
  /** Minimum base below which no retention applies (per jurisdiction).
   * Centavos. */
  minimumThresholdCentavos?: number | undefined;
}

export interface RetentionResult {
  jurisdiction: JurisdictionCode;
  baseCentavos: number;
  rate: number;
  /** Amount in ARS centavos. */
  amountCentavos: number;
  /** Was the retention waived because the base was below the threshold? */
  belowThreshold: boolean;
}

export type PerceptionInput = RetentionInput;
export type PerceptionResult = Omit<RetentionResult, "belowThreshold"> & {
  belowThreshold: boolean;
};
