import { describe, expect, it } from "vitest";
import {
  buildGetPersonaSoap,
  parseGetPersonaResponse,
  WSCDC_SERVICE_NAME,
  CONSTANCIA_INSCRIPCION_SERVICE_NAME,
  PADRON_A13_SERVICE_NAME,
} from "../src/wscdc";

describe("service-name constants", () => {
  it("exposes constancia + A13 service names", () => {
    expect(CONSTANCIA_INSCRIPCION_SERVICE_NAME).toBe("ws_sr_constancia_inscripcion");
    expect(PADRON_A13_SERVICE_NAME).toBe("ws_sr_padron_a13");
  });

  it("WSCDC_SERVICE_NAME defaults to constancia (richer data)", () => {
    expect(WSCDC_SERVICE_NAME).toBe("ws_sr_constancia_inscripcion");
  });
});

describe("buildGetPersonaSoap", () => {
  const ta = {
    token: "FAKE_TOKEN",
    sign: 'FAKE/SIGN+WITH=<SPECIAL>"CHARS"',
    expirationTimeMs: Date.now() + 3600_000,
    service: "ws_sr_constancia_inscripcion",
  };

  it("includes token, sign, cuitRepresentada, idPersona (default constancia)", () => {
    const soap = buildGetPersonaSoap({
      ta,
      cuitRepresentado: "20123456786",
      cuitToQuery: "30707500129",
    });
    // Constancia uses the a5 namespace prefix (personaServiceA5 endpoint).
    expect(soap).toContain("<a5:getPersona>");
    expect(soap).toContain("<token>FAKE_TOKEN</token>");
    expect(soap).toContain("<cuitRepresentada>20123456786</cuitRepresentada>");
    expect(soap).toContain("<idPersona>30707500129</idPersona>");
  });

  it("default constancia uses a5 targetNamespace", () => {
    const soap = buildGetPersonaSoap({
      ta,
      cuitRepresentado: "20123456786",
      cuitToQuery: "30707500129",
    });
    expect(soap).toContain('xmlns:a5="http://a5.soap.ws.server.puc.sr/"');
  });

  it("A13 service uses a13 targetNamespace + prefix", () => {
    const soap = buildGetPersonaSoap({
      ta,
      cuitRepresentado: "20123456786",
      cuitToQuery: "30707500129",
      service: "ws_sr_padron_a13",
    });
    expect(soap).toContain('xmlns:a13="http://a13.soap.ws.server.puc.sr/"');
    expect(soap).toContain("<a13:getPersona>");
  });

  it("escapes XML special chars in the sign value", () => {
    const soap = buildGetPersonaSoap({
      ta,
      cuitRepresentado: "20123456786",
      cuitToQuery: "30707500129",
    });
    expect(soap).toContain("&lt;");
    expect(soap).toContain("&gt;");
    expect(soap).toContain("&quot;");
  });
});

