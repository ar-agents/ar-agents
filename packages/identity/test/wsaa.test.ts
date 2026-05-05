import { describe, expect, it } from "vitest";
import {
  buildSoapEnvelope,
  buildTraXml,
  InMemoryTokenStore,
  parseLoginTicketResponse,
  signTra,
} from "../src/wsaa";
import { generateTestCertAndKey } from "./fixtures/test-cert";

describe("buildTraXml", () => {
  it("includes the requested service name", () => {
    const xml = buildTraXml("ws_sr_padron_a5");
    expect(xml).toContain("<service>ws_sr_padron_a5</service>");
  });

  it("includes generationTime and expirationTime as ISO timestamps", () => {
    const xml = buildTraXml("ws_sr_padron_a5", 600);
    expect(xml).toMatch(/<generationTime>\d{4}-\d{2}-\d{2}T/);
    expect(xml).toMatch(/<expirationTime>\d{4}-\d{2}-\d{2}T/);
  });

  it("expirationTime is later than generationTime", () => {
    const xml = buildTraXml("ws_sr_padron_a5", 600);
    const gen = xml.match(/<generationTime>(.*?)<\/generationTime>/)![1]!;
    const exp = xml.match(/<expirationTime>(.*?)<\/expirationTime>/)![1]!;
    expect(new Date(exp).getTime()).toBeGreaterThan(new Date(gen).getTime());
  });

  it("uniqueId is numeric (epoch seconds)", () => {
    const xml = buildTraXml("ws_sr_padron_a5");
    const id = xml.match(/<uniqueId>(\d+)<\/uniqueId>/)![1]!;
    expect(Number(id)).toBeGreaterThan(1_000_000_000);
  });
});

describe("signTra", () => {
  it("produces a non-empty base64 string", () => {
    const { certPem, keyPem } = generateTestCertAndKey();
    const tra = buildTraXml("ws_sr_padron_a5");
    const cms = signTra(tra, certPem, keyPem);
    expect(cms.length).toBeGreaterThan(100);
    // Base64 should contain only valid chars
    expect(cms).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("produces different output for different TRAs", () => {
    const { certPem, keyPem } = generateTestCertAndKey();
    const cms1 = signTra(buildTraXml("ws_sr_padron_a5"), certPem, keyPem);
    const cms2 = signTra(buildTraXml("ws_sr_padron_a4"), certPem, keyPem);
    expect(cms1).not.toBe(cms2);
  });
});

describe("buildSoapEnvelope", () => {
  it("wraps the CMS in a loginCms SOAP envelope", () => {
    const env = buildSoapEnvelope("BASE64CMSCONTENT==");
    expect(env).toContain("<wsaa:loginCms>");
    expect(env).toContain("<wsaa:in0>BASE64CMSCONTENT==</wsaa:in0>");
    expect(env).toContain("</soapenv:Envelope>");
  });
});

describe("parseLoginTicketResponse", () => {
  const sampleResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <loginCmsResponse>
      <loginCmsReturn>&lt;?xml version="1.0" encoding="UTF-8"?&gt;
&lt;loginTicketResponse version="1.0"&gt;
  &lt;header&gt;
    &lt;source&gt;CN=wsaahomo, O=AFIP, C=AR&lt;/source&gt;
    &lt;destination&gt;CN=ar-agents&lt;/destination&gt;
    &lt;uniqueId&gt;1234567890&lt;/uniqueId&gt;
    &lt;generationTime&gt;2026-05-05T13:00:00.000-03:00&lt;/generationTime&gt;
    &lt;expirationTime&gt;2026-05-06T01:00:00.000-03:00&lt;/expirationTime&gt;
  &lt;/header&gt;
  &lt;credentials&gt;
    &lt;token&gt;FAKE_TOKEN_VALUE_HERE&lt;/token&gt;
    &lt;sign&gt;FAKE_SIGN_VALUE_HERE&lt;/sign&gt;
  &lt;/credentials&gt;
&lt;/loginTicketResponse&gt;</loginCmsReturn>
    </loginCmsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

  it("extracts token, sign, and expirationTime from a real-shaped response", () => {
    const ta = parseLoginTicketResponse(sampleResponse, "ws_sr_padron_a5");
    expect(ta.token).toBe("FAKE_TOKEN_VALUE_HERE");
    expect(ta.sign).toBe("FAKE_SIGN_VALUE_HERE");
    expect(ta.service).toBe("ws_sr_padron_a5");
    expect(ta.expirationTimeMs).toBeGreaterThan(Date.now());
  });

  it("throws clearly when loginCmsReturn is missing", () => {
    expect(() =>
      parseLoginTicketResponse("<not-a-soap-response/>", "x"),
    ).toThrow(/loginCmsReturn/);
  });

  it("throws clearly when token/sign/expirationTime are missing", () => {
    const broken = `<loginCmsReturn>&lt;loginTicketResponse&gt;empty&lt;/loginTicketResponse&gt;</loginCmsReturn>`;
    expect(() => parseLoginTicketResponse(broken, "x")).toThrow(/required fields/);
  });
});

describe("InMemoryTokenStore", () => {
  it("stores and retrieves tickets keyed by service", async () => {
    const store = new InMemoryTokenStore();
    const ta = {
      token: "T1",
      sign: "S1",
      expirationTimeMs: Date.now() + 3600_000,
      service: "ws_sr_padron_a5",
    };
    await store.set("ws_sr_padron_a5", ta);
    const got = await store.get("ws_sr_padron_a5");
    expect(got).toEqual(ta);
  });

  it("returns null for unknown services", async () => {
    const store = new InMemoryTokenStore();
    expect(await store.get("ws_unknown")).toBeNull();
  });
});
