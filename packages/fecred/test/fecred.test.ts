import { describe, expect, it, vi } from "vitest";
import {
  UnconfiguredFecredAdapter,
  HttpFecredAdapter,
  InMemoryFecredAdapter,
  buildDummyEnvelope,
  buildConsultarMontoObligadoEnvelope,
  buildConsultarComprobantesEnvelope,
  buildAceptarEnvelope,
  buildRechazarEnvelope,
  parseDummyResponse,
  parseConsultarMontoObligadoResponse,
  parseConsultarComprobantesResponse,
  parseOperacionFECredResponse,
  fecredTools,
  ALL_TOOL_NAMES,
  FECRED_URLS,
  FecredUnconfiguredError,
  FecredValidationError,
  FecredProtocolError,
  type AccessTicket,
  type FecredComprobante,
  type FetchLike,
} from "../src/index";

const goodTicket: AccessTicket = {
  token: "FAKE_TOKEN",
  sign: "FAKE_SIGN",
  cuitRepresentada: "30-50000001-8",
  expirationTime: new Date(Date.now() + 3_600_000).toISOString(),
};

function seedCmp(overrides: Partial<FecredComprobante> = {}): FecredComprobante {
  return {
    cuitEmisor: "20123456786",
    razonSocialEmi: "MiPyME Proveedora SRL",
    codTipoCmp: 201,
    ptoVta: 3,
    nroCmp: 42,
    cuitReceptor: "30500000018",
    razonSocialRecep: "Gran Comprador SA",
    codAutorizacion: "70123456789012",
    fechaEmision: "2026-06-01",
    fechaVenPago: "2026-07-01",
    fechaVenAcep: "2026-06-16",
    importeTotal: 8_000_000,
    codMoneda: "PES",
    cotizacionMoneda: 1,
    codCtaCte: 2561,
    estado: "Recepcionado",
    fechaHoraEstado: "2026-06-01T10:00:00",
    ...overrides,
  };
}

function mockFetch(
  responder: (
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
  ) => { ok: boolean; status: number; text: string },
): FetchLike {
  return async (url, init = {}) => {
    const r = responder(
      url,
      init as { method?: string; headers?: Record<string, string>; body?: string },
    );
    return { ok: r.ok, status: r.status, text: async () => r.text };
  };
}

const MONTO_OBLIGADO_SOAP = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:consultarMontoObligadoRecepcionResponse xmlns:ns2="http://ar.gob.afip.wsfecred/FECredService/">
      <consultarMontoObligadoRecepcionReturn>
        <obligado>S</obligado>
        <montoDesde>5500000</montoDesde>
      </consultarMontoObligadoRecepcionReturn>
    </ns2:consultarMontoObligadoRecepcionResponse>
  </soap:Body>
</soap:Envelope>`;

const NO_OBLIGADO_SOAP = MONTO_OBLIGADO_SOAP.replace(
  "<obligado>S</obligado>",
  "<obligado>N</obligado>",
);

const COMPROBANTES_SOAP = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:consultarComprobantesResponse xmlns:ns2="http://ar.gob.afip.wsfecred/FECredService/">
      <consultarCmpReturn>
        <arrayComprobantes>
          <comprobante>
            <cuitEmisor>20123456786</cuitEmisor>
            <razonSocialEmi>MiPyME Proveedora SRL</razonSocialEmi>
            <codTipoCmp>201</codTipoCmp>
            <ptovta>3</ptovta>
            <nroCmp>42</nroCmp>
            <cuitReceptor>30500000018</cuitReceptor>
            <razonSocialRecep>Gran Comprador SA</razonSocialRecep>
            <tipoCodAuto>CAE</tipoCodAuto>
            <codAutorizacion>70123456789012</codAutorizacion>
            <fechaEmision>2026-06-01</fechaEmision>
            <fechaVenPago>2026-07-01</fechaVenPago>
            <fechaVenAcep>2026-06-16</fechaVenAcep>
            <importeTotal>8000000.00</importeTotal>
            <codMoneda>PES</codMoneda>
            <cotizacionMoneda>1</cotizacionMoneda>
            <codCtaCte>2561</codCtaCte>
            <estado>
              <estado>Recepcionado</estado>
              <fechaHoraEstado>2026-06-01T10:00:00</fechaHoraEstado>
            </estado>
          </comprobante>
        </arrayComprobantes>
        <nroPagina>1</nroPagina>
        <hayMas>N</hayMas>
      </consultarCmpReturn>
    </ns2:consultarComprobantesResponse>
  </soap:Body>
</soap:Envelope>`;

