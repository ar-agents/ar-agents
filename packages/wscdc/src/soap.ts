/**
 * SOAP envelope construction + parsing for WSCDC.
 *
 * AFIP's WSCDC service speaks SOAP 1.1 over HTTP. The two operations
 * we wrap:
 *   - `Dummy()` → health check, returns AppServer/DbServer/AuthServer
 *     statuses.
 *   - `ComprobanteConstatar(req: CmpReq)` → returns a CmpResp with
 *     Resultado + Observaciones + Errors.
 *
 * Namespace: `http://ar.gov.afip.dif.wscdc/`
 *
 * The WSDL declares `elementFormDefault="qualified"`, so the child
 * elements DO carry the namespace prefix (unlike padron A13). Mind
 * the difference.
 *
 * We do NOT depend on a SOAP library — the envelopes are simple
 * enough that string templating + regex parsing is more robust than
 * pulling in a 600KB SOAP client. (This matches how AFIP's own
 * historical SDK distribution works.)
 */
import type {
  AccessTicket,
  ConstatarRequest,
  ConstatarResult,
  ConstatarObservacion,
} from "./types";

const WSCDC_NS = "http://ar.gov.afip.dif.wscdc/";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build the SOAP envelope for ComprobanteConstatar.
 *
 * Note on `impTotal` formatting: AFIP expects a decimal with at most
 * 2 fractional digits, period as separator (locale-invariant). We
 * use toFixed(2) explicitly so a caller passing `12100` gets "12100.00"
 * and a caller passing `12100.5` gets "12100.50".
 */
