/**
 * Types for AFIP/ARCA WSFECred (Registro de Facturas de Credito
 * Electronica MiPyME, RG 4367).
 *
 * WSFECred is the AFIP web service through which the RECEPTOR (the
 * large buyer) of a Factura de Credito Electronica MiPyME manages the
 * FCE lifecycle: query whether a counterparty is obligated to the FCE
 * regime for a given amount, list received FCEs, and accept or reject
 * them within the legal window (15 corridos days from puesta a
 * disposicion; silence = tacit acceptance).
 *
 * Operations wrapped in v0.1 (all verified against the live WSDL at
 * fwshomo.afip.gov.ar/wsfecred/FECredService?wsdl, 2026-06-12, and
 * cross-checked with pyafipws/wsfecred.py):
 *
 *   dummy()                            health probe
 *   consultarMontoObligadoRecepcion    is this CUIT obligated to receive FCE?
 *   consultarComprobantes              list emitted/received FCEs by filter
 *   aceptarFECred                      accept an FCE (IRREVERSIBLE)
 *   rechazarFECred                     reject an FCE (IRREVERSIBLE)
 *
 * Endpoints:
 *   prod: https://serviciosjava.afip.gob.ar/wsfecred/FECredService
 *   homo: https://fwshomo.afip.gov.ar/wsfecred/FECredService
 *
 * Auth: WSAA TA (token + sign) for the `wsfecred` service id.
 */
import { z } from "zod";

export type FecredEnv = "prod" | "homo";

/** Caller-supplied WSAA access ticket (token + sign), same shape as
 * the other @ar-agents AFIP packages. */
export interface AccessTicket {
  /** Base64 token from WSAA. */
  token: string;
  /** Base64 sign from WSAA. */
  sign: string;
  /** CUIT of the WSAA-authorized representada. */
  cuitRepresentada: string;
  /** Token expiration (ISO 8601). Caller is responsible for refreshing. */
  expirationTime: string;
}

// ── Shared primitives ───────────────────────────────────────────

export const cuitSchema = z
  .string()
  .regex(/^\d{2}-?\d{8}-?\d{1}$|^\d{11}$/)
  .describe("CUIT with or without hyphens (11 digits).");