const OPERACION_OK_SOAP = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:aceptarFECredResponse xmlns:ns2="http://ar.gob.afip.wsfecred/FECredService/">
      <operacionFECredReturn>
        <resultado>A</resultado>
        <idCtaCte><codCtaCte>2561</codCtaCte></idCtaCte>
      </operacionFECredReturn>
    </ns2:aceptarFECredResponse>
  </soap:Body>
</soap:Envelope>`;

const OPERACION_RECHAZADA_SOAP = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:rechazarFECredResponse xmlns:ns2="http://ar.gob.afip.wsfecred/FECredService/">
      <operacionFECredReturn>
        <resultado>R</resultado>
        <idCtaCte><codCtaCte>2561</codCtaCte></idCtaCte>
        <arrayErrores>
          <codigoDescripcion>
            <codigo>1108</codigo>
            <descripcion>La cuenta corriente ya fue aceptada.</descripcion>
          </codigoDescripcion>
        </arrayErrores>
      </operacionFECredReturn>
    </ns2:rechazarFECredResponse>
  </soap:Body>
</soap:Envelope>`;

const DUMMY_SOAP = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:dummyResponse xmlns:ns2="http://ar.gob.afip.wsfecred/FECredService/"><dummyReturn><appserver>OK</appserver><authserver>OK</authserver><dbserver>OK</dbserver></dummyReturn></ns2:dummyResponse></soap:Body></soap:Envelope>`;

// ── envelope builders ───────────────────────────────────────────

describe("envelope builders", () => {
  it("consultarMontoObligadoRecepcion embeds auth + cuit + fecha (children unqualified)", () => {
    const xml = buildConsultarMontoObligadoEnvelope({
      ticket: goodTicket,
      cuitConsultada: "30-50000001-8",
      fechaEmision: "2026-06-12",
    });
    expect(xml).toContain("<fec:consultarMontoObligadoRecepcionRequest>");
    expect(xml).toContain("<token>FAKE_TOKEN</token>");
    expect(xml).toContain("<cuitRepresentada>30500000018</cuitRepresentada>");
    expect(xml).toContain("<cuitConsultada>30500000018</cuitConsultada>");
    expect(xml).toContain("<fechaEmision>2026-06-12</fechaEmision>");
    // unqualified children: no fec: prefix on authRequest
    expect(xml).not.toContain("<fec:authRequest>");
  });

  it("consultarComprobantes respects the WSDL element order and defaults", () => {
    const xml = buildConsultarComprobantesEnvelope({
      ticket: goodTicket,
      input: {
        rol: "Receptor",
        fechaTipo: "Emision",
        estadoCmp: "Recepcionado",
        cuitContraparte: "20-12345678-6",
      },
    });
    expect(xml).toContain("<rolCUITRepresentada>Receptor</rolCUITRepresentada>");
    expect(xml).toContain("<CUITContraparte>20123456786</CUITContraparte>");
    expect(xml).toContain("<estadoCmp>Recepcionado</estadoCmp>");
    expect(xml).toContain("<tipo>Emision</tipo>");
    expect(xml).toContain("<desde>2019-01-01</desde>");
    // CUITContraparte must come before estadoCmp (WSDL sequence)
    expect(xml.indexOf("CUITContraparte")).toBeLessThan(xml.indexOf("estadoCmp"));
  });

  it("aceptarFECred embeds idFactura, formats saldoAceptado with 2 decimals", () => {
    const xml = buildAceptarEnvelope({
      ticket: goodTicket,
      input: {
        idFactura: { cuitEmisor: "20123456786", codTipoCmp: 201, ptoVta: 3, nroCmp: 42 },
        saldoAceptado: 8_000_000,
        codMoneda: "PES",
        cotizacionMonedaUlt: 1,
      },
    });
    expect(xml).toContain("<fec:aceptarFECredRequest>");
    expect(xml).toContain("<CUITEmisor>20123456786</CUITEmisor>");
    expect(xml).toContain("<codTipoCmp>201</codTipoCmp>");
    expect(xml).toContain("<saldoAceptado>8000000.00</saldoAceptado>");
    expect(xml).toContain("<codMoneda>PES</codMoneda>");
  });

  it("rechazarFECred embeds at least one motivoRechazo", () => {
    const xml = buildRechazarEnvelope({
      ticket: goodTicket,
      input: {
        idFactura: { cuitEmisor: "20123456786", codTipoCmp: 201, ptoVta: 3, nroCmp: 42 },
        motivos: [
          { codMotivo: 1, descMotivo: "Mercaderia no recibida", justificacion: "Remito sin entregar" },
        ],
      },
    });
    expect(xml).toContain("<fec:rechazarFECredRequest>");
    expect(xml).toContain("<codMotivo>1</codMotivo>");
    expect(xml).toContain("<justificacion>Remito sin entregar</justificacion>");
  });

  it("escapes XML-special chars in caller-supplied fields", () => {
    const xml = buildConsultarMontoObligadoEnvelope({
      ticket: { ...goodTicket, token: "a<b>c&d" },
      cuitConsultada: "30500000018",
      fechaEmision: "2026-06-12",
    });
    expect(xml).toContain("<token>a&lt;b&gt;c&amp;d</token>");
  });

  it("dummy envelope has an empty body (message has no parts)", () => {
    const xml = buildDummyEnvelope();
    expect(xml).toContain("soapenv:Body");
    expect(xml).not.toContain("dummyRequest");
  });
});

// ── parsers ─────────────────────────────────────────────────────

describe("parsers", () => {
  it("parses obligado=S with montoDesde", () => {
    const r = parseConsultarMontoObligadoResponse(MONTO_OBLIGADO_SOAP);
    expect(r.obligado).toBe(true);
    expect(r.montoDesde).toBe(5_500_000);
    expect(r.errors).toEqual([]);
  });

  it("parses obligado=N", () => {
    const r = parseConsultarMontoObligadoResponse(NO_OBLIGADO_SOAP);
    expect(r.obligado).toBe(false);
  });

  it("parses comprobante list with nested estado struct", () => {
    const r = parseConsultarComprobantesResponse(COMPROBANTES_SOAP);
    expect(r.comprobantes).toHaveLength(1);
    const c = r.comprobantes[0]!;
    expect(c.cuitEmisor).toBe("20123456786");
    expect(c.codTipoCmp).toBe(201);
    expect(c.ptoVta).toBe(3);
    expect(c.nroCmp).toBe(42);
    expect(c.importeTotal).toBe(8_000_000);
    expect(c.estado).toBe("Recepcionado");
    expect(c.fechaHoraEstado).toBe("2026-06-01T10:00:00");
    expect(r.hayMas).toBe(false);
    expect(r.nroPagina).toBe(1);
  });

  it("parses operacion resultado=A with codCtaCte", () => {
    const r = parseOperacionFECredResponse(OPERACION_OK_SOAP);
    expect(r.resultado).toBe("A");
    expect(r.codCtaCte).toBe(2561);
    expect(r.errors).toEqual([]);
  });

  it("parses operacion resultado=R with arrayErrores", () => {
    const r = parseOperacionFECredResponse(OPERACION_RECHAZADA_SOAP);
    expect(r.resultado).toBe("R");
    expect(r.errors[0]).toEqual({
      code: 1108,
      msg: "La cuenta corriente ya fue aceptada.",
    });
  });

  it("parses dummy (lowercase element names)", () => {
    const r = parseDummyResponse(DUMMY_SOAP);
    expect(r).toEqual({ appServer: "OK", dbServer: "OK", authServer: "OK" });
  });

  it("throws on SOAP fault", () => {
    const fault = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>TA expired</faultstring></soap:Fault></soap:Body></soap:Envelope>`;
    expect(() => parseOperacionFECredResponse(fault)).toThrow(/TA expired/);
  });

  it("throws on malformed response (no return block)", () => {
    expect(() => parseConsultarMontoObligadoResponse("<no-result/>")).toThrow(
      /missing consultarMontoObligadoRecepcionReturn/,
    );
    expect(() => parseOperacionFECredResponse("<no-result/>")).toThrow(
      /missing operacionFECredReturn/,
    );
  });
});

