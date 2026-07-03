import { describe, expect, it, vi } from "vitest";
import {
  UnconfiguredWscdcAdapter,
  HttpWscdcAdapter,
  InMemoryWscdcAdapter,
  buildConstatarEnvelope,
  buildDummyEnvelope,
  parseConstatarResponse,
  parseDummyResponse,
  validateConstatarRequest,
  normalizeCuit,
  WSCDC_URLS,
  WscdcUnconfiguredError,
  WscdcValidationError,
  WscdcProtocolError,
  type ConstatarRequest,
  type AccessTicket,
} from "../src/index";

const goodTicket: AccessTicket = {
  token: "FAKE_TOKEN",
  sign: "FAKE_SIGN",
  cuitRepresentada: "20123456786",
  expirationTime: new Date(Date.now() + 3_600_000).toISOString(),
};

function validReq(overrides: Partial<ConstatarRequest> = {}): ConstatarRequest {
  return {
    cbteModo: "CAE",
    cuitEmisor: "30500000018",
    ptoVta: 1,
    cbteTipo: 11,
    cbteNro: 1234,
    cbteFch: "20260515",
    impTotal: 12100.0,
    codAutorizacion: "70123456789012",
    docTipoReceptor: 80,
    docNroReceptor: "20123456786",
    ...overrides,
  };
}

// HttpClient (from @ar-agents/core) needs a REAL `Response` — its error
// path calls `res.clone()`, which a hand-rolled `{ ok, status, text }`
// fake lacks. Build actual `Response` objects here. The responder still
// returns the old `{ ok, status, text }` seed shape for convenience.
function mockFetch(
  responder: (
    url: string,
    init: RequestInit,
  ) => { ok: boolean; status: number; text: string },
): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    const r = responder(url, init);
    return new Response(r.text, {
      status: r.status,
      headers: { "content-type": "text/xml" },
    });
  }) as typeof fetch;
}

const APPROVED_SOAP = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ComprobanteConstatarResponse xmlns="http://ar.gov.afip.dif.wscdc/">
      <ComprobanteConstatarResult>
        <Resultado>A</Resultado>
        <FchProceso>20260515123045</FchProceso>
        <Observaciones/>
      </ComprobanteConstatarResult>
    </ComprobanteConstatarResponse>
  </soap:Body>
</soap:Envelope>`;

const REJECTED_SOAP = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ComprobanteConstatarResponse xmlns="http://ar.gov.afip.dif.wscdc/">
      <ComprobanteConstatarResult>
        <Resultado>N</Resultado>
        <FchProceso>20260515123045</FchProceso>
        <Errors>
          <CodDescr><Code>102</Code><Msg>El comprobante no se encuentra registrado.</Msg></CodDescr>
        </Errors>
      </ComprobanteConstatarResult>
    </ComprobanteConstatarResponse>
  </soap:Body>
</soap:Envelope>`;

const OBSERVED_SOAP = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ComprobanteConstatarResponse xmlns="http://ar.gov.afip.dif.wscdc/">
      <ComprobanteConstatarResult>
        <Resultado>O</Resultado>
        <FchProceso>20260515123045</FchProceso>
        <Observaciones>
          <CodDescr><Code>105</Code><Msg>El total difiere.</Msg></CodDescr>
        </Observaciones>
      </ComprobanteConstatarResult>
    </ComprobanteConstatarResponse>
  </soap:Body>
