import { fetchWithRetry, type AccessTicket, type AfipEnv } from "./wsaa";
import type { AfipPadronData } from "./types";
import { sanitizeAfipData, sanitizeRegistryText } from "./sanitize";

/**
 * AFIP padrón webservice client. Two related services live behind almost the
 * same SOAP shape; this module supports both:
 *
 * - `ws_sr_constancia_inscripcion` (default, recommended) — full constancia:
 *   datos generales + monotributo (categoría) + régimen general (impuestos
 *   asociados, including IVA). Endpoint: `/sr-padron/webservices/personaServiceA5`.
 *
 * - `ws_sr_padron_a13` — datos generales only: nombre, domicilio, actividad
 *   principal. NO monotributo, NO IVA condition. Lighter, no separate AFIP
 *   authorization needed if you already have A13. Endpoint:
 *   `/sr-padron/webservices/personaServiceA13`.
 *
 * # Service surface
 *
 * Both services expose a single useful operation: `getPersona`. Request shape
 * is identical: `token`, `sign`, `cuitRepresentada`, `idPersona`. Response
 * shape differs (see `parseGetPersonaResponse`).
 *
 * # Authorization
 *
 * Each service must be separately authorized via Clave Fiscal "Administrador
 * de Relaciones" → "Nueva Relación" → AFIP → WebServices → pick the service →
 * representante = your alias (Computador Fiscal). The same X.509 cert can be
 * authorized for both.
 *
 * # WSDL details
 *
 * - constancia (uses A5 endpoint): targetNamespace `http://a5.soap.ws.server.puc.sr/`
 * - A13: targetNamespace `http://a13.soap.ws.server.puc.sr/`
 * - Both use `elementFormDefault="unqualified"` — child elements (token,
 *   sign, cuitRepresentada, idPersona) are NOT namespace-prefixed; only the
 *   root operation element gets the prefix.
 */

/** AFIP service name. Pick based on what data you need. */
export type AfipPadronService =
  | "ws_sr_constancia_inscripcion"
  | "ws_sr_padron_a13";

export const CONSTANCIA_INSCRIPCION_SERVICE_NAME = "ws_sr_constancia_inscripcion" as const;
export const PADRON_A13_SERVICE_NAME = "ws_sr_padron_a13" as const;

/**
 * Default service name. Constancia is preferred because it returns more data
 * (monotributo + IVA condition).
 *
 * @deprecated Renamed for clarity — use `CONSTANCIA_INSCRIPCION_SERVICE_NAME`
 *   or `PADRON_A13_SERVICE_NAME` explicitly. This export remains for
 *   backwards compatibility with v0.3.x callers.
 */
export const WSCDC_SERVICE_NAME = CONSTANCIA_INSCRIPCION_SERVICE_NAME;

/**
 * URL pattern: `personaServiceA5` is shared between A5 (deprecated for new
 * authorizations) and `ws_sr_constancia_inscripcion` — the TA service name in
 * the access ticket determines the response shape, not the endpoint URL.
 */
const SERVICE_URLS: Record<
  AfipPadronService,
  Record<AfipEnv, string>
> = {
  ws_sr_constancia_inscripcion: {
    homo: "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5",
    prod: "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5",
  },
  ws_sr_padron_a13: {
    homo: "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13",
    prod: "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13",
  },
};

const SERVICE_NAMESPACES: Record<AfipPadronService, { prefix: string; uri: string }> = {
  ws_sr_constancia_inscripcion: {
    prefix: "a5",
    uri: "http://a5.soap.ws.server.puc.sr/",
  },
  ws_sr_padron_a13: {
    prefix: "a13",
    uri: "http://a13.soap.ws.server.puc.sr/",
  },
};

/**
 * Build the SOAP envelope for `getPersona`. Auth comes from the TA token +
 * sign; CUIT representado is the CUIT whose cert authenticated us.
 *
 * @internal
 */