// ── UnconfiguredFecredAdapter ───────────────────────────────────

describe("UnconfiguredFecredAdapter", () => {
  const a = new UnconfiguredFecredAdapter();
  it("throws on every operation", async () => {
    await expect(a.checkObligation({ cuitConsultada: "30500000018" })).rejects.toThrow(
      FecredUnconfiguredError,
    );
    await expect(
      a.listComprobantes({ rol: "Receptor", fechaTipo: "Emision" }),
    ).rejects.toThrow(FecredUnconfiguredError);
    await expect(
      a.acceptInvoice({
        idFactura: { cuitEmisor: "20123456786", codTipoCmp: 201, ptoVta: 3, nroCmp: 42 },
        saldoAceptado: 1,
        codMoneda: "PES",
        cotizacionMonedaUlt: 1,
      }),
    ).rejects.toThrow(FecredUnconfiguredError);
    await expect(
      a.rejectInvoice({
        idFactura: { cuitEmisor: "20123456786", codTipoCmp: 201, ptoVta: 3, nroCmp: 42 },
        motivos: [{ codMotivo: 1, descMotivo: "x", justificacion: "y" }],
      }),
    ).rejects.toThrow(FecredUnconfiguredError);
    await expect(a.health()).rejects.toThrow(FecredUnconfiguredError);
  });
});

