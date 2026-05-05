import type { AccessTicket, AfipEnv } from "./wsaa";
import type { AfipPadronData } from "./types";

/**
 * WSCDC (Web Service Constancia de Inscripción) client. Queries AFIP's
 * `personaServiceA13` to retrieve a taxpayer's registered information.
 *
 * # Service surface
 *
 * The single useful operation is `getPersona`: given a CUIT and a TA from
 * WSAA, returns the taxpayer's name, tax condition (Monotributo / Responsable
 * Inscripto / etc.), monotributo category if applicable, registered address,
 * and registered activities.
 *
 * Real WSDL targetNamespace is `http://a13.soap.ws.server.puc.sr/` and uses
 * `elementFormDefault="unqualified"`, so child elements (token, sign, etc.)
 * are NOT namespace-prefixed — only the root operation element is.
 *
 * # Endpoints
 *
 * - homo: https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13
 * - prod: https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13
 *
 * Requires the integration's cert to have been authorized for the
 * `ws_sr_padron_a13` service via Clave Fiscal "Administrador de Relaciones".
 *
 * Note: AFIP deprecated `ws_sr_padron_a5` (the previous default). A13 is the
 * current canonical service for taxpayer constancia lookup — same SOAP shape
 * (`getPersona_v2`), richer response (extra fields like `tipoClave`, full
 * actividades, monotributo subdetail).
 */

const WSCDC_URLS: Record<AfipEnv, string> = {
  homo: "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13",
  prod: "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13",
};

export const WSCDC_SERVICE_NAME = "ws_sr_padron_a13";

/**
 * Build the SOAP envelope for `getPersona_v2`. Auth comes from the TA token +
 * sign; CUIT representado is the CUIT whose cert authenticated us.
 *
 * @internal
 */