</soap:Envelope>`;

describe("validateConstatarRequest", () => {
  it("accepts a well-formed request", () => {
    expect(() => validateConstatarRequest(validReq())).not.toThrow();
  });

  it("rejects bad cbteModo", () => {
    // @ts-expect-error — testing runtime guard
    expect(() => validateConstatarRequest(validReq({ cbteModo: "X" }))).toThrow(
      WscdcValidationError,
    );
  });

  it("rejects bad CUIT", () => {
    expect(() =>
      validateConstatarRequest(validReq({ cuitEmisor: "abc" })),
    ).toThrow(WscdcValidationError);
  });

  it("accepts hyphenated CUIT", () => {
    expect(() =>
      validateConstatarRequest(validReq({ cuitEmisor: "30-50000001-8" })),
    ).not.toThrow();
  });

  it("rejects bad cbteFch (not YYYYMMDD)", () => {
    expect(() =>
      validateConstatarRequest(validReq({ cbteFch: "2026-05-15" })),
    ).toThrow(WscdcValidationError);
  });

  it("rejects bad CAE shape", () => {
    expect(() =>
      validateConstatarRequest(validReq({ codAutorizacion: "12345" })),
    ).toThrow(WscdcValidationError);
  });

  it("rejects ptoVta out of range", () => {
    expect(() => validateConstatarRequest(validReq({ ptoVta: 0 }))).toThrow(
      WscdcValidationError,
    );
    expect(() =>
      validateConstatarRequest(validReq({ ptoVta: 100_000 })),
    ).toThrow(WscdcValidationError);
  });

  it("rejects negative impTotal", () => {
    expect(() => validateConstatarRequest(validReq({ impTotal: -1 }))).toThrow(
      WscdcValidationError,
    );
  });

  it("accepts docNroReceptor='0' for Consumidor Final", () => {
    expect(() =>
      validateConstatarRequest(validReq({ docTipoReceptor: 99, docNroReceptor: "0" })),
    ).not.toThrow();
  });
});

describe("normalizeCuit", () => {
  it("strips hyphens", () => {
    expect(normalizeCuit("20-12345678-6", "x")).toBe("20123456786");
  });
  it("throws on garbage", () => {
    expect(() => normalizeCuit("nope", "x")).toThrow(WscdcValidationError);
  });
});

describe("buildConstatarEnvelope + parseConstatarResponse", () => {
  it("embeds token + sign + cuit in the Auth block", () => {
    const xml = buildConstatarEnvelope({ ticket: goodTicket, req: validReq() });
    expect(xml).toContain("<w:Token>FAKE_TOKEN</w:Token>");
    expect(xml).toContain("<w:Sign>FAKE_SIGN</w:Sign>");
    expect(xml).toContain("<w:Cuit>20123456786</w:Cuit>");
  });

  it("formats impTotal with 2 decimals always", () => {
    const xml = buildConstatarEnvelope({
      ticket: goodTicket,
      req: validReq({ impTotal: 12100 }),
    });
    expect(xml).toContain("<w:ImpTotal>12100.00</w:ImpTotal>");
  });

  it("escapes XML-special chars in caller-supplied fields", () => {
    const xml = buildConstatarEnvelope({
      ticket: { ...goodTicket, token: "a<b>c&d" },
      req: validReq(),
    });
    expect(xml).toContain("<w:Token>a&lt;b&gt;c&amp;d</w:Token>");
  });

  it("parses Approved (A)", () => {
    const r = parseConstatarResponse(APPROVED_SOAP);
    expect(r.resultado).toBe("A");
    expect(r.observaciones).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.fchProceso).toBe("20260515123045");
  });

  it("parses Rejected (N) with errors", () => {
    const r = parseConstatarResponse(REJECTED_SOAP);
    expect(r.resultado).toBe("N");
    expect(r.errors[0]).toEqual({
      code: 102,
      msg: "El comprobante no se encuentra registrado.",
    });
  });

  it("parses Observed (O) with observaciones", () => {
    const r = parseConstatarResponse(OBSERVED_SOAP);
    expect(r.resultado).toBe("O");
    expect(r.observaciones[0]).toEqual({
      code: 105,
      msg: "El total difiere.",
    });
  });

  it("throws on SOAP fault", () => {
    const fault = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>TA expired</faultstring></soap:Fault></soap:Body></soap:Envelope>`;
    expect(() => parseConstatarResponse(fault)).toThrow(/TA expired/);
  });

  it("throws on malformed response (no result block)", () => {
    expect(() => parseConstatarResponse("<no-result/>")).toThrow(
      /missing ComprobanteConstatarResult/,
    );
  });
});