// ── HttpFecredAdapter ───────────────────────────────────────────

describe("HttpFecredAdapter", () => {
  it("targets the correct endpoint by env", async () => {
    const captured = vi.fn(() => ({ ok: true, status: 200, text: MONTO_OBLIGADO_SOAP }));
    const a = new HttpFecredAdapter({ env: "homo", ticket: goodTicket, fetch: mockFetch(captured) });
    await a.checkObligation({ cuitConsultada: "30500000018" });
    expect(captured.mock.calls[0]?.[0]).toBe(FECRED_URLS.homo);
  });

  it("sets the SOAPAction header per operation", async () => {
    const captured = vi.fn(() => ({ ok: true, status: 200, text: OPERACION_OK_SOAP }));
    const a = new HttpFecredAdapter({ env: "homo", ticket: goodTicket, fetch: mockFetch(captured) });
    await a.acceptInvoice({
      idFactura: { cuitEmisor: "20123456786", codTipoCmp: 201, ptoVta: 3, nroCmp: 42 },
      saldoAceptado: 100,
      codMoneda: "PES",
      cotizacionMonedaUlt: 1,
    });
    expect(captured.mock.calls[0]?.[1]?.headers?.soapaction).toContain("aceptarFECred");
  });

  it("defaults fechaEmision to today in checkObligation", async () => {
    const captured = vi.fn(() => ({ ok: true, status: 200, text: MONTO_OBLIGADO_SOAP }));
    const a = new HttpFecredAdapter({ env: "homo", ticket: goodTicket, fetch: mockFetch(captured) });
    await a.checkObligation({ cuitConsultada: "30500000018" });
    const today = new Date().toISOString().slice(0, 10);
    expect(captured.mock.calls[0]?.[1]?.body).toContain(`<fechaEmision>${today}</fechaEmision>`);
  });

  it("rejects bad input before doing any fetch", async () => {
    const captured = vi.fn(() => ({ ok: true, status: 200, text: MONTO_OBLIGADO_SOAP }));
    const a = new HttpFecredAdapter({ env: "homo", ticket: goodTicket, fetch: mockFetch(captured) });
    await expect(a.checkObligation({ cuitConsultada: "abc" })).rejects.toThrow(
      FecredValidationError,
    );
    expect(captured).not.toHaveBeenCalled();
  });

  it("rejects rejectInvoice without motivos before fetching", async () => {
    const captured = vi.fn(() => ({ ok: true, status: 200, text: OPERACION_OK_SOAP }));
    const a = new HttpFecredAdapter({ env: "homo", ticket: goodTicket, fetch: mockFetch(captured) });
    await expect(
      a.rejectInvoice({
        idFactura: { cuitEmisor: "20123456786", codTipoCmp: 201, ptoVta: 3, nroCmp: 42 },
        motivos: [],
      }),
    ).rejects.toThrow(FecredValidationError);
    expect(captured).not.toHaveBeenCalled();
  });

  it("translates HTTP 500 with faultstring into a FecredProtocolError", async () => {
    const a = new HttpFecredAdapter({
      env: "homo",
      ticket: goodTicket,
      fetch: mockFetch(() => ({
        ok: false,
        status: 500,
        text: `<soap:Fault><faultstring>token expired</faultstring></soap:Fault>`,
      })),
    });
    await expect(a.health()).rejects.toThrow(FecredProtocolError);
  });

  it("translates fetch failures into a FecredProtocolError", async () => {
    const a = new HttpFecredAdapter({
      env: "homo",
      ticket: goodTicket,
      fetch: () => Promise.reject(new Error("connection refused")),
    });
    await expect(a.checkObligation({ cuitConsultada: "30500000018" })).rejects.toThrow(
      /connection refused/,
    );
  });

  it("parses listComprobantes end to end through the adapter", async () => {
    const a = new HttpFecredAdapter({
      env: "homo",
      ticket: goodTicket,
      fetch: mockFetch(() => ({ ok: true, status: 200, text: COMPROBANTES_SOAP })),
    });
    const r = await a.listComprobantes({ rol: "Receptor", fechaTipo: "Emision" });
    expect(r.comprobantes[0]?.estado).toBe("Recepcionado");
  });
});

