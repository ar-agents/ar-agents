/**
 * SOAP envelope construction + parsing for WSFECred.
 *
 * Document/literal service. Namespace:
 *   `http://ar.gob.afip.wsfecred/FECredService/`
 *
 * IMPORTANT: the WSDL schema declares NO `elementFormDefault`, so it
 * defaults to "unqualified": only the top-level request element
 * carries the namespace prefix; child elements (authRequest, token,
 * cuitConsultada...) do NOT. Same convention as padron A13, the
 * OPPOSITE of wscdc.
 *
 * All element and field names below were verified against the live
 * WSDL (fwshomo.afip.gov.ar/wsfecred/FECredService?wsdl, fetched
 * 2026-06-12) and cross-checked against pyafipws/wsfecred.py.
 *
 * No SOAP library: string templating + regex parsing, same approach
 * as @ar-agents/wscdc.
 */
import type {
  AccessTicket,
  AcceptInvoiceInput,
  CheckObligationResult,
  CodigoDescripcion,
  FecredComprobante,
  FecredHealth,
  IdFactura,
  ListComprobantesInput,
  ListComprobantesResult,
  OperacionFECredResult,
  RejectInvoiceInput,
} from "./types";

const FECRED_NS = "http://ar.gob.afip.wsfecred/FECredService/";

/** Endpoints by env (soap:address from the WSDL; pyafipws WSDL list). */
export const FECRED_URLS: Record<"prod" | "homo", string> = {
  prod: "https://serviciosjava.afip.gob.ar/wsfecred/FECredService",
  homo: "https://fwshomo.afip.gov.ar/wsfecred/FECredService",
} as const;

/** SOAPAction header values per operation (verified from the WSDL
 * binding). */
export const FECRED_SOAP_ACTIONS = {
  dummy: `${FECRED_NS}dummy`,
  consultarMontoObligadoRecepcion: `${FECRED_NS}consultarMontoObligadoRecepcion`,
  consultarComprobantes: `${FECRED_NS}consultarComprobantes`,
  aceptarFECred: `${FECRED_NS}aceptarFECred`,
  rechazarFECred: `${FECRED_NS}rechazarFECred`,
} as const;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanCuit(cuit: string): string {
  return cuit.replace(/-/g, "");
}

function envelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fec="${FECRED_NS}">
  <soapenv:Body>
${body}
  </soapenv:Body>
