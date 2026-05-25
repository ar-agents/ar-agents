/**
 * Types for AFIP WSCDC — Constatación de Comprobantes Destinatarios.
 *
 * WSCDC is the AFIP web service that lets a buyer (the destinatario)
 * verify that an invoice received from a supplier was actually issued
 * by AFIP with a valid CAE / CAEA. Critical for AP-automation agents:
 * before ingesting a factura into accounts payable, an agent should
 * call this to refuse phishing / forged invoices.
 *
 * Service surface (single useful operation):
 *
 *   ComprobanteConstatar(req: CmpReq) → ConstatarResult
 *
 * Endpoints:
 *   prod: https://servicios1.afip.gov.ar/wscdc/service.asmx
 *   homo: https://wswhomo.afip.gov.ar/wscdc/service.asmx
 *
 * Auth: WSAA TA (token + sign) for the `wscdc` service, same flow as
 * wsfe but a separate authorization step in the AFIP portal.
 */

export type WscdcEnv = "prod" | "homo";

/** Authorization mode of the comprobante being verified. */
export type CbteModo = "CAE" | "CAEA";

/**
 * Comprobante type code (the same code used by WSFE). The most common
 * codes:
 *   1  = Factura A
 *   2  = Nota de Débito A
 *   3  = Nota de Crédito A
 *   6  = Factura B
 *   7  = Nota de Débito B
 *   8  = Nota de Crédito B
 *   11 = Factura C
 *   12 = Nota de Débito C
 *   13 = Nota de Crédito C
 *   51 = Factura M
 *   52 = Nota de Débito M
 *   53 = Nota de Crédito M
 *
 * The package accepts any positive integer — AFIP validates the
 * specific code server-side.
 */
export type CbteTipoCode = number;

/** Document-type code of the receptor. 80 = CUIT, 86 = CUIL,
 * 87 = CDI, 89 = LE, 90 = LC, 96 = DNI, 99 = Consumidor Final. */
export type DocTipoCode = number;

/**
 * Verification request. Field names match the AFIP WSDL closely so a
 * caller familiar with WSCDC can map 1:1.
 */
export interface ConstatarRequest {
  /** "CAE" or "CAEA". */
  cbteModo: CbteModo;
  /** CUIT of the emisor (the supplier). 11 digits. */
  cuitEmisor: string;
  /** Punto de venta (1-99999). */
  ptoVta: number;
  /** Comprobante type code (see CbteTipoCode). */
  cbteTipo: CbteTipoCode;
  /** Comprobante number. */
  cbteNro: number;
  /** Comprobante date as YYYYMMDD (AFIP's wire format). */
  cbteFch: string;
  /** Total comprobante amount, as a number (e.g. 12100.0). Use the
   * same precision the emisor reported on the invoice. */
  impTotal: number;
  /** 14-digit CAE / CAEA. */
  codAutorizacion: string;
  /** Document type of receptor. 80 = CUIT, 96 = DNI, 99 = Consumidor Final. */
  docTipoReceptor: DocTipoCode;
  /** Document number of receptor. 0 for Consumidor Final. */
  docNroReceptor: string;
}

export interface ConstatarObservacion {
  code: number;
  msg: string;
}

export type ConstatarResultado =
  /** Approved — every field matched what AFIP has on record. */
  | "A"
  /** Not approved — a mandatory field did not match. */
  | "N"
  /** Observed — soft warnings; the comprobante exists but a non-key
   * field differs. The caller decides whether to accept. */
  | "O";

export interface ConstatarResult {
  /** A / N / O — see ConstatarResultado for semantics. */
  resultado: ConstatarResultado;
  /** Soft observations (only populated when resultado = "O"). */
  observaciones: ReadonlyArray<ConstatarObservacion>;
  /** Hard validation errors (only populated when resultado = "N" or on
   * AFIP-side protocol issues). */
  errors: ReadonlyArray<ConstatarObservacion>;
  /** Raw AFIP response timestamp (the FchProceso field). */
  fchProceso?: string | undefined;
}

/** Caller-supplied WSAA access ticket (token + sign). */
export interface AccessTicket {
  /** Base64 token from WSAA. */
  token: string;
  /** Base64 sign from WSAA. */
  sign: string;
  /** CUIT of the WSAA-authorized representante (the agente). */
  cuitRepresentada: string;
  /** Token expiration (ISO 8601). Caller is responsible for refreshing. */
  expirationTime: string;
}