// ── InMemoryFecredAdapter ───────────────────────────────────────

describe("InMemoryFecredAdapter", () => {
  it("checkObligation answers from the configured CUIT set", async () => {
    const a = new InMemoryFecredAdapter({
      obligatedCuits: ["30-50000001-8"],
      montoDesde: 5_500_000,
    });
    const yes = await a.checkObligation({ cuitConsultada: "30500000018" });
    expect(yes.obligado).toBe(true);
    expect(yes.montoDesde).toBe(5_500_000);
    const no = await a.checkObligation({ cuitConsultada: "20123456786" });
    expect(no.obligado).toBe(false);
    expect(no.montoDesde).toBeNull();
  });

  it("listComprobantes filters by estadoCmp and contraparte", async () => {
    const a = new InMemoryFecredAdapter({
      comprobantes: [seedCmp(), seedCmp({ nroCmp: 43, estado: "Aceptado" })],
    });
    const pending = await a.listComprobantes({
      rol: "Receptor",
      fechaTipo: "Emision",
      estadoCmp: "Recepcionado",
    });
    expect(pending.comprobantes).toHaveLength(1);
    expect(pending.comprobantes[0]?.nroCmp).toBe(42);
    const byCuit = await a.listComprobantes({
      rol: "Receptor",
      fechaTipo: "Emision",
      cuitContraparte: "20-12345678-6",
    });
    expect(byCuit.comprobantes).toHaveLength(2);
  });

  it("acceptInvoice transitions Recepcionado to Aceptado", async () => {
    const a = new InMemoryFecredAdapter({ comprobantes: [seedCmp()] });
    const r = await a.acceptInvoice({
      idFactura: { cuitEmisor: "20-12345678-6", codTipoCmp: 201, ptoVta: 3, nroCmp: 42 },
      saldoAceptado: 8_000_000,
      codMoneda: "PES",
      cotizacionMonedaUlt: 1,
    });
    expect(r.resultado).toBe("A");
    expect(r.codCtaCte).toBe(2561);
    const after = await a.listComprobantes({
      rol: "Receptor",
      fechaTipo: "Emision",
      estadoCmp: "Aceptado",
    });
    expect(after.comprobantes).toHaveLength(1);
  });

  it("rejectInvoice transitions to Rechazado", async () => {
    const a = new InMemoryFecredAdapter({ comprobantes: [seedCmp()] });
    const r = await a.rejectInvoice({
      idFactura: { cuitEmisor: "20123456786", codTipoCmp: 201, ptoVta: 3, nroCmp: 42 },
      motivos: [{ codMotivo: 1, descMotivo: "Mercaderia no recibida", justificacion: "Sin remito" }],
    });
    expect(r.resultado).toBe("A");
    const after = await a.listComprobantes({
      rol: "Receptor",
      fechaTipo: "Emision",
      estadoCmp: "Rechazado",
    });
    expect(after.comprobantes).toHaveLength(1);
  });

  it("returns R with synthetic error for an unknown factura", async () => {
    const a = new InMemoryFecredAdapter();
    const r = await a.acceptInvoice({
      idFactura: { cuitEmisor: "20123456786", codTipoCmp: 201, ptoVta: 1, nroCmp: 999 },
      saldoAceptado: 1,
      codMoneda: "PES",
      cotizacionMonedaUlt: 1,
    });
    expect(r.resultado).toBe("R");
    expect(r.errors[0]?.code).toBe(1100);
  });

  it("refuses to accept/reject an already-settled factura", async () => {
    const a = new InMemoryFecredAdapter({ comprobantes: [seedCmp({ estado: "Aceptado" })] });
    const r = await a.rejectInvoice({
      idFactura: { cuitEmisor: "20123456786", codTipoCmp: 201, ptoVta: 3, nroCmp: 42 },
      motivos: [{ codMotivo: 1, descMotivo: "x", justificacion: "y" }],
    });
    expect(r.resultado).toBe("R");
    expect(r.errors[0]?.code).toBe(1101);
  });

  it("validates input even in memory", async () => {
    const a = new InMemoryFecredAdapter();
    await expect(a.checkObligation({ cuitConsultada: "garbage" })).rejects.toThrow(
      FecredValidationError,
    );
  });

  it("health returns all OK", async () => {
    expect(await new InMemoryFecredAdapter().health()).toEqual({
      appServer: "OK",
      dbServer: "OK",
      authServer: "OK",
    });
  });
});

