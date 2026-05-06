/**
 * Type definitions for AFIP/ARCA WSFE (factura electrónica) operations.
 *
 * These mirror the SOAP request/response shapes but as flat TS types — no
 * XML namespacing, no SOAP envelope artifacts. The internals translate
 * to/from XML.
 */

import type {
  AlicuotaIvaCode,
  CbteTipoCode,
  ConceptoCode,
  DocTipoCode,
  MonedaCode,
  WsfeResultado,
} from "./catalogs";

/** "homo" for sandbox; "prod" for live. Mirrors `@ar-agents/identity`. */
export type WsfeEnv = "homo" | "prod";

/**
 * Single IVA discrimination row. Required for Facturas A, B, M when
 * `ImpIVA > 0`. Omit entirely for Factura C (monotributista).
 */
export interface IvaItem {
  /** Alícuota code (e.g., 5 for 21%). See `AlicuotaIva`. */
  id: AlicuotaIvaCode;
  /** Net amount this alícuota applies to. */
  baseImp: number;
  /** IVA amount (= baseImp × percent / 100). */
  importe: number;
}

/**
 * Single tributo (provincial / municipal tax) row. Optional. Use this for
 * Ingresos Brutos, impuestos internos, percepciones, etc.
 */
export interface TributoItem {
  /**
   * Tributo type ID. AFIP catalog: 1 = Impuestos nacionales, 2 = Impuestos
   * provinciales (Ingresos Brutos), 3 = Impuestos municipales,
   * 4 = Impuestos Internos, 99 = Otro.
   */
  id: number;
  /** Description (e.g., "Ingresos Brutos CABA"). */
  desc: string;
  /** Base imponible. */
  baseImp: number;
  /** Alícuota (percent). */
  alic: number;
  /** Importe (= baseImp × alic / 100). */
  importe: number;
}

/**
 * Optional reference to associated comprobantes — required for credit/debit
 * notes (must reference the original invoice).
 */
export interface CbteAsociado {
  /** Tipo del comprobante asociado. */
  tipo: CbteTipoCode;
  /** Punto de venta del comprobante asociado. */
  ptoVta: number;
  /** Número del comprobante asociado. */
  nro: number;
  /** CUIT del emisor del comprobante asociado. */
  cuit?: string;
  /** Fecha del comprobante asociado (YYYYMMDD). */
  fecha?: string;
}

/**
 * Optional opcional row — used for FCE MiPyMEs (CBU del receptor de la
 * Factura de Crédito), entrega bs. CABA (jurisdicción), etc.
 *
 * Common opcional codes:
 * - 2101: CBU del receptor de la FCE
 * - 2102: Anulación FCE
 * - 27: SLU (Sistema de Liquidación Única)
 * - 22: Adicional sobre receptor
 */
export interface OpcionalItem {
  /** Opcional ID per AFIP catalog. */
  id: string;
  /** Value (interpreted per the ID). */
  valor: string;
}

/**
 * Single comprobante to authorize. The `solicitarCAE()` API accepts an array
 * (AFIP supports batch up to 250 per request) but most agentic flows submit
 * one at a time for clear error attribution.
 */
export interface SolicitarCaeInput {
  /** Punto de venta (sale point). 1–9999. Must be enabled in your AFIP panel. */
  ptoVta: number;
  /** Comprobante type — see `CbteTipo`. */
  cbteTipo: CbteTipoCode;
  /** Concept type — see `Concepto`. */
  concepto: ConceptoCode;
  /** Document type for the receiver — see `DocTipo`. */
  docTipo: DocTipoCode;
  /** Document number for the receiver. Pass `0` for `CONSUMIDOR_FINAL`. */
  docNro: string | number;
  /**
   * Comprobante number range. For single-comprobante calls (the norm),
   * `cbteDesde === cbteHasta`. Get the next number from
   * `consultarUltimoAutorizado() + 1`.
   */
  cbteDesde: number;
  cbteHasta: number;
  /** Comprobante date as `YYYYMMDD` (e.g., "20260506"). */
  cbteFch: string;
  /** Importe total (= ImpNeto + ImpIVA + ImpTrib + ImpOpEx + ImpTotConc). */
  impTotal: number;
  /** Importe neto no gravado. Default 0. */
  impTotConc?: number;
  /** Importe neto gravado (subtotal before IVA). */
  impNeto: number;
  /** Importe operaciones exentas. Default 0. */
  impOpEx?: number;
  /** Importe total tributos (sum of `tributos[].importe`). Default 0. */
  impTrib?: number;
  /** Importe IVA (sum of `iva[].importe`). 0 for Factura C. */
  impIVA: number;
  /**
   * Service period start `YYYYMMDD`. REQUIRED when concepto = SERVICIOS or
   * PRODUCTOS_Y_SERVICIOS. Optional otherwise.
   */
  fchServDesde?: string;
  /** Service period end `YYYYMMDD`. Same rules as `fchServDesde`. */
  fchServHasta?: string;
  /** Payment due date `YYYYMMDD`. Same rules as `fchServDesde`. */
  fchVtoPago?: string;
  /** Currency code. Default "PES". */
  monId?: MonedaCode | string;
  /** Currency exchange rate vs ARS. Default 1 for PES. */
  monCotiz?: number;
  /** IVA discrimination rows. Required when `impIVA > 0`. */
  iva?: IvaItem[];
  /** Tributo (provincial/municipal) rows. */
  tributos?: TributoItem[];
  /** Comprobantes asociados (required for notas de crédito/débito). */
  cbtesAsoc?: CbteAsociado[];
  /** Opcional rows (for FCE MiPyMEs etc.). */
  opcionales?: OpcionalItem[];
}