export function buildConstatarEnvelope(args: {
  ticket: AccessTicket;
  req: ConstatarRequest;
}): string {
  const { ticket, req } = args;
  const cuitEmisorClean = req.cuitEmisor.replace(/-/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:w="${WSCDC_NS}">
  <soap:Body>
    <w:ComprobanteConstatar>
      <w:Auth>
        <w:Token>${esc(ticket.token)}</w:Token>
        <w:Sign>${esc(ticket.sign)}</w:Sign>
        <w:Cuit>${esc(ticket.cuitRepresentada.replace(/-/g, ""))}</w:Cuit>
      </w:Auth>
      <w:CmpReq>
        <w:CbteModo>${esc(req.cbteModo)}</w:CbteModo>
        <w:CuitEmisor>${esc(cuitEmisorClean)}</w:CuitEmisor>
        <w:PtoVta>${req.ptoVta}</w:PtoVta>
        <w:CbteTipo>${req.cbteTipo}</w:CbteTipo>
        <w:CbteNro>${req.cbteNro}</w:CbteNro>
        <w:CbteFch>${esc(req.cbteFch)}</w:CbteFch>
        <w:ImpTotal>${req.impTotal.toFixed(2)}</w:ImpTotal>
        <w:CodAutorizacion>${esc(req.codAutorizacion)}</w:CodAutorizacion>
        <w:DocTipoReceptor>${req.docTipoReceptor}</w:DocTipoReceptor>
        <w:DocNroReceptor>${esc(req.docNroReceptor)}</w:DocNroReceptor>
      </w:CmpReq>
    </w:ComprobanteConstatar>
  </soap:Body>
</soap:Envelope>`;
}

export function buildDummyEnvelope(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:w="${WSCDC_NS}">
  <soap:Body><w:Dummy/></soap:Body>
</soap:Envelope>`;
}

/**
 * Parse the SOAP response. Returns either a ConstatarResult or throws
 * if the response is malformed / a SOAP fault.
 */
export function parseConstatarResponse(xml: string): ConstatarResult {
  // Detect soap:Fault first — these are the AFIP "your TA is expired"
  // class of failures and should bubble up as protocol errors via the
  // caller (HttpWscdcAdapter). Here we throw a plain Error; the
  // adapter translates to WscdcProtocolError.
  const faultMatch = /<soap:Fault[\s\S]*?<\/soap:Fault>/i.exec(xml);
  if (faultMatch) {
    const faultStr = /<faultstring>([\s\S]*?)<\/faultstring>/i.exec(faultMatch[0])?.[1] ?? "unknown";
    const faultCode = /<faultcode>([\s\S]*?)<\/faultcode>/i.exec(faultMatch[0])?.[1] ?? "";
    throw new SoapFaultError(faultStr.trim(), faultCode.trim());
  }

  // The response wraps the actual payload in
  // <ComprobanteConstatarResponse><ComprobanteConstatarResult>...
  // The Resultado/FchProceso fields live directly under
  // ComprobanteConstatarResult. Observaciones + Errors are
  // optional arrays of CodDescr structs.
  const resultBlock = /<ComprobanteConstatarResult>([\s\S]*?)<\/ComprobanteConstatarResult>/i.exec(xml);
  if (!resultBlock) {
    throw new Error("WSCDC: response missing ComprobanteConstatarResult");
  }
  const inner = resultBlock[1] ?? "";
  const resultado = extractTag(inner, "Resultado")?.trim() as
    | "A"
    | "N"
    | "O"
    | undefined;
  if (resultado !== "A" && resultado !== "N" && resultado !== "O") {
    throw new Error(
      `WSCDC: unexpected Resultado value "${resultado ?? "(missing)"}"`,
    );
  }
  const fchProceso = extractTag(inner, "FchProceso")?.trim();
  return {
    resultado,
    observaciones: parseObsArray(inner, "Observaciones"),
    errors: parseObsArray(inner, "Errors"),
    ...(fchProceso ? { fchProceso } : {}),
  };
}

/**
 * Parse the SOAP response of Dummy().
 */
export function parseDummyResponse(xml: string): {
  appServer: string;
  dbServer: string;
  authServer: string;
} {
  const block = /<DummyResult>([\s\S]*?)<\/DummyResult>/i.exec(xml);
  const inner = block?.[1] ?? "";
  return {
    appServer: extractTag(inner, "AppServer")?.trim() ?? "unknown",
    dbServer: extractTag(inner, "DbServer")?.trim() ?? "unknown",
    authServer: extractTag(inner, "AuthServer")?.trim() ?? "unknown",
  };
}

export class SoapFaultError extends Error {
  readonly faultCode: string;
  constructor(message: string, faultCode: string) {
    super(message);
    this.name = "SoapFaultError";
    this.faultCode = faultCode;
  }
}

function extractTag(xml: string, tag: string): string | undefined {
  // Tag may carry a namespace prefix in the response. Match either
  // form: <Resultado>...</Resultado> or <w:Resultado>...</w:Resultado>.
  const re = new RegExp(
    `<(?:[A-Za-z0-9]+:)?${tag}>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${tag}>`,
    "i",
  );
  return re.exec(xml)?.[1];
}

function parseObsArray(
  xml: string,
  containerTag: string,
): ReadonlyArray<ConstatarObservacion> {
  const block = new RegExp(
    `<(?:[A-Za-z0-9]+:)?${containerTag}>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${containerTag}>`,
    "i",
  ).exec(xml);
  if (!block) return [];
  const inner = block[1] ?? "";
  const out: ConstatarObservacion[] = [];
  const itemRe =
    /<(?:[A-Za-z0-9]+:)?CodDescr>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?CodDescr>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(inner)) !== null) {
    const seg = m[1] ?? "";
    const codStr = extractTag(seg, "Code")?.trim();
    const cod = codStr ? Number.parseInt(codStr, 10) : NaN;
    const msg = extractTag(seg, "Msg")?.trim() ?? "";
    if (Number.isFinite(cod)) {
      out.push({ code: cod, msg });
    }
  }
  return out;
}

/** Endpoints by env. */
export const WSCDC_URLS: Record<"prod" | "homo", string> = {
  prod: "https://servicios1.afip.gov.ar/wscdc/service.asmx",
  homo: "https://wswhomo.afip.gov.ar/wscdc/service.asmx",
} as const;

/** SOAP action header values, also per operation. */
export const WSCDC_SOAP_ACTIONS = {
  comprobanteConstatar: "http://ar.gov.afip.dif.wscdc/ComprobanteConstatar",
  dummy: "http://ar.gov.afip.dif.wscdc/Dummy",
} as const;