describe("parseGetPersonaResponse — error paths", () => {
  it("returns found:false when AFIP signals no record via <error>", () => {
    const xml = `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getPersonaResponse>
      <personaReturn>
        <error>No se ha encontrado a la persona consultada.</error>
      </personaReturn>
    </getPersonaResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
    const result = parseGetPersonaResponse(xml);
    expect(result.found).toBe(false);
    expect(result.data).toBeNull();
    expect(result.rawError).toMatch(/no se ha encontrado/i);
  });

  it("returns found:false when AFIP signals no record via SOAP fault", () => {
    const xml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Server</faultcode>
      <faultstring>No se encontró persona con id 30000000000</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;
    const result = parseGetPersonaResponse(xml);
    expect(result.found).toBe(false);
    expect(result.rawError).toMatch(/no se encontr/i);
  });

  it("returns found:false when the response has no persona data at all", () => {
    const result = parseGetPersonaResponse("<empty/>");
    expect(result.found).toBe(false);
    expect(result.rawError).toMatch(/persona data/i);
  });
});

describe("parseGetPersonaResponse — A13 (datos generales) shape", () => {
  it("parses a real A13 persona física response (no monotributo)", () => {
    // Shape captured from AFIP prod; identifying fields replaced with fictional values.
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:getPersonaResponse xmlns:ns2="http://a13.soap.ws.server.puc.sr/">
      <personaReturn>
        <metadata><fechaHora>2026-05-05T12:59:25.402-03:00</fechaHora></metadata>
        <persona>
          <apellido>PEREZ</apellido>
          <descripcionActividadPrincipal>SERVICIOS DE CONSULTORES EN INFORMÁTICA</descripcionActividadPrincipal>
          <domicilio>
            <calle>FALSA</calle>
            <codigoPostal>1000</codigoPostal>
            <descripcionProvincia>BUENOS AIRES</descripcionProvincia>
            <direccion>FALSA 123</direccion>
            <localidad>CIUDAD EJEMPLO</localidad>
            <numero>123</numero>
            <tipoDomicilio>FISCAL</tipoDomicilio>
          </domicilio>
          <domicilio>
            <direccion>OTRA DIRECCION</direccion>
            <tipoDomicilio>LEGAL/REAL</tipoDomicilio>
          </domicilio>
          <estadoClave>ACTIVO</estadoClave>
          <idPersona>20123456786</idPersona>
          <nombre>JUAN</nombre>
          <tipoClave>CUIT</tipoClave>
          <tipoPersona>FISICA</tipoPersona>
        </persona>
      </personaReturn>
    </ns2:getPersonaResponse>
  </soap:Body>
</soap:Envelope>`;
    const result = parseGetPersonaResponse(xml);
    expect(result.found).toBe(true);
    expect(result.data?.nombre).toBe("PEREZ JUAN");
    expect(result.data?.condicion).toBe("DESCONOCIDA"); // A13 doesn't include monotributo
    expect(result.data?.monotributoCategoria).toBeNull();
    expect(result.data?.fechaInscripcion).toBeNull();
    expect(result.data?.domicilioFiscal).toContain("FALSA 123");
    expect(result.data?.domicilioFiscal).toContain("CIUDAD EJEMPLO");
    expect(result.data?.domicilioFiscal).toContain("BUENOS AIRES");
    expect(result.data?.domicilioFiscal).toContain("1000");
    // Should pick the FISCAL domicilio, not LEGAL/REAL
    expect(result.data?.domicilioFiscal).not.toContain("OTRA DIRECCION");
    expect(result.data?.actividades).toContain("SERVICIOS DE CONSULTORES EN INFORMÁTICA");
  });
});