/**
 * Result of a single `solicitarCAE` call. The CAE is the AFIP-authorized
 * code you must print on the comprobante (along with its expiration date).
 */
export interface SolicitarCaeResult {
  /** AFIP processing result. "A" = approved (CAE issued), "R" = rejected. */
  resultado: WsfeResultado;
  /**
   * The 14-digit CAE (Código de Autorización Electrónico). MUST be printed on
   * the comprobante. `null` when `resultado !== "A"`.
   */
  cae: string | null;
  /**
   * CAE expiration date as `YYYYMMDD`. The comprobante must be reported to
   * the receiver before this date. `null` when `resultado !== "A"`.
   */
  caeFchVto: string | null;
  /** Punto de venta (echo from request). */
  ptoVta: number;
  /** Comprobante type (echo from request). */
  cbteTipo: CbteTipoCode;
  /** Comprobante number (echo from request). */
  cbteDesde: number;
  cbteHasta: number;
  /** Comprobante date (echo from request). */
  cbteFch: string;
  /**
   * AFIP processing date `YYYYMMDD` — when the request was processed
   * server-side, may differ from the comprobante date.
   */
  fchProceso: string;
  /**
   * Per-detail observaciones (warnings or rejection reasons). Surface
   * verbatim — these come from AFIP and are actionable for the user.
   */
  observaciones: WsfeObservacion[];
  /**
   * Top-level errors (request was malformed). Distinct from per-detail
   * observaciones — these mean the entire request failed.
   */
  errors: WsfeError[];
  /**
   * Eventos (informational AFIP messages, e.g., maintenance window
   * notifications). Surface to ops dashboards.
   */
  eventos: WsfeEvento[];
}

export interface WsfeObservacion {
  code: number;
  msg: string;
}

export interface WsfeError {
  code: number;
  msg: string;
}

export interface WsfeEvento {
  code: number;
  msg: string;
}

/**
 * Result of `consultarUltimoAutorizado()`.
 */
export interface UltimoComprobanteResult {
  /** Punto de venta queried. */
  ptoVta: number;
  /** Comprobante type queried. */
  cbteTipo: CbteTipoCode;
  /**
   * The last authorized comprobante number for this (ptoVta, cbteTipo) pair.
   * `0` if no comprobante has ever been authorized — your next emission
   * uses `cbteDesde: 1`.
   */
  cbteNro: number;
}

/**
 * Result of `consultarComprobante()` — full echo of an already-authorized
 * comprobante. Use this to verify a CAE is valid and matches what you have.
 */
export interface ConsultarComprobanteResult {
  found: boolean;
  ptoVta: number;
  cbteTipo: CbteTipoCode;
  cbteDesde: number;
  cbteHasta: number;
  cbteFch: string;
  cae: string;
  caeFchVto: string;
  resultado: WsfeResultado;
  emisionTipo: string;
  docTipo: DocTipoCode;
  docNro: string;
  impTotal: number;
  impNeto: number;
  impIVA: number;
  observaciones: WsfeObservacion[];
}

/**
 * Result of `dummy()` — AFIP health check. All three fields should be "OK"
 * when the system is up. Use for /health endpoints and pre-emission gating.
 */
export interface DummyResult {
  /** Application server status. */
  appServer: string;
  /** Database server status. */
  dbServer: string;
  /** Auth server status. */
  authServer: string;
}