export function buildGetPersonaSoap(params: {
  ta: AccessTicket;
  cuitRepresentado: string;
  cuitToQuery: string;
  service?: AfipPadronService;
}): string {
  const service = params.service ?? CONSTANCIA_INSCRIPCION_SERVICE_NAME;
  const { prefix, uri } = SERVICE_NAMESPACES[service];
  // CUIT fields MUST be exactly 11 digits. Validate before building the envelope
  // so a malformed/hostile value can't break out of the XML context (SOAP
  // injection); escapeXml below is defense-in-depth.
  for (const [field, value] of [
    ["cuitRepresentado", params.cuitRepresentado],
    ["cuitToQuery", params.cuitToQuery],
  ] as const) {
    if (!/^\d{11}$/.test(value)) {
      throw new Error(
        `buildGetPersonaSoap: ${field} must be exactly 11 digits (CUIT), got ${JSON.stringify(value).slice(0, 40)}.`,
      );
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:${prefix}="${uri}">
  <soapenv:Header/>
  <soapenv:Body>
    <${prefix}:getPersona>
      <token>${escapeXml(params.ta.token)}</token>
      <sign>${escapeXml(params.ta.sign)}</sign>
      <cuitRepresentada>${escapeXml(params.cuitRepresentado)}</cuitRepresentada>
      <idPersona>${escapeXml(params.cuitToQuery)}</idPersona>
    </${prefix}:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Extract a single tag's text content from an XML string. Used because the
 * response XML is small + we don't want to drag a full XML parser into the
 * lib bundle.
 *
 * @internal
 */
function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1]!.trim() : null;
}

/**
 * Extract every occurrence of a tag's text content as an array.
 *
 * @internal
 */
function extractAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]!.trim());
  }
  return out;
}

/**
 * Extract every block of a tag's full content as an array (preserves nested
 * structure). Used for repeated blocks like multiple <domicilio> or <impuesto>.
 *
 * @internal
 */
function extractAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]!.trim());
  }
  return out;
}

/**
 * Parse a `getPersona` SOAP response into structured padron data. Handles
 * both the constancia_inscripcion response shape (with datosGenerales /
 * datosMonotributo / datosRegimenGeneral) AND the A13 shape (flat persona).
 *
 * # Constancia response shape
 *
 * `<personaReturn>`
 *   `<metadata>...</metadata>`
 *   `<datosGenerales>` apellido, nombre, razonSocial, tipoPersona,
 *     estadoClave, fechaNacimiento, fechaInscripcion, domicilioFiscal `</datosGenerales>`
 *   `<datosMonotributo>` `<categoriaMonotributo>idCategoria/descripcionCategoria/periodo</categoriaMonotributo>`
 *     `<actividadMonotributista/>` `<impuesto/>` `</datosMonotributo>` (only if monotributista)
 *   `<datosRegimenGeneral>` `<actividad/>` `<impuesto>idImpuesto/descripcion/...</impuesto>` `</datosRegimenGeneral>`
 *     (idImpuesto=30 means IVA Responsable Inscripto, =32 means Monotributo)
 *   `<errorConstancia/>`, `<errorMonotributo/>`, `<errorRegimenGeneral/>` (partial-failure containers)
 *
 * # A13 response shape
 *
 * `<personaReturn>`
 *   `<persona>` apellido, nombre, descripcionActividadPrincipal, multiple
 *     `<domicilio>` blocks (FISCAL vs LEGAL/REAL), estadoClave, etc. `</persona>`
 * No monotributo, no impuesto data.
 *
 * # Detection
 *
 * Look for `<datosGenerales>` to detect constancia shape; otherwise fall back
 * to flat `<persona>`. The same parser handles both transparently.
 *
 * @internal Exposed for testing; production callers use the adapter.
 */
