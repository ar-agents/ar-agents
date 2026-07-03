/**
 * AFIP/ARCA WSFE (Web Service de Factura Electrónica) operations.
 *
 * These build SOAP envelopes, POST them to AFIP, and parse the responses.
 * Reuses `fetchWithRetry` from `@ar-agents/identity/wsaa` for production
 * robustez (timeout / retry / SOAP-fault detection / observability hook).
 *
 * # Endpoints
 *
 * - **Producción**: `https://servicios1.afip.gov.ar/wsfev1/service.asmx`
 * - **Homologación**: `https://wswhomo.afip.gov.ar/wsfev1/service.asmx`
 *
 * # WSDL targetNamespace
 *
 * `http://ar.gov.afip.dif.FEV1/` — note: SOAPAction headers must include the
 * full operation name (e.g., `"http://ar.gov.afip.dif.FEV1/FECAESolicitar"`).
 *
 * # Service authorization
 *
 * The `wsfe` service must be authorized in your ARCA panel:
 * "Administrador de Relaciones de Clave Fiscal" → "Nueva Relación" →
 * "AFIP" → "WebServices" → "Servicio Web de Facturación Electrónica" →
 * select your alias. Once authorized, the same X.509 cert that powers
 * `@ar-agents/identity` works against WSFE too.
 */

import type { AccessTicket } from "@ar-agents/identity/wsaa";
import { fetchWithRetry } from "@ar-agents/identity/wsaa";
import type {
  ConsultarComprobanteResult,
  DummyResult,
  IvaItem,
  SolicitarCaeInput,
  SolicitarCaeResult,
  TributoItem,
  UltimoComprobanteResult,
  WsfeEnv,
  WsfeError,
  WsfeEvento,
  WsfeObservacion,
} from "./types";
import type { CbteTipoCode, DocTipoCode } from "./catalogs";
import { WsfeValidationError } from "./errors";

export const WSFE_SERVICE_NAME = "wsfe" as const;

const WSFE_URLS: Record<WsfeEnv, string> = {
  homo: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  prod: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
};

const NS = "http://ar.gov.afip.dif.FEV1/";

interface CommonRequestOptions {
  ta: AccessTicket;
  env: WsfeEnv;
  cuit: string;
  endpointOverride?: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  maxRetries?: number;
  onCall?: (event: {
    label: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
  }) => void;
}

/**
 * Build a SOAP envelope with the standard AFIP `<Auth>` block and a single
 * operation body element.
 */
function buildEnvelope(
  operation: string,
  authBlock: string,
  body: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fev1="${NS}">
  <soapenv:Body>
    <fev1:${operation}>
      ${authBlock}
      ${body}
    </fev1:${operation}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function authBlock(ta: AccessTicket, cuit: string): string {
  return `<fev1:Auth>
        <fev1:Token>${escapeXml(ta.token)}</fev1:Token>
        <fev1:Sign>${escapeXml(ta.sign)}</fev1:Sign>
        <fev1:Cuit>${escapeXml(cuit)}</fev1:Cuit>
      </fev1:Auth>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function callWsfe(
  operation: string,
  body: string,
  opts: CommonRequestOptions,
  label: string,
): Promise<string> {
  const url = opts.endpointOverride ?? WSFE_URLS[opts.env];
  const envelope = buildEnvelope(operation, authBlock(opts.ta, opts.cuit), body);
  const fetchOptions: Parameters<typeof fetchWithRetry>[0] = {
    url,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `${NS}${operation}`,
      },
      body: envelope,
    },
    label,
    ...(opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.requestTimeoutMs !== undefined
      ? { requestTimeoutMs: opts.requestTimeoutMs }
      : {}),
    ...(opts.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : {}),
    ...(opts.onCall !== undefined ? { onCall: opts.onCall } : {}),
  };
  return fetchWithRetry(fetchOptions);
}

// ============================================================================
// Tag extraction helpers — WSFE returns XML, not JSON. We parse with regexes
// rather than pulling in an XML lib (xml2js etc.) to keep the bundle lean.
// AFIP responses are well-formed and predictable — `<Tag>value</Tag>` always.
// ============================================================================

function extractTag(xml: string, tag: string): string | null {
  // Match either <Tag>value</Tag> or <ns:Tag>value</ns:Tag>
  const re = new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`);
  const m = xml.match(re);
  return m && m[1] !== undefined ? m[1] : null;
}

function extractTagAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "g");
  const out: string[] = [];
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}

function extractNumber(xml: string, tag: string): number {
  const v = extractTag(xml, tag);
  if (v === null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function extractObservaciones(xml: string): WsfeObservacion[] {
  const obsBlock = extractTag(xml, "Observaciones");
  if (!obsBlock) return [];
  return extractTagAll(obsBlock, "Obs").map((o) => ({
    code: extractNumber(o, "Code"),
    msg: decodeXml(extractTag(o, "Msg") ?? ""),
  }));
}

function extractErrors(xml: string): WsfeError[] {
  const errBlock = extractTag(xml, "Errors");
  if (!errBlock) return [];
  return extractTagAll(errBlock, "Err").map((e) => ({
    code: extractNumber(e, "Code"),
    msg: decodeXml(extractTag(e, "Msg") ?? ""),
  }));
}

function extractEventos(xml: string): WsfeEvento[] {
  const evBlock = extractTag(xml, "Events");
  if (!evBlock) return [];
  return extractTagAll(evBlock, "Evt").map((e) => ({
    code: extractNumber(e, "Code"),
    msg: decodeXml(extractTag(e, "Msg") ?? ""),
  }));
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function checkSoapFault(xml: string): void {
  const fault = extractTag(xml, "faultstring");
  if (fault) {
    throw new Error(`WSFE SOAP Fault: ${decodeXml(fault)}`);
  }
}

// ============================================================================
// Operations
// ============================================================================

/**
 * Health check. Returns the status of AFIP's app/db/auth servers.
 * Should return all "OK" when WSFE is up. Use for /health endpoints and as
 * a pre-emission gate when you want to fail fast.
 *
 * Doesn't require auth — but the operation still needs CUIT in the SOAP body
 * per AFIP's WSDL contract (we send it through `callWsfe`).
 */
export async function dummy(opts: CommonRequestOptions): Promise<DummyResult> {
  const xml = await callWsfe("FEDummy", "", opts, "wsfe.dummy");
  checkSoapFault(xml);
  return {
    appServer: extractTag(xml, "AppServer") ?? "?",
    dbServer: extractTag(xml, "DbServer") ?? "?",
    authServer: extractTag(xml, "AuthServer") ?? "?",
  };
}

/**
 * Returns the last authorized comprobante number for a (PtoVta, CbteTipo)
 * pair. Returns 0 when no comprobante has ever been authorized — your next
 * emission then uses `cbteDesde: 1`.
 *
 * # Common usage
 * ```ts
 * const last = await consultarUltimoAutorizado({
 *   ta, env, cuit,
 *   ptoVta: 1, cbteTipo: CbteTipo.FACTURA_C
 * });
 * const next = last.cbteNro + 1;
 * await solicitarCAE({ ..., cbteDesde: next, cbteHasta: next });
 * ```
 */
export async function consultarUltimoAutorizado(
  opts: CommonRequestOptions & {
    ptoVta: number;
    cbteTipo: CbteTipoCode;
  },
): Promise<UltimoComprobanteResult> {
  const body = `<fev1:PtoVta>${opts.ptoVta}</fev1:PtoVta>
      <fev1:CbteTipo>${opts.cbteTipo}</fev1:CbteTipo>`;
  const xml = await callWsfe(
    "FECompUltimoAutorizado",
    body,
    opts,
    "wsfe.ultimoAutorizado",
  );
  checkSoapFault(xml);

  const errors = extractErrors(xml);
  if (errors.length > 0) {
    throw new Error(
      `WSFE FECompUltimoAutorizado errors: ${errors.map((e) => `[${e.code}] ${e.msg}`).join("; ")}`,
    );
  }

  return {
    ptoVta: extractNumber(xml, "PtoVta"),
    cbteTipo: extractNumber(xml, "CbteTipo") as CbteTipoCode,
    cbteNro: extractNumber(xml, "CbteNro"),
  };
}

/**
 * Look up the full details of a previously-authorized comprobante. Use this
 * to verify a CAE is valid and matches the data you have on record (e.g.,
 * after migrating from another system).
 */
export async function consultarComprobante(
  opts: CommonRequestOptions & {
    ptoVta: number;
    cbteTipo: CbteTipoCode;
    cbteNro: number;
  },
): Promise<ConsultarComprobanteResult> {
  const body = `<fev1:FeCompConsReq>
        <fev1:CbteTipo>${opts.cbteTipo}</fev1:CbteTipo>
        <fev1:CbteNro>${opts.cbteNro}</fev1:CbteNro>
        <fev1:PtoVta>${opts.ptoVta}</fev1:PtoVta>
      </fev1:FeCompConsReq>`;
  const xml = await callWsfe(
    "FECompConsultar",
    body,
    opts,
    "wsfe.consultarComprobante",
  );
  checkSoapFault(xml);

  const errors = extractErrors(xml);
  if (errors.length > 0) {
    return {
      found: false,
      ptoVta: opts.ptoVta,
      cbteTipo: opts.cbteTipo,
      cbteDesde: 0,
      cbteHasta: 0,
      cbteFch: "",
      cae: "",
      caeFchVto: "",
      resultado: "R",
      emisionTipo: "",
      docTipo: 0 as DocTipoCode,
      docNro: "",
      impTotal: 0,
      impNeto: 0,
      impIVA: 0,
      observaciones: errors,
    };
  }

  const result = extractTag(xml, "ResultGet") ?? xml;
  return {
    found: true,
    ptoVta: extractNumber(result, "PtoVta"),
    cbteTipo: extractNumber(result, "CbteTipo") as CbteTipoCode,
    cbteDesde: extractNumber(result, "CbteDesde"),
    cbteHasta: extractNumber(result, "CbteHasta"),
    cbteFch: extractTag(result, "CbteFch") ?? "",
    cae: extractTag(result, "CodAutorizacion") ?? "",
    caeFchVto: extractTag(result, "FchVto") ?? "",
    resultado: (extractTag(result, "Resultado") ?? "R") as "A" | "R" | "P",
    emisionTipo: extractTag(result, "EmisionTipo") ?? "",
    docTipo: extractNumber(result, "DocTipo") as DocTipoCode,
    docNro: extractTag(result, "DocNro") ?? "",
    impTotal: extractNumber(result, "ImpTotal"),
    impNeto: extractNumber(result, "ImpNeto"),
    impIVA: extractNumber(result, "ImpIVA"),
    observaciones: extractObservaciones(result),
  };
}

/**
 * Build the IVA block XML. Returns empty string when no items.
 */
function buildIvaBlock(iva?: IvaItem[]): string {
  if (!iva || iva.length === 0) return "";
  const items = iva
    .map(
      (i) => `<fev1:AlicIva>
                <fev1:Id>${i.id}</fev1:Id>
                <fev1:BaseImp>${formatAmount(i.baseImp)}</fev1:BaseImp>
                <fev1:Importe>${formatAmount(i.importe)}</fev1:Importe>
              </fev1:AlicIva>`,
    )
    .join("\n            ");
  return `<fev1:Iva>
            ${items}
          </fev1:Iva>`;
}

function buildTributosBlock(tributos?: TributoItem[]): string {
  if (!tributos || tributos.length === 0) return "";
  const items = tributos
    .map(
      (t) => `<fev1:Tributo>
                <fev1:Id>${t.id}</fev1:Id>
                <fev1:Desc>${escapeXml(t.desc)}</fev1:Desc>
                <fev1:BaseImp>${formatAmount(t.baseImp)}</fev1:BaseImp>
                <fev1:Alic>${formatAmount(t.alic)}</fev1:Alic>
                <fev1:Importe>${formatAmount(t.importe)}</fev1:Importe>
              </fev1:Tributo>`,
    )
    .join("\n            ");
  return `<fev1:Tributos>
            ${items}
          </fev1:Tributos>`;
}

function formatAmount(n: number): string {
  // AFIP wants 2-decimal precision for monetary fields; some allow 6 but 2
  // is the universal safe choice and matches what end-user invoices show.
  return n.toFixed(2);
}

/**
 * Solicit a CAE (Código de Autorización Electrónico) for a single
 * comprobante. The PRIMARY emission entrypoint — use this to authorize a
 * Factura A/B/C, Nota de Débito, or Nota de Crédito.
 *
 * # Pre-flight checklist
 *
 * 1. `cbteDesde` = `consultarUltimoAutorizado() + 1` (or 1 for first emission).
 * 2. `impTotal` MUST equal `impTotConc + impNeto + impIVA + impOpEx + impTrib`.
 *    AFIP rejects with code 10048 if it doesn't.
 * 3. For Factura C (monotributista): `impIVA = 0` and `iva` must be empty.
 *    For Factura A/B: include at least one `iva` row.
 * 4. For `concepto = SERVICIOS` or `PRODUCTOS_Y_SERVICIOS`: include
 *    `fchServDesde`, `fchServHasta`, `fchVtoPago`.
 * 5. For Nota de Crédito/Débito: include `cbtesAsoc` referencing the original.
 * 6. `cbteFch` must be within ±5 days of today (servicios: ±10).
 *
 * # On rejection (`resultado: "R"`)
 *
 * Inspect `errors` (top-level request issues) and `observaciones` (per-detail
 * issues). The most common rejection codes are documented in `AGENTS.md`.
 */
/**
 * Defense-in-depth: assert every numeric field that lands in the CAE XML is a
 * finite number *before* we build the envelope. The Zod tool wrapper already
 * enforces this, but non-tool callers (WsfeClient.solicitarCAE and the raw
 * `solicitarCAE` export) bypass Zod — a crafted non-number (NaN/Infinity/a
 * string) would otherwise be interpolated straight into the fiscal document.
 * Throws WsfeValidationError so it never reaches AFIP.
 */
function assertFiniteCaeNumbers(input: SolicitarCaeInput): void {
  const numericFields: [string, unknown][] = [
    ["ptoVta", input.ptoVta],
    ["cbteTipo", input.cbteTipo],
    ["docTipo", input.docTipo],
    ["cbteDesde", input.cbteDesde],
    ["cbteHasta", input.cbteHasta],
    ["impTotal", input.impTotal],
    ["impNeto", input.impNeto],
    ["impIVA", input.impIVA],
    ["impTotConc", input.impTotConc],
    ["impOpEx", input.impOpEx],
    ["impTrib", input.impTrib],
    ["monCotiz", input.monCotiz],
  ];
  const bad = numericFields.filter(
    ([, v]) => v !== undefined && (typeof v !== "number" || !Number.isFinite(v)),
  );
  // docNro is string|number by contract; only reject a numeric-but-non-finite
  // value (a string docNro is escaped downstream, so it's XML-safe as-is).
  if (typeof input.docNro === "number" && !Number.isFinite(input.docNro)) {
    bad.push(["docNro", input.docNro]);
  }
  if (bad.length > 0) {
    throw new WsfeValidationError(
      `Campos numéricos inválidos en solicitarCAE (deben ser números finitos): ${bad
        .map(([f, v]) => `${f}=${String(v)}`)
        .join(", ")}`,
    );
  }
}

export async function solicitarCAE(
  opts: CommonRequestOptions & SolicitarCaeInput,
): Promise<SolicitarCaeResult> {
  assertFiniteCaeNumbers(opts);

  const cantReg = opts.cbteHasta - opts.cbteDesde + 1;

  // AFIP RG 5616: <CondicionIVAReceptorId> is mandatory (rejection obs
  // 10246 if absent). Derive a safe default when the caller didn't pass
  // one — Consumidor Final for DocTipo 99, otherwise Responsable Inscripto
  // — so pre-RG-5616 callers keep working; pass it explicitly otherwise.
  const condicionIvaReceptorId =
    opts.condicionIvaReceptorId ?? (Number(opts.docTipo) === 99 ? 5 : 1);

  const optServiceDates =
    opts.fchServDesde && opts.fchServHasta && opts.fchVtoPago
      ? `<fev1:FchServDesde>${escapeXml(opts.fchServDesde)}</fev1:FchServDesde>
              <fev1:FchServHasta>${escapeXml(opts.fchServHasta)}</fev1:FchServHasta>
              <fev1:FchVtoPago>${escapeXml(opts.fchVtoPago)}</fev1:FchVtoPago>`
      : "";

  const optAsoc =
    opts.cbtesAsoc && opts.cbtesAsoc.length > 0
      ? `<fev1:CbtesAsoc>
              ${opts.cbtesAsoc
                .map(
                  (c) => `<fev1:CbteAsoc>
                <fev1:Tipo>${c.tipo}</fev1:Tipo>
                <fev1:PtoVta>${c.ptoVta}</fev1:PtoVta>
                <fev1:Nro>${c.nro}</fev1:Nro>${c.cuit ? `\n                <fev1:Cuit>${escapeXml(c.cuit)}</fev1:Cuit>` : ""}${c.fecha ? `\n                <fev1:CbteFch>${escapeXml(c.fecha)}</fev1:CbteFch>` : ""}
              </fev1:CbteAsoc>`,
                )
                .join("\n              ")}
            </fev1:CbtesAsoc>`
      : "";

  const optOpcionales =
    opts.opcionales && opts.opcionales.length > 0
      ? `<fev1:Opcionales>
              ${opts.opcionales
                .map(
                  (o) => `<fev1:Opcional>
                <fev1:Id>${escapeXml(o.id)}</fev1:Id>
                <fev1:Valor>${escapeXml(o.valor)}</fev1:Valor>
              </fev1:Opcional>`,
                )
                .join("\n              ")}
            </fev1:Opcionales>`
      : "";

  const body = `<fev1:FeCAEReq>
        <fev1:FeCabReq>
          <fev1:CantReg>${cantReg}</fev1:CantReg>
          <fev1:PtoVta>${opts.ptoVta}</fev1:PtoVta>
          <fev1:CbteTipo>${opts.cbteTipo}</fev1:CbteTipo>
        </fev1:FeCabReq>
        <fev1:FeDetReq>
          <fev1:FECAEDetRequest>
            <fev1:Concepto>${opts.concepto}</fev1:Concepto>
            <fev1:DocTipo>${opts.docTipo}</fev1:DocTipo>
            <fev1:DocNro>${escapeXml(String(opts.docNro))}</fev1:DocNro>
            <fev1:CbteDesde>${opts.cbteDesde}</fev1:CbteDesde>
            <fev1:CbteHasta>${opts.cbteHasta}</fev1:CbteHasta>
            <fev1:CbteFch>${escapeXml(opts.cbteFch)}</fev1:CbteFch>
            <fev1:ImpTotal>${formatAmount(opts.impTotal)}</fev1:ImpTotal>
            <fev1:ImpTotConc>${formatAmount(opts.impTotConc ?? 0)}</fev1:ImpTotConc>
            <fev1:ImpNeto>${formatAmount(opts.impNeto)}</fev1:ImpNeto>
            <fev1:ImpOpEx>${formatAmount(opts.impOpEx ?? 0)}</fev1:ImpOpEx>
            <fev1:ImpTrib>${formatAmount(opts.impTrib ?? 0)}</fev1:ImpTrib>
            <fev1:ImpIVA>${formatAmount(opts.impIVA)}</fev1:ImpIVA>
            ${optServiceDates}
            <fev1:MonId>${escapeXml(opts.monId ?? "PES")}</fev1:MonId>
            <fev1:MonCotiz>${formatAmount(opts.monCotiz ?? 1)}</fev1:MonCotiz>
            <fev1:CondicionIVAReceptorId>${condicionIvaReceptorId}</fev1:CondicionIVAReceptorId>
            ${buildTributosBlock(opts.tributos)}
            ${buildIvaBlock(opts.iva)}
            ${optAsoc}
            ${optOpcionales}
          </fev1:FECAEDetRequest>
        </fev1:FeDetReq>
      </fev1:FeCAEReq>`;

  // FECAESolicitar is NON-IDEMPOTENT: it authorizes a fiscal comprobante
  // number. A retry after an AFIP timeout that happened *post-authorization*
  // would emit a duplicate (or surface a false failure while N is legally
  // authorized). Force maxRetries=0 for this call specifically — read ops
  // (FECompUltimoAutorizado, catalogs, dummy) keep their configured retries.
  const xml = await callWsfe(
    "FECAESolicitar",
    body,
    { ...opts, maxRetries: 0 },
    "wsfe.solicitarCAE",
  );
  checkSoapFault(xml);

  const errors = extractErrors(xml);
  const eventos = extractEventos(xml);
  const detResp = extractTag(xml, "FECAEDetResponse") ?? xml;
  const resultado = (extractTag(xml, "Resultado") ??
    "R") as SolicitarCaeResult["resultado"];

  return {
    resultado,
    cae: extractTag(detResp, "CAE") || null,
    caeFchVto: extractTag(detResp, "CAEFchVto") || null,
    ptoVta: extractNumber(xml, "PtoVta"),
    cbteTipo: extractNumber(xml, "CbteTipo") as CbteTipoCode,
    cbteDesde: extractNumber(detResp, "CbteDesde"),
    cbteHasta: extractNumber(detResp, "CbteHasta"),
    cbteFch: extractTag(detResp, "CbteFch") ?? "",
    fchProceso: extractTag(xml, "FchProceso") ?? "",
    observaciones: extractObservaciones(detResp),
    errors,
    eventos,
  };
}

// ============================================================================
// Catalog operations — live AFIP catalogs
// ============================================================================

export interface CatalogItem {
  id: number | string;
  desc: string;
  fchDesde?: string;
  fchHasta?: string;
}

async function getCatalog(
  operation: string,
  opts: CommonRequestOptions,
  itemTag: string,
): Promise<CatalogItem[]> {
  const xml = await callWsfe(operation, "", opts, `wsfe.${operation}`);
  checkSoapFault(xml);
  const result =
    extractTag(xml, "ResultGet") ?? extractTag(xml, "ResultGetResponse") ?? xml;
  return extractTagAll(result, itemTag).map((item) => {
    const fchDesde = extractTag(item, "FchDesde");
    const fchHasta = extractTag(item, "FchHasta");
    return {
      id: extractTag(item, "Id") ?? "",
      desc: decodeXml(extractTag(item, "Desc") ?? ""),
      ...(fchDesde !== null ? { fchDesde } : {}),
      ...(fchHasta !== null ? { fchHasta } : {}),
    };
  });
}

/** Get the live AFIP comprobante-types catalog. */
export async function getTiposCbte(
  opts: CommonRequestOptions,
): Promise<CatalogItem[]> {
  return getCatalog("FEParamGetTiposCbte", opts, "CbteTipo");
}

/** Get the live AFIP document-types catalog. */
export async function getTiposDoc(
  opts: CommonRequestOptions,
): Promise<CatalogItem[]> {
  return getCatalog("FEParamGetTiposDoc", opts, "DocTipo");
}

/** Get the live AFIP IVA-rates catalog. */
export async function getTiposIva(
  opts: CommonRequestOptions,
): Promise<CatalogItem[]> {
  return getCatalog("FEParamGetTiposIva", opts, "IvaTipo");
}

/** Get the live AFIP concepto catalog (Productos / Servicios / both). */
export async function getTiposConcepto(
  opts: CommonRequestOptions,
): Promise<CatalogItem[]> {
  return getCatalog("FEParamGetTiposConcepto", opts, "ConceptoTipo");
}

/** Get the live AFIP currencies catalog. */
export async function getTiposMonedas(
  opts: CommonRequestOptions,
): Promise<CatalogItem[]> {
  return getCatalog("FEParamGetTiposMonedas", opts, "Moneda");
}

/**
 * Get the AFIP-published exchange rate for a foreign currency vs ARS.
 * Required when emitting Factura E or any multi-currency invoice.
 */
export async function getCotizacion(
  opts: CommonRequestOptions & { monId: string },
): Promise<{ monId: string; cotiz: number; fchCotiz: string }> {
  const body = `<fev1:MonId>${escapeXml(opts.monId)}</fev1:MonId>`;
  const xml = await callWsfe(
    "FEParamGetCotizacion",
    body,
    opts,
    "wsfe.getCotizacion",
  );
  checkSoapFault(xml);
  return {
    monId: extractTag(xml, "MonId") ?? opts.monId,
    cotiz: extractNumber(xml, "MonCotiz"),
    fchCotiz: extractTag(xml, "FchCotiz") ?? "",
  };
}