/** xsd:date wire format used by WSFECred (YYYY-MM-DD, unlike WSFE's
 * YYYYMMDD). */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Date as YYYY-MM-DD (WSFECred uses xsd:date, NOT WSFE's YYYYMMDD).");

export interface CodigoDescripcion {
  code: number;
  msg: string;
}

/** Identifies an FCE by its full comprobante key (IdComprobanteType
 * in the WSDL). */
export const idFacturaSchema = z.object({
  cuitEmisor: cuitSchema.describe("CUIT of the FCE emisor (the MiPyME supplier)."),
  codTipoCmp: z
    .number()
    .int()
    .positive()
    .describe("FCE comprobante type code (201=FCE A, 206=FCE B, 211=FCE C, plus their ND/NC variants)."),
  ptoVta: z.number().int().min(1).max(99_999),
  nroCmp: z.number().int().positive(),
});

export type IdFactura = z.infer<typeof idFacturaSchema>;

// ── consultarMontoObligadoRecepcion ─────────────────────────────

export const checkObligationInputSchema = z.object({
  cuitConsultada: cuitSchema.describe(
    "CUIT to check for FCE-reception obligation (typically the buyer you are about to invoice).",
  ),
  fechaEmision: isoDateSchema
    .optional()
    .describe("Emission date the obligation applies to. Defaults to today."),
});

export type CheckObligationInput = z.infer<typeof checkObligationInputSchema>;

export interface CheckObligationResult {
  /** true if the consulted CUIT is obligated to receive FCE for
   * invoices at or above `montoDesde`. */
  obligado: boolean;
  /** Threshold amount in ARS from which the FCE regime applies. AFIP
   * returns the current value (the agency updates it periodically, for
   * example the Apr 2026 update to roughly ARS 5.5M). Never hardcode
   * this on the client side. */
  montoDesde: number | null;
  observaciones: ReadonlyArray<CodigoDescripcion>;
  errors: ReadonlyArray<CodigoDescripcion>;
}

// ── consultarComprobantes ───────────────────────────────────────

export const rolEnum = z.enum(["Emisor", "Receptor"]);
export type Rol = z.infer<typeof rolEnum>;

export const estadoCmpEnum = z.enum([
  "PendienteRecepcion",
  "Recepcionado",
  "Aceptado",
  "Rechazado",
  "InformadaAgDpto",
]);
export type EstadoCmp = z.infer<typeof estadoCmpEnum>;

export const tipoFechaEnum = z.enum([
  "Emision",
  "PuestaDispo",
  "VenPago",
  "VenAcep",
  "Acep",
  "InfoAgDptoCltv",
]);
export type TipoFecha = z.infer<typeof tipoFechaEnum>;

export const listComprobantesInputSchema = z.object({
  rol: rolEnum
    .default("Receptor")
    .describe("Role of the represented CUIT. 'Receptor' lists FCEs you received."),
  cuitContraparte: cuitSchema
    .optional()
    .describe("Filter by the counterparty CUIT."),
  estadoCmp: estadoCmpEnum
    .optional()
    .describe("Filter by comprobante state. 'Recepcionado' = received and awaiting accept/reject."),
  codTipoCmp: z.number().int().positive().optional(),
  fechaDesde: isoDateSchema.optional().describe("Date range start. Defaults to 2019-01-01."),
  fechaHasta: isoDateSchema.optional().describe("Date range end. Defaults to today."),
  fechaTipo: tipoFechaEnum
    .default("Emision")
    .describe("Which date column the range filters on."),
  nroPagina: z.number().int().min(1).optional().describe("Page number (server paginates)."),
});

export type ListComprobantesInput = z.infer<typeof listComprobantesInputSchema>;

export interface FecredComprobante {
  cuitEmisor: string;
  razonSocialEmi: string | null;
  codTipoCmp: number;
  ptoVta: number;
  nroCmp: number;
  cuitReceptor: string;
  razonSocialRecep: string | null;
  codAutorizacion: string | null;
  fechaEmision: string | null;
  fechaVenPago: string | null;
  fechaVenAcep: string | null;
  importeTotal: number | null;
  codMoneda: string | null;
  cotizacionMoneda: number | null;
  codCtaCte: number | null;
  estado: string | null;
  fechaHoraEstado: string | null;
}

export interface ListComprobantesResult {
  comprobantes: ReadonlyArray<FecredComprobante>;
  nroPagina: number | null;
  /** "S" when more pages remain. */
  hayMas: boolean;
  observaciones: ReadonlyArray<CodigoDescripcion>;
  errors: ReadonlyArray<CodigoDescripcion>;
}

// ── aceptarFECred ───────────────────────────────────────────────

export const acceptInvoiceInputSchema = z.object({
  idFactura: idFacturaSchema,
  saldoAceptado: z
    .number()
    .nonnegative()
    .describe("Accepted balance in the cta. cte. currency (usually the invoice total minus retenciones)."),
  codMoneda: z.string().default("PES").describe("Currency code (PES, DOL...)."),
  cotizacionMonedaUlt: z.number().positive().default(1),
  importeCancelado: z.number().nonnegative().optional(),
  importeTotalRetPesos: z.number().nonnegative().optional(),
  importeEmbargoPesos: z.number().nonnegative().optional(),
  tipoCancelacion: z.enum(["TOT", "PAR"]).optional(),
});

export type AcceptInvoiceInput = z.infer<typeof acceptInvoiceInputSchema>;

// ── rechazarFECred ──────────────────────────────────────────────

export const motivoRechazoSchema = z.object({
  codMotivo: z
    .number()
    .int()
    .positive()
    .describe("Rejection reason code (see consultarTiposMotivosRechazo in the AFIP manual)."),
  descMotivo: z.string().min(1).max(250),
  justificacion: z.string().min(1).max(250),
});

export const rejectInvoiceInputSchema = z.object({
  idFactura: idFacturaSchema,
  motivos: z.array(motivoRechazoSchema).min(1),
});

export type RejectInvoiceInput = z.infer<typeof rejectInvoiceInputSchema>;

/** Result of aceptarFECred / rechazarFECred (OperacionFECredReturnType). */
export interface OperacionFECredResult {
  /** "A" approved, "O" observed, "R" rejected by AFIP (per the WSDL's
   * ResultadoSimpleType enum). */
  resultado: "A" | "O" | "R";
  codCtaCte: number | null;
  observaciones: ReadonlyArray<CodigoDescripcion>;
  errors: ReadonlyArray<CodigoDescripcion>;
}

export interface FecredHealth {
  appServer: string;
  dbServer: string;
  authServer: string;
}