describe("parseGetPersonaResponse — constancia_inscripcion (full) shape", () => {
  it("parses a monotributista constancia with categoria + actividad", () => {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:getPersonaResponse xmlns:ns2="http://a5.soap.ws.server.puc.sr/">
      <personaReturn>
        <metadata><fechaHora>2026-05-05T12:00:00.000-03:00</fechaHora></metadata>
        <datosGenerales>
          <apellido>PEREZ</apellido>
          <nombre>JUAN</nombre>
          <tipoPersona>FISICA</tipoPersona>
          <tipoClave>CUIT</tipoClave>
          <estadoClave>ACTIVO</estadoClave>
          <fechaNacimiento>1990-01-01T12:00:00-03:00</fechaNacimiento>
          <idPersona>20123456786</idPersona>
          <domicilioFiscal>
            <direccion>FALSA 123</direccion>
            <localidad>CIUDAD EJEMPLO</localidad>
            <descripcionProvincia>BUENOS AIRES</descripcionProvincia>
            <codigoPostal>1000</codigoPostal>
            <tipoDomicilio>FISCAL</tipoDomicilio>
          </domicilioFiscal>
        </datosGenerales>
        <datosMonotributo>
          <fechaCategorizacion>2026-04-17</fechaCategorizacion>
          <categoriaMonotributo>
            <idCategoria>4</idCategoria>
            <descripcionCategoria>A</descripcionCategoria>
            <periodo>202604</periodo>
          </categoriaMonotributo>
          <actividadMonotributista>
            <idActividad>620100</idActividad>
            <descripcionActividad>SERVICIOS DE CONSULTORES EN INFORMÁTICA</descripcionActividad>
          </actividadMonotributista>
          <impuesto>
            <idImpuesto>20</idImpuesto>
            <descripcion>MONOTRIBUTO</descripcion>
            <periodo>202604</periodo>
          </impuesto>
        </datosMonotributo>
      </personaReturn>
    </ns2:getPersonaResponse>
  </soap:Body>
</soap:Envelope>`;
    const result = parseGetPersonaResponse(xml);
    expect(result.found).toBe(true);
    expect(result.data?.nombre).toBe("PEREZ JUAN");
    expect(result.data?.condicion).toBe("MONOTRIBUTO");
    expect(result.data?.monotributoCategoria).toBe("A");
    expect(result.data?.domicilioFiscal).toContain("FALSA 123");
    expect(result.data?.actividades).toContain("SERVICIOS DE CONSULTORES EN INFORMÁTICA");
  });

  it("parses a responsable inscripto constancia with régimen general + IVA impuesto", () => {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:getPersonaResponse xmlns:ns2="http://a5.soap.ws.server.puc.sr/">
      <personaReturn>
        <datosGenerales>
          <razonSocial>EMPRESA SA</razonSocial>
          <tipoPersona>JURIDICA</tipoPersona>
          <tipoClave>CUIT</tipoClave>
          <estadoClave>ACTIVO</estadoClave>
          <fechaContratoSocial>2010-01-15</fechaContratoSocial>
          <idPersona>30700000007</idPersona>
          <domicilioFiscal>
            <direccion>AV CORRIENTES 1234</direccion>
            <localidad>CABA</localidad>
            <descripcionProvincia>CIUDAD AUTONOMA BUENOS AIRES</descripcionProvincia>
            <codigoPostal>1043</codigoPostal>
          </domicilioFiscal>
        </datosGenerales>
        <datosRegimenGeneral>
          <actividad>
            <idActividad>620900</idActividad>
            <descripcionActividad>OTROS SERVICIOS DE INFORMÁTICA</descripcionActividad>
          </actividad>
          <impuesto>
            <idImpuesto>30</idImpuesto>
            <descripcion>IVA</descripcion>
          </impuesto>
          <impuesto>
            <idImpuesto>11</idImpuesto>
            <descripcion>GANANCIAS PERSONAS JURIDICAS</descripcion>
          </impuesto>
        </datosRegimenGeneral>
      </personaReturn>
    </ns2:getPersonaResponse>
  </soap:Body>
</soap:Envelope>`;
    const result = parseGetPersonaResponse(xml);
    expect(result.found).toBe(true);
    expect(result.data?.nombre).toBe("EMPRESA SA");
    expect(result.data?.condicion).toBe("RESPONSABLE INSCRIPTO");
    expect(result.data?.monotributoCategoria).toBeNull();
    expect(result.data?.fechaInscripcion).toBe("2010-01-15");
    expect(result.data?.domicilioFiscal).toContain("AV CORRIENTES 1234");
    expect(result.data?.actividades).toContain("OTROS SERVICIOS DE INFORMÁTICA");
  });

  it("legacy MONOTRIBUTO heuristic still works when monotributo block is nested under persona (not constancia)", () => {
    const xml = `<persona>
      <apellido>PEREZ</apellido>
      <nombre>JUAN</nombre>
      <tipoPersona>FISICA</tipoPersona>
      <monotributo>
        <categoriaMonotributo>A</categoriaMonotributo>
      </monotributo>
    </persona>`;
    const result = parseGetPersonaResponse(xml);
    expect(result.found).toBe(true);
    expect(result.data?.condicion).toBe("MONOTRIBUTO");
    expect(result.data?.monotributoCategoria).toBe("A");
  });

  it("derives RESPONSABLE INSCRIPTO from legacy regimenGeneral / categoriaIVA hint", () => {
    const xml = `<persona>
      <nombre>EMPRESA SA</nombre>
      <tipoPersona>JURIDICA</tipoPersona>
      <regimenGeneral>
        <categoriaIVA>RI</categoriaIVA>
      </regimenGeneral>
    </persona>`;
    const result = parseGetPersonaResponse(xml);
    expect(result.found).toBe(true);
    expect(result.data?.condicion).toBe("RESPONSABLE INSCRIPTO");
    expect(result.data?.monotributoCategoria).toBeNull();
  });
});