</soapenv:Envelope>`;
}

function authBlock(ticket: AccessTicket): string {
  return `<authRequest>
        <token>${esc(ticket.token)}</token>
        <sign>${esc(ticket.sign)}</sign>
        <cuitRepresentada>${esc(cleanCuit(ticket.cuitRepresentada))}</cuitRepresentada>
      </authRequest>`;
}

function idFacturaBlock(id: IdFactura): string {
  return `<idCtaCte>
        <idFactura>
          <CUITEmisor>${esc(cleanCuit(id.cuitEmisor))}</CUITEmisor>
          <codTipoCmp>${id.codTipoCmp}</codTipoCmp>
          <ptoVta>${id.ptoVta}</ptoVta>
          <nroCmp>${id.nroCmp}</nroCmp>
        </idFactura>
      </idCtaCte>`;
}

// ── builders ────────────────────────────────────────────────────

export function buildDummyEnvelope(): string {
  // The WSDL's dummyRequest message has NO parts (empty body,
  // operation selected via the SOAPAction header).
  return envelope(``);
}

export function buildConsultarMontoObligadoEnvelope(args: {
  ticket: AccessTicket;
  cuitConsultada: string;
  fechaEmision: string;
}): string {
  return envelope(`    <fec:consultarMontoObligadoRecepcionRequest>
      ${authBlock(args.ticket)}
      <cuitConsultada>${esc(cleanCuit(args.cuitConsultada))}</cuitConsultada>
      <fechaEmision>${esc(args.fechaEmision)}</fechaEmision>
    </fec:consultarMontoObligadoRecepcionRequest>`);
}

export function buildConsultarComprobantesEnvelope(args: {
  ticket: AccessTicket;
  input: ListComprobantesInput;
}): string {
  const i = args.input;
  const parts: string[] = [authBlock(args.ticket)];
  // Element order follows the WSDL sequence: authRequest,
  // rolCUITRepresentada, CUITContraparte?, codTipoCmp?, estadoCmp?,
  // fecha?, codCtaCte?, estadoCtaCte?, nroPagina?
  parts.push(`<rolCUITRepresentada>${esc(i.rol)}</rolCUITRepresentada>`);
  if (i.cuitContraparte) {
    parts.push(`<CUITContraparte>${esc(cleanCuit(i.cuitContraparte))}</CUITContraparte>`);
  }
  if (i.codTipoCmp !== undefined) {
    parts.push(`<codTipoCmp>${i.codTipoCmp}</codTipoCmp>`);
  }
  if (i.estadoCmp) {
    parts.push(`<estadoCmp>${esc(i.estadoCmp)}</estadoCmp>`);
  }
  const desde = i.fechaDesde ?? "2019-01-01";
  const hasta = i.fechaHasta ?? new Date().toISOString().slice(0, 10);
  parts.push(`<fecha>
        <tipo>${esc(i.fechaTipo)}</tipo>
        <desde>${esc(desde)}</desde>
        <hasta>${esc(hasta)}</hasta>
      </fecha>`);
  if (i.nroPagina !== undefined) {
    parts.push(`<nroPagina>${i.nroPagina}</nroPagina>`);
  }
  return envelope(
    `    <fec:consultarComprobantesRequest>
      ${parts.join("\n      ")}
    </fec:consultarComprobantesRequest>`,
  );
}

export function buildAceptarEnvelope(args: {
  ticket: AccessTicket;
  input: AcceptInvoiceInput;
}): string {
  const i = args.input;
  const parts: string[] = [authBlock(args.ticket), idFacturaBlock(i.idFactura)];
  // WSDL sequence after idCtaCte: arrays (omitted in v0.1),
  // tipoCancelacion?, importeCancelado?, importeTotalRetPesos?,
  // importeEmbargoPesos?, saldoAceptado, codMoneda, cotizacionMonedaUlt
  if (i.tipoCancelacion) {
    parts.push(`<tipoCancelacion>${esc(i.tipoCancelacion)}</tipoCancelacion>`);
  }
  if (i.importeCancelado !== undefined) {
    parts.push(`<importeCancelado>${i.importeCancelado.toFixed(2)}</importeCancelado>`);
  }
  if (i.importeTotalRetPesos !== undefined) {
    parts.push(`<importeTotalRetPesos>${i.importeTotalRetPesos.toFixed(2)}</importeTotalRetPesos>`);
  }
  if (i.importeEmbargoPesos !== undefined) {
    parts.push(`<importeEmbargoPesos>${i.importeEmbargoPesos.toFixed(2)}</importeEmbargoPesos>`);
  }
  parts.push(`<saldoAceptado>${i.saldoAceptado.toFixed(2)}</saldoAceptado>`);
  parts.push(`<codMoneda>${esc(i.codMoneda)}</codMoneda>`);
  parts.push(`<cotizacionMonedaUlt>${i.cotizacionMonedaUlt}</cotizacionMonedaUlt>`);
  return envelope(
    `    <fec:aceptarFECredRequest>
      ${parts.join("\n      ")}
    </fec:aceptarFECredRequest>`,
  );
}

export function buildRechazarEnvelope(args: {
  ticket: AccessTicket;
  input: RejectInvoiceInput;
}): string {
  const i = args.input;
  const motivos = i.motivos
    .map(
      (m) => `<motivoRechazo>
          <codMotivo>${m.codMotivo}</codMotivo>
          <descMotivo>${esc(m.descMotivo)}</descMotivo>
          <justificacion>${esc(m.justificacion)}</justificacion>
        </motivoRechazo>`,
    )
    .join("\n        ");
  return envelope(
    `    <fec:rechazarFECredRequest>
      ${authBlock(args.ticket)}
      ${idFacturaBlock(i.idFactura)}
      <arrayMotivosRechazo>
        ${motivos}
      </arrayMotivosRechazo>
    </fec:rechazarFECredRequest>`,
  );
}

// ── parsers ─────────────────────────────────────────────────────

export class SoapFaultError extends Error {
  readonly faultCode: string;
  constructor(message: string, faultCode: string) {
    super(message);
    this.name = "SoapFaultError";
    this.faultCode = faultCode;
  }
}

function throwIfFault(xml: string): void {
  const faultMatch = /<(?:[A-Za-z0-9]+:)?Fault[\s>][\s\S]*?<\/(?:[A-Za-z0-9]+:)?Fault>/i.exec(xml);
  if (faultMatch) {
    const faultStr = /<faultstring>([\s\S]*?)<\/faultstring>/i.exec(faultMatch[0])?.[1] ?? "unknown";
    const faultCode = /<faultcode>([\s\S]*?)<\/faultcode>/i.exec(faultMatch[0])?.[1] ?? "";
    throw new SoapFaultError(faultStr.trim(), faultCode.trim());
  }
}

function extractTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(
    `<(?:[A-Za-z0-9]+:)?${tag}>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${tag}>`,
    "i",
  );
  return re.exec(xml)?.[1];
}

function extractBlock(xml: string, tag: string): string | undefined {
  return extractTag(xml, tag);
}

function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = Number.parseFloat(s.trim());
  return Number.isFinite(n) ? n : null;
}

function str(s: string | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

/** Parse <arrayErrores>/<arrayObservaciones>/<arrayObservacion> style
 * containers of codigoDescripcion items. */
function parseCodigoDescripcionArray(
  xml: string,
  containerTag: string,
): ReadonlyArray<CodigoDescripcion> {
  const block = extractBlock(xml, containerTag);
  if (!block) return [];
  const out: CodigoDescripcion[] = [];
  const itemRe =
    /<(?:[A-Za-z0-9]+:)?codigoDescripcion(?:String)?>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?codigoDescripcion(?:String)?>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(block)) !== null) {
    const seg = m[1] ?? "";
    const codStr = extractTag(seg, "codigo")?.trim();
    const cod = codStr ? Number.parseInt(codStr, 10) : NaN;
    const msg = extractTag(seg, "descripcion")?.trim() ?? "";
    out.push({ code: Number.isFinite(cod) ? cod : 0, msg });
  }
  return out;
}

export function parseDummyResponse(xml: string): FecredHealth {
  throwIfFault(xml);
  const block = extractBlock(xml, "dummyReturn") ?? "";
  // Note: WSFECred's dummy uses lowercase element names (appserver,
  // authserver, dbserver), unlike wscdc's AppServer.
  return {
    appServer: extractTag(block, "appserver")?.trim() ?? "unknown",
    dbServer: extractTag(block, "dbserver")?.trim() ?? "unknown",
    authServer: extractTag(block, "authserver")?.trim() ?? "unknown",
  };
}

export function parseConsultarMontoObligadoResponse(
  xml: string,
): CheckObligationResult {
  throwIfFault(xml);
  const block = extractBlock(xml, "consultarMontoObligadoRecepcionReturn");
  if (block === undefined) {
    throw new Error(
      "WSFECred: response missing consultarMontoObligadoRecepcionReturn",
    );
  }
  const obligado = extractTag(block, "obligado")?.trim();
  return {
    obligado: obligado === "S",
    montoDesde: num(extractTag(block, "montoDesde")),
    // The WSDL names this container `arrayObservacion` (singular) for
    // this operation specifically.
    observaciones: parseCodigoDescripcionArray(block, "arrayObservacion"),
    errors: parseCodigoDescripcionArray(block, "arrayErrores"),
  };
}

export function parseConsultarComprobantesResponse(
  xml: string,
): ListComprobantesResult {
  throwIfFault(xml);
  const block = extractBlock(xml, "consultarCmpReturn");
  if (block === undefined) {
    throw new Error("WSFECred: response missing consultarCmpReturn");
  }
  const comprobantes: FecredComprobante[] = [];
  const arr = extractBlock(block, "arrayComprobantes") ?? "";
  const itemRe =
    /<(?:[A-Za-z0-9]+:)?comprobante>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?comprobante>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(arr)) !== null) {
    const c = m[1] ?? "";
    // estado is a nested struct (EstadoCmpType):
    // <estado><estado>Recepcionado</estado><fechaHoraEstado>...</fechaHoraEstado></estado>
    // The lazy extractTag regex cannot handle same-name nesting, so
    // match the inner pair explicitly.
    const estadoNested =
      /<(?:[A-Za-z0-9]+:)?estado>\s*<(?:[A-Za-z0-9]+:)?estado>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?estado>\s*(?:<(?:[A-Za-z0-9]+:)?fechaHoraEstado>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?fechaHoraEstado>)?/i.exec(
        c,
      );
    comprobantes.push({
      cuitEmisor: extractTag(c, "cuitEmisor")?.trim() ?? "",
      razonSocialEmi: str(extractTag(c, "razonSocialEmi")),
      codTipoCmp: num(extractTag(c, "codTipoCmp")) ?? 0,
      ptoVta: num(extractTag(c, "ptovta")) ?? 0,
      nroCmp: num(extractTag(c, "nroCmp")) ?? 0,
      cuitReceptor: extractTag(c, "cuitReceptor")?.trim() ?? "",
      razonSocialRecep: str(extractTag(c, "razonSocialRecep")),
      codAutorizacion: str(extractTag(c, "codAutorizacion")),
      fechaEmision: str(extractTag(c, "fechaEmision")),
      fechaVenPago: str(extractTag(c, "fechaVenPago")),
      fechaVenAcep: str(extractTag(c, "fechaVenAcep")),
      importeTotal: num(extractTag(c, "importeTotal")),
      codMoneda: str(extractTag(c, "codMoneda")),
      cotizacionMoneda: num(extractTag(c, "cotizacionMoneda")),
      codCtaCte: num(extractTag(c, "codCtaCte")),
      estado: str(estadoNested?.[1]),
      fechaHoraEstado: str(estadoNested?.[2]),
    });
  }
  return {
    comprobantes,
    nroPagina: num(extractTag(block, "nroPagina")),
    hayMas: extractTag(block, "hayMas")?.trim() === "S",
    observaciones: parseCodigoDescripcionArray(block, "arrayObservaciones"),
    errors: parseCodigoDescripcionArray(block, "arrayErrores"),
  };
}

export function parseOperacionFECredResponse(
  xml: string,
): OperacionFECredResult {
  throwIfFault(xml);
  const block = extractBlock(xml, "operacionFECredReturn");
  if (block === undefined) {
    throw new Error("WSFECred: response missing operacionFECredReturn");
  }
  const resultado = extractTag(block, "resultado")?.trim() as
    | "A"
    | "O"
    | "R"
    | undefined;
  if (resultado !== "A" && resultado !== "O" && resultado !== "R") {
    throw new Error(
      `WSFECred: unexpected resultado value "${resultado ?? "(missing)"}"`,
    );
  }
  return {
    resultado,
    codCtaCte: num(extractTag(block, "codCtaCte")),
    observaciones: parseCodigoDescripcionArray(block, "arrayObservaciones"),
    errors: parseCodigoDescripcionArray(block, "arrayErrores"),
  };
}