// ── fecredTools ─────────────────────────────────────────────────

describe("fecredTools", () => {
  it("exposes all five tools by default", () => {
    const tools = fecredTools();
    expect(Object.keys(tools).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("respects include subset", () => {
    const tools = fecredTools({ include: ["fecred_check_obligation", "fecred_health"] });
    expect(Object.keys(tools)).toEqual(["fecred_check_obligation", "fecred_health"]);
  });

  it("irreversible tools warn about confirmation in their descriptions", () => {
    const tools = fecredTools();
    expect(
      (tools.fecred_accept_invoice as { description?: string }).description,
    ).toMatch(/IRREVERSIBLE/);
    expect(
      (tools.fecred_reject_invoice as { description?: string }).description,
    ).toMatch(/IRREVERSIBLE/);
  });

  it("executes against the in-memory adapter", async () => {
    const adapter = new InMemoryFecredAdapter({
      obligatedCuits: ["30500000018"],
      comprobantes: [seedCmp()],
    });
    const tools = fecredTools({ adapter });
    const oblig = await (tools.fecred_check_obligation as {
      execute: (i: unknown, o: unknown) => Promise<{ obligado: boolean }>;
    }).execute({ cuitConsultada: "30500000018" }, {});
    expect(oblig.obligado).toBe(true);
    const list = await (tools.fecred_list_received as {
      execute: (i: unknown, o: unknown) => Promise<{ comprobantes: ReadonlyArray<unknown> }>;
    }).execute({ estadoCmp: "Recepcionado" }, {});
    expect(list.comprobantes).toHaveLength(1);
  });

  it("default (unconfigured) adapter throws from tools", async () => {
    const tools = fecredTools();
    await expect(
      (tools.fecred_health as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute(
        {},
        {},
      ),
    ).rejects.toThrow(FecredUnconfiguredError);
  });
});