describe("buildDummyEnvelope + parseDummyResponse", () => {
  it("builds a body-only envelope with the Dummy operation", () => {
    const xml = buildDummyEnvelope();
    expect(xml).toContain("<w:Dummy/>");
    expect(xml).not.toContain("ComprobanteConstatar");
  });

  it("parses the Dummy result statuses", () => {
    const dummy = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><DummyResponse xmlns="http://ar.gov.afip.dif.wscdc/"><DummyResult><AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer></DummyResult></DummyResponse></soap:Body></soap:Envelope>`;
    const r = parseDummyResponse(dummy);
    expect(r).toEqual({ appServer: "OK", dbServer: "OK", authServer: "OK" });
  });
});

describe("UnconfiguredWscdcAdapter", () => {
  it("throws on validateComprobante", async () => {
    const a = new UnconfiguredWscdcAdapter();
    await expect(a.validateComprobante(validReq())).rejects.toThrow(
      WscdcUnconfiguredError,
    );
  });
  it("throws on health", async () => {
    const a = new UnconfiguredWscdcAdapter();
    await expect(a.health()).rejects.toThrow(WscdcUnconfiguredError);
  });
});

describe("HttpWscdcAdapter", () => {
  it("targets the correct endpoint by env", async () => {
    const captured = vi.fn(() => ({ ok: true, status: 200, text: APPROVED_SOAP }));
    const a = new HttpWscdcAdapter({
      env: "homo",
      ticket: goodTicket,
      fetch: mockFetch(captured),
    });
    await a.validateComprobante(validReq());
    expect(captured.mock.calls[0]?.[0]).toBe(WSCDC_URLS.homo);
  });

  it("sets the SoapAction header", async () => {
    const captured = vi.fn(() => ({ ok: true, status: 200, text: APPROVED_SOAP }));
    const a = new HttpWscdcAdapter({
      env: "homo",
      ticket: goodTicket,
      fetch: mockFetch(captured),
    });
    await a.validateComprobante(validReq());
    expect(captured.mock.calls[0]?.[1]?.headers?.soapaction).toContain(
      "ComprobanteConstatar",
    );
  });

  it("translates HTTP 500 with faultstring into a WscdcProtocolError", async () => {
    const a = new HttpWscdcAdapter({
      env: "homo",
      ticket: goodTicket,
      fetch: mockFetch(() => ({
        ok: false,
        status: 500,
        text: `<soap:Fault><faultstring>token expired</faultstring></soap:Fault>`,
      })),
    });
    await expect(a.validateComprobante(validReq())).rejects.toThrow(
      WscdcProtocolError,
    );
  });

  it("translates fetch failures into a WscdcProtocolError", async () => {
    const a = new HttpWscdcAdapter({
      env: "homo",
      ticket: goodTicket,
      fetch: () => Promise.reject(new Error("connection refused")),
    });
    await expect(a.validateComprobante(validReq())).rejects.toThrow(
      /connection refused/,
    );
  });

  it("rejects bad input before doing any fetch", async () => {
    const captured = vi.fn(() => ({ ok: true, status: 200, text: APPROVED_SOAP }));
    const a = new HttpWscdcAdapter({
      env: "homo",
      ticket: goodTicket,
      fetch: mockFetch(captured),
    });
    await expect(
      a.validateComprobante(validReq({ codAutorizacion: "short" })),
    ).rejects.toThrow(WscdcValidationError);
    expect(captured).not.toHaveBeenCalled();
  });

  it("parses an Approved (A) result end-to-end through the core client", async () => {
    const a = new HttpWscdcAdapter({
      env: "homo",
      ticket: goodTicket,
      fetch: mockFetch(() => ({ ok: true, status: 200, text: APPROVED_SOAP })),
    });
    const r = await a.validateComprobante(validReq());
    expect(r.resultado).toBe("A");
    expect(r.fchProceso).toBe("20260515123045");
  });

  it("fails LOUD on a malformed 200 body (no result block) — never a fabricated clean result", async () => {
    const a = new HttpWscdcAdapter({
      env: "homo",
      ticket: goodTicket,
      // HTTP 200 but a body that is NOT a valid ComprobanteConstatar
      // response. The old blind-cast path could have returned a
      // default-filled object; the SOAP parser + schema now reject it.
      fetch: mockFetch(() => ({
        ok: true,
        status: 200,
        text: `<?xml version="1.0"?><soap:Envelope><soap:Body><nothing/></soap:Body></soap:Envelope>`,
      })),
    });
    await expect(a.validateComprobante(validReq())).rejects.toThrow(
      WscdcProtocolError,
    );
  });

  it("health() runs end-to-end through the core client", async () => {
    const a = new HttpWscdcAdapter({
      env: "homo",
      ticket: goodTicket,
      fetch: mockFetch(() => ({
        ok: true,
        status: 200,
        text: `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><DummyResponse xmlns="http://ar.gov.afip.dif.wscdc/"><DummyResult><AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer></DummyResult></DummyResponse></soap:Body></soap:Envelope>`,
      })),
    });
    expect(await a.health()).toEqual({
      appServer: "OK",
      dbServer: "OK",
      authServer: "OK",
    });
  });

  it("retries a transient 5xx on the idempotent constatar READ then succeeds", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = (async (
      _input: RequestInfo | URL,
      _init: RequestInit = {},
    ) => {
      calls += 1;
      if (calls === 1) {
        // Transient upstream 503 with NO faultstring — a real outage, not
        // a TA-expiry SOAP fault. Safe to retry a read.
        return new Response("<html>502 Bad Gateway</html>", {
          status: 503,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response(APPROVED_SOAP, {
        status: 200,
        headers: { "content-type": "text/xml" },
      });
    }) as typeof fetch;
    const a = new HttpWscdcAdapter({
      env: "homo",
      ticket: goodTicket,
      fetch: fetchImpl,
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitter: 0 },
    });
    const r = await a.validateComprobante(validReq());
    expect(r.resultado).toBe("A");
    expect(calls).toBe(2);
  });
});

describe("InMemoryWscdcAdapter", () => {
  const seed = {
    cuitEmisor: "30-50000001-8",
    ptoVta: 1,
    cbteTipo: 11,
    cbteNro: 1234,
    impTotal: 12100.0,
    codAutorizacion: "70123456789012",
  };

  it("returns A when the request matches a seed exactly", async () => {
    const a = new InMemoryWscdcAdapter([seed]);
    const r = await a.validateComprobante(validReq());
    expect(r.resultado).toBe("A");
  });

  it("returns O when total differs (matches CAE + cbte)", async () => {
    const a = new InMemoryWscdcAdapter([seed]);
    const r = await a.validateComprobante(validReq({ impTotal: 99999 }));
    expect(r.resultado).toBe("O");
    expect(r.observaciones[0]?.msg).toContain("difiere");
  });

  it("returns N when the CAE doesn't match any seed", async () => {
    const a = new InMemoryWscdcAdapter([seed]);
    const r = await a.validateComprobante(
      validReq({ codAutorizacion: "99999999999999" }),
    );
    expect(r.resultado).toBe("N");
    expect(r.errors[0]?.code).toBe(102);
  });

  it("health returns all OK", async () => {
    const a = new InMemoryWscdcAdapter();
    expect(await a.health()).toEqual({
      appServer: "OK",
      dbServer: "OK",
      authServer: "OK",
    });
  });

  it("validates input even for the in-memory adapter", async () => {
    const a = new InMemoryWscdcAdapter();
    await expect(
      a.validateComprobante(validReq({ codAutorizacion: "short" })),
    ).rejects.toThrow(WscdcValidationError);
  });
});