export function buildGetPersonaSoap(params: {
  ta: AccessTicket;
  cuitRepresentado: string;
  cuitToQuery: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a13="http://a13.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a13:getPersona>
      <token>${escapeXml(params.ta.token)}</token>
      <sign>${escapeXml(params.ta.sign)}</sign>
      <cuitRepresentada>${params.cuitRepresentado}</cuitRepresentada>
      <idPersona>${params.cuitToQuery}</idPersona>
    </a13:getPersona>
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
 * Parse a `getPersona` (A13) SOAP response into structured padron data.
 *
 * # A13 response shape
 *
 * The actual response is wrapped as
 * `<personaReturn><metadata>…</metadata><persona>…</persona></personaReturn>`.
 * Inside `<persona>`:
 * - `apellido`, `nombre`, `tipoPersona`, `tipoClave`, `estadoClave`
 * - `descripcionActividadPrincipal` (single string, not a list)
 * - `<domicilio>` repeated, distinguished by `<tipoDomicilio>FISCAL</tipoDomicilio>`
 *   vs `LEGAL/REAL`. Domicilio fields: `direccion`, `localidad`,
 *   `descripcionProvincia`, `codigoPostal` (note: NOT `codPostal`).
 *
 * # What A13 does NOT return
 *
 * - Monotributo category — A13 is "datos generales", not constancia.
 * - Tax condition (Monotributo / Responsable Inscripto). The lib reports
 *   `condicion: "DESCONOCIDA"` here. For the full constancia (monotributo +
 *   IVA condition + impuestos asociados), authorize `ws_sr_constancia_inscripcion`
 *   and use that adapter (planned for v0.3 of @ar-agents/identity).
 *
 * @internal Exposed for testing; production callers use the adapter.
 */
export function parseGetPersonaResponse(
  responseXml: string,
): { found: boolean; data: AfipPadronData | null; rawError: string | null } {
  // AFIP returns errorConstancia or a fault if the CUIT isn't found.
  const errMsg = extractTag(responseXml, "error");
  if (errMsg && /no.*encontrad|inexistente|no.*registr/i.test(errMsg)) {
    return { found: false, data: null, rawError: errMsg };
  }
  // SRValidationException: AFIP signals "no encontrada" via SOAP fault too.
  const faultString = extractTag(responseXml, "faultstring");
  if (faultString && /no.*encontrad|inexistente|no.*registr|no se encontr/i.test(faultString)) {
    return { found: false, data: null, rawError: faultString };
  }

  // Narrow to the persona block to avoid matching across siblings.
  const personaBlock = extractTag(responseXml, "persona") ?? responseXml;

  const apellido = extractTag(personaBlock, "apellido");
  const nombreSimple = extractTag(personaBlock, "nombre");
  const tipoPersona = extractTag(personaBlock, "tipoPersona");
  const estadoClave = extractTag(personaBlock, "estadoClave");

  // A13 doesn't return monotributo or fechaInscripcion. Use ws_sr_constancia_inscripcion
  // for those (planned for v0.3).
  const monotributoBlock = extractTag(personaBlock, "monotributo");
  const monotributoCategoria = monotributoBlock
    ? extractTag(monotributoBlock, "categoriaMonotributo") ?? extractTag(monotributoBlock, "descripcionCategoria")
    : null;
  const fechaInscripcion = extractTag(personaBlock, "fechaInscripcion");

  // Determine condition. With A13-only data we usually can't tell — leave
  // DESCONOCIDA unless the legacy A5-shape monotributo/regimenGeneral blocks
  // are present (they aren't in A13, but we keep the heuristic for forward
  // compatibility / test fixtures).
  let condicion = "DESCONOCIDA";
  if (monotributoBlock) {
    condicion = "MONOTRIBUTO";
  } else if (
    /<regimenGeneral>/i.test(personaBlock) ||
    /<categoriaIVA>/i.test(personaBlock)
  ) {
    condicion = "RESPONSABLE INSCRIPTO";
  } else if (estadoClave && /exent/i.test(estadoClave)) {
    condicion = "EXENTO";
  }

  // Address. A13 returns multiple <domicilio> blocks distinguished by
  // <tipoDomicilio>. Prefer FISCAL; fall back to the first one.
  const domicilios = extractAllBlocks(personaBlock, "domicilio");
  const domicilioFiscalBlock =
    domicilios.find((b) => /FISCAL/i.test(extractTag(b, "tipoDomicilio") ?? "")) ??
    domicilios[0] ??
    extractTag(personaBlock, "domicilioFiscal") ??
    null;
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

  // Activities. A13 returns a single descripcionActividadPrincipal at the
  // persona level; older A5 shape had nested <actividades><actividad><descripcionActividad/>.
  const actividadPrincipal = extractTag(personaBlock, "descripcionActividadPrincipal");
  const actividadesBlock = extractTag(personaBlock, "actividades") ?? extractTag(personaBlock, "actividad") ?? "";
  const nestedActividades = extractAllTags(actividadesBlock, "descripcionActividad");
  const actividades = actividadPrincipal
    ? [actividadPrincipal, ...nestedActividades.filter((a) => a !== actividadPrincipal)]
    : nestedActividades;

  // If no name fields at all, this isn't a valid persona response
  if (!apellido && !nombreSimple && !tipoPersona) {
    return {
      found: false,
      data: null,
      rawError: "AFIP response did not include persona data. Raw: " + responseXml.slice(0, 300),
    };
  }

  const nombre = [apellido, nombreSimple].filter(Boolean).join(" ").trim();

  return {
    found: true,
    data: {
      nombre: nombre || (tipoPersona ?? "Sin nombre"),
      condicion,
      monotributoCategoria,
      fechaInscripcion,
      domicilioFiscal: domicilioStr,
      actividades,
    },
    rawError: null,
  };
}

/**
 * Extract every block of a tag's full content as an array (preserves nested
 * structure). Used for repeated blocks like A13's multiple <domicilio>.
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
 * Call `getPersona_v2` and return parsed padron data.
 *
 * @example
 * ```ts
 * const ta = await loginCms({ service: WSCDC_SERVICE_NAME, ... });
 * const result = await getPersonaA13({
 *   ta,
 *   env: "prod",
 *   cuitRepresentado: "20417581015",
 *   cuitToQuery: "30707500129",
 * });
 * ```
 */
export async function getPersonaA13(params: {
  ta: AccessTicket;
  env: AfipEnv;
  cuitRepresentado: string;
  cuitToQuery: string;
  endpointOverride?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ found: boolean; data: AfipPadronData | null; rawError: string | null }> {
  const fetchFn = params.fetchImpl ?? globalThis.fetch;
  const url = params.endpointOverride ?? WSCDC_URLS[params.env];
  const envelope = buildGetPersonaSoap({
    ta: params.ta,
    cuitRepresentado: params.cuitRepresentado,
    cuitToQuery: params.cuitToQuery,
  });
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "",
    },
    body: envelope,
  });
  const text = await res.text();
  // SOAP services return HTTP 500 with a Fault body for "not found" cases —
  // those are valid structured responses, not transport errors. Pass them
  // through to the parser, which converts faults into found:false results.
  // Only throw on responses that aren't SOAP at all (e.g., HTML 503 page).
  if (!res.ok && !/<.*Fault[\s>]/i.test(text)) {
    throw new Error(
      `WSCDC getPersona (A13) HTTP ${res.status}. Body: ${text.slice(0, 500)}`,
    );
  }
  return parseGetPersonaResponse(text);
}
