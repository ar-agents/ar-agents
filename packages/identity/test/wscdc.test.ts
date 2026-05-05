import { describe, expect, it } from "vitest";
import {
  buildGetPersonaSoap,
  parseGetPersonaResponse,
  WSCDC_SERVICE_NAME,
} from "../src/wscdc";

describe("WSCDC_SERVICE_NAME", () => {
  it("matches the AFIP-registered service name", () => {
    expect(WSCDC_SERVICE_NAME).toBe("ws_sr_padron_a13");
  });
});

describe("buildGetPersonaSoap", () => {
  const ta = {
    token: "FAKE_TOKEN",
    sign: 'FAKE/SIGN+WITH=<SPECIAL>"CHARS"',
    expirationTimeMs: Date.now() + 3600_000,
    service: "ws_sr_padron_a13",
  };

  it("includes token, sign, cuitRepresentada, idPersona", () => {
    const soap = buildGetPersonaSoap({
      ta,
      cuitRepresentado: "20417581015",
      cuitToQuery: "30707500129",
    });
    // A13 WSDL has elementFormDefault="unqualified" — children of
    // <a13:getPersona> are NOT prefixed.
    expect(soap).toContain("<a13:getPersona>");
    expect(soap).toContain("<token>FAKE_TOKEN</token>");
    expect(soap).toContain("<cuitRepresentada>20417581015</cuitRepresentada>");
    expect(soap).toContain("<idPersona>30707500129</idPersona>");
  });

  it("uses the canonical A13 targetNamespace", () => {
    const soap = buildGetPersonaSoap({
      ta,
      cuitRepresentado: "20417581015",
      cuitToQuery: "30707500129",
    });
    expect(soap).toContain('xmlns:a13="http://a13.soap.ws.server.puc.sr/"');
  });

  it("escapes XML special chars in the sign value", () => {
    const soap = buildGetPersonaSoap({
      ta,
      cuitRepresentado: "20417581015",
      cuitToQuery: "30707500129",
    });
    expect(soap).toContain("&lt;");
    expect(soap).toContain("&gt;");
    expect(soap).toContain("&quot;");
  });
});

describe("parseGetPersonaResponse (A13 shape)", () => {
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

  it("parses a real A13 persona física response", () => {
    // Real shape captured from AFIP prod for CUIT 20-41758101-5.
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:getPersonaResponse xmlns:ns2="http://a13.soap.ws.server.puc.sr/">
      <personaReturn>
        <metadata><fechaHora>2026-05-05T12:59:25.402-03:00</fechaHora></metadata>
        <persona>
          <apellido>CLEMENTE</apellido>
          <descripcionActividadPrincipal>SERVICIOS DE CONSULTORES EN INFORMÁTICA</descripcionActividadPrincipal>
          <domicilio>
            <calle>CABO CORRIENTES</calle>
            <codigoPostal>1842</codigoPostal>
            <descripcionProvincia>BUENOS AIRES</descripcionProvincia>
            <direccion>CABO CORRIENTES 468</direccion>
            <localidad>MONTE GRANDE</localidad>
            <numero>468</numero>
            <tipoDomicilio>FISCAL</tipoDomicilio>
          </domicilio>
          <domicilio>
            <direccion>OTRA DIRECCION</direccion>
            <tipoDomicilio>LEGAL/REAL</tipoDomicilio>
          </domicilio>
          <estadoClave>ACTIVO</estadoClave>
          <idPersona>20417581015</idPersona>
          <nombre>NAZARENO</nombre>
          <tipoClave>CUIT</tipoClave>
          <tipoPersona>FISICA</tipoPersona>
        </persona>
      </personaReturn>
    </ns2:getPersonaResponse>
  </soap:Body>
</soap:Envelope>`;
    const result = parseGetPersonaResponse(xml);
    expect(result.found).toBe(true);
    expect(result.data?.nombre).toBe("CLEMENTE NAZARENO");
    expect(result.data?.condicion).toBe("DESCONOCIDA"); // A13 doesn't include monotributo
    expect(result.data?.monotributoCategoria).toBeNull();
    expect(result.data?.fechaInscripcion).toBeNull();
    expect(result.data?.domicilioFiscal).toContain("CABO CORRIENTES 468");
    expect(result.data?.domicilioFiscal).toContain("MONTE GRANDE");
    expect(result.data?.domicilioFiscal).toContain("BUENOS AIRES");
    expect(result.data?.domicilioFiscal).toContain("1842");
    // Should pick the FISCAL domicilio, not LEGAL/REAL
    expect(result.data?.domicilioFiscal).not.toContain("OTRA DIRECCION");
    expect(result.data?.actividades).toContain("SERVICIOS DE CONSULTORES EN INFORMÁTICA");
  });

  it("derives MONOTRIBUTO when the (older A5) monotributo block is present", () => {
    // Test forward compatibility — if AFIP ever ships monotributo data via
    // A13, the parser already handles it.
    const xml = `<persona>
      <apellido>CLEMENTE</apellido>
      <nombre>NAZARENO</nombre>
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

  it("derives RESPONSABLE INSCRIPTO from regimenGeneral / categoriaIVA", () => {
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

  it("returns found:false when the response has no persona data at all", () => {
    const result = parseGetPersonaResponse("<empty/>");
    expect(result.found).toBe(false);
    expect(result.rawError).toMatch(/persona data/i);
  });
});
