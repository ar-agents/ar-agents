import { describe, expect, it } from "vitest";
import {
  buildGetPersonaSoap,
  parseGetPersonaResponse,
  WSCDC_SERVICE_NAME,
} from "../src/wscdc";

describe("WSCDC_SERVICE_NAME", () => {
  it("matches the AFIP-registered service name", () => {
    expect(WSCDC_SERVICE_NAME).toBe("ws_sr_padron_a5");
  });
});

describe("buildGetPersonaSoap", () => {
  const ta = {
    token: "FAKE_TOKEN",
    sign: 'FAKE/SIGN+WITH=<SPECIAL>"CHARS"',
    expirationTimeMs: Date.now() + 3600_000,
    service: "ws_sr_padron_a5",
  };

  it("includes token, sign, cuitRepresentada, idPersona", () => {
    const soap = buildGetPersonaSoap({
      ta,
      cuitRepresentado: "20417581015",
      cuitToQuery: "30707500129",
    });
    expect(soap).toContain("<a5:token>FAKE_TOKEN</a5:token>");
    expect(soap).toContain("<a5:cuitRepresentada>20417581015</a5:cuitRepresentada>");
    expect(soap).toContain("<a5:idPersona>30707500129</a5:idPersona>");
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

describe("parseGetPersonaResponse", () => {
  it("returns found:false when AFIP signals no record", () => {
    const xml = `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getPersona_v2Response>
      <return>
        <error>No se ha encontrado a la persona consultada.</error>
      </return>
    </getPersona_v2Response>
  </soapenv:Body>
</soapenv:Envelope>`;
    const result = parseGetPersonaResponse(xml);
    expect(result.found).toBe(false);
    expect(result.data).toBeNull();
    expect(result.rawError).toMatch(/no se ha encontrado/i);
  });

  it("parses a persona física monotributista response", () => {
    const xml = `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getPersona_v2Response>
      <return>
        <persona>
          <apellido>CLEMENTE</apellido>
          <nombre>NAZARENO</nombre>
          <tipoPersona>FISICA</tipoPersona>
          <tipoClave>CUIT</tipoClave>
          <estadoClave>ACTIVO</estadoClave>
          <fechaInscripcion>2026-04-17</fechaInscripcion>
          <domicilioFiscal>
            <direccion>CABO CORRIENTES 468</direccion>
            <localidad>MONTE GRANDE</localidad>
            <descripcionProvincia>BUENOS AIRES</descripcionProvincia>
            <codPostal>1842</codPostal>
          </domicilioFiscal>
          <monotributo>
            <categoriaMonotributo>A</categoriaMonotributo>
            <descripcionActividad>Servicios informáticos</descripcionActividad>
          </monotributo>
          <actividades>
            <actividad>
              <descripcionActividad>Servicios informáticos</descripcionActividad>
            </actividad>
          </actividades>
        </persona>
      </return>
    </getPersona_v2Response>
  </soapenv:Body>
</soapenv:Envelope>`;
    const result = parseGetPersonaResponse(xml);
    expect(result.found).toBe(true);
    expect(result.data?.nombre).toBe("CLEMENTE NAZARENO");
    expect(result.data?.condicion).toBe("MONOTRIBUTO");
    expect(result.data?.monotributoCategoria).toBe("A");
    expect(result.data?.fechaInscripcion).toBe("2026-04-17");
    expect(result.data?.domicilioFiscal).toContain("CABO CORRIENTES 468");
    expect(result.data?.domicilioFiscal).toContain("MONTE GRANDE");
    expect(result.data?.actividades).toContain("Servicios informáticos");
  });

  it("parses a responsable inscripto (persona jurídica) response", () => {
    const xml = `<?xml version="1.0"?>
<soapenv:Envelope>
  <soapenv:Body>
    <return>
      <persona>
        <nombre>EMPRESA SA</nombre>
        <tipoPersona>JURIDICA</tipoPersona>
        <regimenGeneral>
          <categoriaIVA>RI</categoriaIVA>
        </regimenGeneral>
      </persona>
    </return>
  </soapenv:Body>
</soapenv:Envelope>`;
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
