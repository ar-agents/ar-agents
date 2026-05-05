import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WsaaWscdcAfipPadronAdapter } from "../src/wsaa-entry";
import { generateTestCertAndKey } from "./fixtures/test-cert";

function writeTempCertKey() {
  const dir = mkdtempSync(join(tmpdir(), "ar-agents-test-"));
  const { certPem, keyPem } = generateTestCertAndKey();
  const certPath = join(dir, "cert.pem");
  const keyPath = join(dir, "key.pem");
  writeFileSync(certPath, certPem);
  writeFileSync(keyPath, keyPem);
  return { certPath, keyPath };
}

const VALID_LOGIN_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <loginCmsResponse>
      <loginCmsReturn>&lt;?xml version="1.0" encoding="UTF-8"?&gt;
&lt;loginTicketResponse version="1.0"&gt;
  &lt;header&gt;
    &lt;uniqueId&gt;1234567890&lt;/uniqueId&gt;
    &lt;generationTime&gt;2026-05-05T13:00:00.000-03:00&lt;/generationTime&gt;
    &lt;expirationTime&gt;${new Date(Date.now() + 12 * 3600 * 1000).toISOString()}&lt;/expirationTime&gt;
  &lt;/header&gt;
  &lt;credentials&gt;
    &lt;token&gt;TEST_TOKEN_OK&lt;/token&gt;
    &lt;sign&gt;TEST_SIGN_OK&lt;/sign&gt;
  &lt;/credentials&gt;
&lt;/loginTicketResponse&gt;</loginCmsReturn>
    </loginCmsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

const VALID_PERSONA_RESPONSE = `<?xml version="1.0"?>
<soapenv:Envelope>
  <soapenv:Body>
    <return>
      <persona>
        <apellido>CLEMENTE</apellido>
        <nombre>NAZARENO</nombre>
        <tipoPersona>FISICA</tipoPersona>
        <fechaInscripcion>2026-04-17</fechaInscripcion>
        <monotributo>
          <categoriaMonotributo>A</categoriaMonotributo>
        </monotributo>
      </persona>
    </return>
  </soapenv:Body>
</soapenv:Envelope>`;

describe("WsaaWscdcAfipPadronAdapter", () => {
  it("normalizes the queried CUIT and returns the parsed padron data on success", async () => {
    const { certPath, keyPath } = writeTempCertKey();
    const fakeFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("LoginCms")) {
        return new Response(VALID_LOGIN_RESPONSE, { status: 200 });
      }
      if (u.includes("personaService")) {
        return new Response(VALID_PERSONA_RESPONSE, { status: 200 });
      }
      throw new Error("Unexpected URL: " + u);
    };
    const adapter = new WsaaWscdcAfipPadronAdapter({
      certPath,
      keyPath,
      cuitRepresentado: "20-41758101-5",
      env: "homo",
      fetchImpl: fakeFetch,
    });
    const result = await adapter.lookup("20-41758101-5");
    expect(result.available).toBe(true);
    expect(result.cuit).toBe("20417581015");
    expect(result.data?.nombre).toBe("CLEMENTE NAZARENO");
    expect(result.data?.condicion).toBe("MONOTRIBUTO");
    expect(result.data?.monotributoCategoria).toBe("A");
  });

  it("returns available:false with clear error when WSAA fails", async () => {
    const { certPath, keyPath } = writeTempCertKey();
    const fakeFetch: typeof fetch = async () =>
      new Response("AFIP rejected your cert", { status: 403 });
    const adapter = new WsaaWscdcAfipPadronAdapter({
      certPath,
      keyPath,
      cuitRepresentado: "20417581015",
      env: "homo",
      fetchImpl: fakeFetch,
    });
    const result = await adapter.lookup("30707500129");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/WSAA|cert/i);
  });

  it("returns available:false when WSCDC reports the CUIT is unknown", async () => {
    const { certPath, keyPath } = writeTempCertKey();
    const notFoundResponse = `<?xml version="1.0"?>
<soapenv:Envelope><soapenv:Body><return>
  <error>No se ha encontrado a la persona consultada.</error>
</return></soapenv:Body></soapenv:Envelope>`;
    const fakeFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("LoginCms")) {
        return new Response(VALID_LOGIN_RESPONSE, { status: 200 });
      }
      return new Response(notFoundResponse, { status: 200 });
    };
    const adapter = new WsaaWscdcAfipPadronAdapter({
      certPath,
      keyPath,
      cuitRepresentado: "20417581015",
      env: "homo",
      fetchImpl: fakeFetch,
    });
    const result = await adapter.lookup("99-99999999-9");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/no se ha encontrado|persona consultada/i);
  });

  it("rejects malformed CUIT input fast (before any AFIP call)", async () => {
    const { certPath, keyPath } = writeTempCertKey();
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      return new Response("", { status: 200 });
    };
    const adapter = new WsaaWscdcAfipPadronAdapter({
      certPath,
      keyPath,
      cuitRepresentado: "20417581015",
      env: "homo",
      fetchImpl: fakeFetch,
    });
    const result = await adapter.lookup("not-a-cuit");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/11 digits/i);
    expect(calls).toBe(0); // Confirmed no AFIP call was made
  });

  it("throws AfipNotConfiguredError when required options are missing", () => {
    expect(
      () =>
        new WsaaWscdcAfipPadronAdapter({
          certPath: "",
          keyPath: "",
          cuitRepresentado: "",
          env: "homo",
        }),
    ).toThrow(/AFIP/);
  });
});