export function parseGetPersonaResponse(
  responseXml: string,
): { found: boolean; data: AfipPadronData | null; rawError: string | null } {
  // AFIP returns errorConstancia or a fault if the CUIT isn't found.
  const errMsg = extractTag(responseXml, "error");
  if (errMsg && /no.*encontrad|inexistente|no.*registr/i.test(errMsg)) {
    return { found: false, data: null, rawError: sanitizeRegistryText(errMsg) };
  }
  // SRValidationException: AFIP signals "no encontrada" via SOAP fault too.
  const faultString = extractTag(responseXml, "faultstring");
  if (faultString && /no.*encontrad|inexistente|no.*registr|no se encontr/i.test(faultString)) {
    return { found: false, data: null, rawError: sanitizeRegistryText(faultString) };
  }

  // Detect shape: constancia has <datosGenerales>; A13 has flat <persona>.
  const datosGenerales = extractTag(responseXml, "datosGenerales");
  const personaBlock =
    datosGenerales ?? extractTag(responseXml, "persona") ?? responseXml;

  const apellido = extractTag(personaBlock, "apellido");
  const nombreSimple = extractTag(personaBlock, "nombre");
  const razonSocial = extractTag(personaBlock, "razonSocial");
  const tipoPersona = extractTag(personaBlock, "tipoPersona");
  const estadoClave = extractTag(personaBlock, "estadoClave");
  const fechaInscripcion =
    extractTag(personaBlock, "fechaInscripcion") ??
    extractTag(personaBlock, "fechaContratoSocial");

  // Monotributo data (constancia only).
  const monotributoBlock =
    extractTag(responseXml, "datosMonotributo") ??
    extractTag(personaBlock, "monotributo");
  const categoriaMonotributoBlock = monotributoBlock
    ? extractTag(monotributoBlock, "categoriaMonotributo")
    : null;
  const monotributoCategoria = categoriaMonotributoBlock
    ? (extractTag(categoriaMonotributoBlock, "descripcionCategoria") ??
        extractTag(categoriaMonotributoBlock, "idCategoria") ??
        (categoriaMonotributoBlock.trim() || null))
    : monotributoBlock
      ? (extractTag(monotributoBlock, "categoriaMonotributo") ??
          extractTag(monotributoBlock, "descripcionCategoria"))
      : null;

  // Régimen general (constancia only).
  const regimenGeneralBlock =
    extractTag(responseXml, "datosRegimenGeneral") ??
    extractTag(personaBlock, "regimenGeneral");

  // Determine condition. Priority:
  //   1. Monotributo block → MONOTRIBUTO
  //   2. Régimen general impuesto with idImpuesto=30 (IVA RI) → RESPONSABLE INSCRIPTO
  //   3. Régimen general present without IVA RI → RESPONSABLE INSCRIPTO (still general regime)
  //   4. Legacy hint via categoriaIVA → RESPONSABLE INSCRIPTO
  //   5. estadoClave matches "exent" → EXENTO
  //   6. Otherwise → DESCONOCIDA
  let condicion = "DESCONOCIDA";
  if (monotributoBlock && categoriaMonotributoBlock) {
    condicion = "MONOTRIBUTO";
  } else if (regimenGeneralBlock) {
    const impuestos = extractAllBlocks(regimenGeneralBlock, "impuesto");
    const hasIvaRi = impuestos.some((imp) => extractTag(imp, "idImpuesto") === "30");
    condicion = hasIvaRi ? "RESPONSABLE INSCRIPTO" : "RESPONSABLE INSCRIPTO";
  } else if (
    /<regimenGeneral>/i.test(personaBlock) ||
    /<categoriaIVA>/i.test(personaBlock)
  ) {
    condicion = "RESPONSABLE INSCRIPTO";
  } else if (estadoClave && /exent/i.test(estadoClave)) {
    condicion = "EXENTO";
  }

  // Address.
  // - Constancia: <domicilioFiscal> child block inside <datosGenerales>.
  // - A13: multiple top-level <domicilio> blocks distinguished by <tipoDomicilio>.
  const domicilioFiscalBlock =
    extractTag(personaBlock, "domicilioFiscal") ??
    (() => {
      const domicilios = extractAllBlocks(personaBlock, "domicilio");
      return (
        domicilios.find((b) => /FISCAL/i.test(extractTag(b, "tipoDomicilio") ?? "")) ??
        domicilios[0] ??
        null
      );
    })();
  const direccion = domicilioFiscalBlock ? extractTag(domicilioFiscalBlock, "direccion") : null;
  const localidad = domicilioFiscalBlock ? extractTag(domicilioFiscalBlock, "localidad") : null;
  const provincia = domicilioFiscalBlock
    ? extractTag(domicilioFiscalBlock, "descripcionProvincia") ?? extractTag(domicilioFiscalBlock, "provincia")
    : null;
  const codPostal = domicilioFiscalBlock
    ? extractTag(domicilioFiscalBlock, "codigoPostal") ?? extractTag(domicilioFiscalBlock, "codPostal")
    : null;
  const domicilioStr = [direccion, localidad, provincia, codPostal]
    .filter(Boolean)
    .join(", ") || null;

  // Activities. Constancia returns nested <actividad> blocks (with idActividad
  // + descripcionActividad + periodo); A13 returns single descripcionActividadPrincipal.
  const actividadPrincipal = extractTag(personaBlock, "descripcionActividadPrincipal");
  const allActividadBlocks = [
    ...extractAllBlocks(personaBlock, "actividad"),
    ...(monotributoBlock ? extractAllBlocks(monotributoBlock, "actividadMonotributista") : []),
    ...(regimenGeneralBlock ? extractAllBlocks(regimenGeneralBlock, "actividad") : []),
  ];
  const actividadDescriptions = allActividadBlocks
    .map((b) => extractTag(b, "descripcionActividad"))
    .filter((d): d is string => d !== null);
  const actividadesAll = actividadPrincipal
    ? [actividadPrincipal, ...actividadDescriptions]
    : actividadDescriptions;
  // Dedupe — actividadMonotributista + actividad in regimen often repeat.
  const actividades = Array.from(new Set(actividadesAll));

  // If no name fields at all, this isn't a valid persona response.
  if (!apellido && !nombreSimple && !razonSocial && !tipoPersona) {
    return {
      found: false,
      data: null,
      rawError:
        "AFIP response did not include persona data. Raw: " +
        sanitizeRegistryText(responseXml.slice(0, 300)),
    };
  }

  const nombre =
    razonSocial ??
    [apellido, nombreSimple].filter(Boolean).join(" ").trim();

  // AFIP free-text fields are taxpayer-controlled and re-enter the agent loop
  // via the tool layer; neutralize the covert-instruction channel here so even
  // direct `getPersona` callers get sanitized data (defense-in-depth — the
  // tool layer also sanitizes + tags provenance for non-WSCDC adapters).
  return {
    found: true,
    data: sanitizeAfipData({
      nombre: nombre || (tipoPersona ?? "Sin nombre"),
      condicion,
      monotributoCategoria,
      fechaInscripcion,
      domicilioFiscal: domicilioStr,
      actividades,
    }),
    rawError: null,
  };
}

