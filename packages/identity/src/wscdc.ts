import type { AccessTicket, AfipEnv } from "./wsaa";
import type { AfipPadronData } from "./types";

/**
 * WSCDC (Web Service Constancia de Inscripción) client. Queries AFIP's
 * `personaService_v2` to retrieve a taxpayer's registered information.
 *
 * # Service surface
 *
 * The single useful operation is `getPersona_v2`: given a CUIT and a TA from
 * WSAA, returns the taxpayer's name, tax condition (Monotributo / Responsable
 * Inscripto / etc.), monotributo category if applicable, registered address,
 * and registered activities.
 *
 * # Endpoints
 *
 * - homo: https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5
 * - prod: https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5
 *
 * Requires the integration's cert to have been authorized for the
 * `ws_sr_padron_a5` service via Clave Fiscal "Administrador de Relaciones".
 */

const WSCDC_URLS: Record<AfipEnv, string> = {
  homo: "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5",
  prod: "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5",
};

export const WSCDC_SERVICE_NAME = "ws_sr_padron_a5";

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
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="serviceA5">
  <soapenv:Header/>
  <soapenv:Body>
    <a5:getPersona_v2>
      <a5:token>${escapeXml(params.ta.token)}</a5:token>
      <a5:sign>${escapeXml(params.ta.sign)}</a5:sign>
      <a5:cuitRepresentada>${params.cuitRepresentado}</a5:cuitRepresentada>
      <a5:idPersona>${params.cuitToQuery}</a5:idPersona>
    </a5:getPersona_v2>
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
 * Parse a `getPersona_v2` SOAP response into structured padron data.
 *
 * @internal Exposed for testing; production callers use `lookupPadron`.
 */
export function parseGetPersonaResponse(
  responseXml: string,
): { found: boolean; data: AfipPadronData | null; rawError: string | null } {
  // AFIP returns errorConstancia if the CUIT isn't found.
  const errMsg = extractTag(responseXml, "error");
  if (errMsg && /no.*encontrad|inexistente|no.*registr/i.test(errMsg)) {
    return { found: false, data: null, rawError: errMsg };
  }

  // Persona block fields
  const apellido = extractTag(responseXml, "apellido");
  const nombreSimple = extractTag(responseXml, "nombre");
  const tipoPersona = extractTag(responseXml, "tipoPersona");
  const tipoClave = extractTag(responseXml, "tipoClave");
  const estadoClave = extractTag(responseXml, "estadoClave");
  const fechaInscripcion = extractTag(responseXml, "fechaInscripcion");

  // Tax condition: AFIP returns a list of "categoria" entries under
  // "monotributo" or "regimenGeneral". Pick the most informative one.
  const monotributoBlock = extractTag(responseXml, "monotributo");
  const monotributoCategoria = monotributoBlock
    ? extractTag(monotributoBlock, "categoriaMonotributo") ?? extractTag(monotributoBlock, "descripcionCategoria")
    : null;

  // Determine condition
  let condicion = "DESCONOCIDA";
  if (monotributoBlock) {
    condicion = "MONOTRIBUTO";
  } else if (
    /<regimenGeneral>/i.test(responseXml) ||
    /<categoriaIVA>/i.test(responseXml)
  ) {
    condicion = "RESPONSABLE INSCRIPTO";
  } else if (estadoClave && /exent/i.test(estadoClave)) {
    condicion = "EXENTO";
  }

  // Address
  const domicilio = extractTag(responseXml, "domicilioFiscal") ?? extractTag(responseXml, "domicilio");
  const direccion = domicilio ? extractTag(domicilio, "direccion") : null;
  const localidad = domicilio ? extractTag(domicilio, "localidad") : null;
  const provincia = domicilio ? extractTag(domicilio, "descripcionProvincia") ?? extractTag(domicilio, "provincia") : null;
  const codPostal = domicilio ? extractTag(domicilio, "codPostal") : null;
  const domicilioStr = [direccion, localidad, provincia, codPostal]
    .filter(Boolean)
    .join(", ") || null;

  // Activities
  const actividadesBlock = extractTag(responseXml, "actividades") ?? extractTag(responseXml, "actividad") ?? "";
  const actividades = extractAllTags(actividadesBlock, "descripcionActividad");

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
 * Call `getPersona_v2` and return parsed padron data.
 *
 * @example
 * ```ts
 * const ta = await loginCms({ service: WSCDC_SERVICE_NAME, ... });
 * const result = await getPersonaV2({
 *   ta,
 *   env: "homo",
 *   cuitRepresentado: "20417581015",
 *   cuitToQuery: "30707500129",
 * });
 * ```
 */
export async function getPersonaV2(params: {
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
  if (!res.ok) {
    throw new Error(
      `WSCDC getPersona_v2 failed: HTTP ${res.status}. Body: ${text.slice(0, 500)}`,
    );
  }
  return parseGetPersonaResponse(text);
}