/**
 * Call AFIP's `getPersona` for the given service and return parsed padron data.
 *
 * @example
 * ```ts
 * const ta = await loginCms({
 *   service: CONSTANCIA_INSCRIPCION_SERVICE_NAME, certPem, keyPem, env: "prod",
 * });
 * const result = await getPersona({
 *   ta,
 *   service: "ws_sr_constancia_inscripcion",
 *   env: "prod",
 *   cuitRepresentado: "20123456786",
 *   cuitToQuery: "30707500129",
 * });
 * ```
 */
export async function getPersona(params: {
  ta: AccessTicket;
  env: AfipEnv;
  cuitRepresentado: string;
  cuitToQuery: string;
  /** Default `ws_sr_constancia_inscripcion`. */
  service?: AfipPadronService;
  endpointOverride?: string;
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 30s. */
  requestTimeoutMs?: number;
  /** Retries on 5xx (excluding SOAP Faults). Default 1. */
  maxRetries?: number;
  /** Observability hook fired after every request. */
  onCall?: (event: {
    label: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
  }) => void;
}): Promise<{ found: boolean; data: AfipPadronData | null; rawError: string | null }> {
  const service = params.service ?? CONSTANCIA_INSCRIPCION_SERVICE_NAME;
  const url = params.endpointOverride ?? SERVICE_URLS[service][params.env];
  const envelope = buildGetPersonaSoap({
    ta: params.ta,
    cuitRepresentado: params.cuitRepresentado,
    cuitToQuery: params.cuitToQuery,
    service,
  });
  const text = await fetchWithRetry({
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: envelope,
    },
    label: `wscdc.getPersona.${service}`,
    ...(params.fetchImpl !== undefined ? { fetchImpl: params.fetchImpl } : {}),
    ...(params.requestTimeoutMs !== undefined ? { requestTimeoutMs: params.requestTimeoutMs } : {}),
    ...(params.maxRetries !== undefined ? { maxRetries: params.maxRetries } : {}),
    ...(params.onCall !== undefined ? { onCall: params.onCall } : {}),
  });
  return parseGetPersonaResponse(text);
}

/**
 * @deprecated Use `getPersona({ service: "ws_sr_padron_a13", ... })`. Kept
 * for backwards compatibility with v0.3.x callers.
 */
export const getPersonaA13: typeof getPersona = (params) =>
  getPersona({ ...params, service: PADRON_A13_SERVICE_NAME });
