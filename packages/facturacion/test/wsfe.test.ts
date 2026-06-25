import { describe, expect, it, vi } from "vitest";
import {
  consultarComprobante,
  consultarUltimoAutorizado,
  dummy,
  getTiposCbte,
  solicitarCAE,
} from "../src/wsfe";
import {
  CbteTipo,
  Concepto,
  DocTipo,
  AlicuotaIva,
  CondicionIvaReceptor,
} from "../src/catalogs";
import {
  FE_DUMMY_OK,
  FE_PARAM_TIPOS_CBTE,
  FE_SOAP_FAULT,
  FE_SOLICITAR_CAE_APROBADO,
  FE_SOLICITAR_CAE_RECHAZADO,
  FE_ULTIMO_AUTORIZADO_OK,
} from "./fixtures/wsfe-responses";

const ta = {
  token: "FAKE_TOKEN",
  sign: "FAKE_SIGN",
  expirationTimeMs: Date.now() + 3600_000,
  service: "wsfe",
};

const baseOpts = {
  ta,
  env: "homo" as const,
  cuit: "20123456786",
  endpointOverride: "https://test/wsfe",
  maxRetries: 0,
};

function fakeFetchReturning(xml: string): typeof fetch {
  return vi.fn(
    async () =>
      new Response(xml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }),
  ) as unknown as typeof fetch;
}

describe("dummy", () => {
  it("parses a healthy response", async () => {
    const fetchImpl = fakeFetchReturning(FE_DUMMY_OK);
    const r = await dummy({ ...baseOpts, fetchImpl });
    expect(r.appServer).toBe("OK");
    expect(r.dbServer).toBe("OK");
    expect(r.authServer).toBe("OK");
  });

  it("throws on SOAP Fault", async () => {
    const fetchImpl = fakeFetchReturning(FE_SOAP_FAULT);
    await expect(dummy({ ...baseOpts, fetchImpl })).rejects.toThrow(
      /Token expired/,
    );
  });
});

describe("consultarUltimoAutorizado", () => {
  it("parses the last comprobante number", async () => {
    const fetchImpl = fakeFetchReturning(FE_ULTIMO_AUTORIZADO_OK);
    const r = await consultarUltimoAutorizado({
      ...baseOpts,
      fetchImpl,
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
    });
    expect(r.cbteNro).toBe(42);
    expect(r.ptoVta).toBe(1);
    expect(r.cbteTipo).toBe(11);
  });

  it("sends ptoVta + cbteTipo in the SOAP body", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return new Response(FE_ULTIMO_AUTORIZADO_OK, { status: 200 });
    }) as unknown as typeof fetch;
    await consultarUltimoAutorizado({
      ...baseOpts,
      fetchImpl,
      ptoVta: 7,
      cbteTipo: CbteTipo.FACTURA_B,
    });
    expect(capturedBody).toContain("<fev1:PtoVta>7</fev1:PtoVta>");
    expect(capturedBody).toContain("<fev1:CbteTipo>6</fev1:CbteTipo>");
    expect(capturedBody).toContain("<fev1:Token>FAKE_TOKEN</fev1:Token>");
    expect(capturedBody).toContain("<fev1:Cuit>20123456786</fev1:Cuit>");
  });
});

describe("solicitarCAE — RG 5616 CondicionIVAReceptorId", () => {
  async function captureBody(extra: Record<string, unknown>) {
    let body = "";
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      body = init.body as string;
      return new Response(FE_SOLICITAR_CAE_APROBADO, { status: 200 });
    }) as unknown as typeof fetch;
    await solicitarCAE({
      ...baseOpts,
      fetchImpl,
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
      concepto: Concepto.PRODUCTOS,
      docTipo: DocTipo.CONSUMIDOR_FINAL,
      docNro: 0,
      cbteDesde: 1,
      cbteHasta: 1,
      cbteFch: "20260518",
      impTotal: 100,
      impNeto: 100,
      impIVA: 0,
      ...extra,
    });
    return body;
  }
  it("defaults to Consumidor Final (5) for DocTipo 99 (RG 5616)", async () => {
    expect(await captureBody({})).toContain(
      "<fev1:CondicionIVAReceptorId>5</fev1:CondicionIVAReceptorId>",
    );
  });
  it("honours an explicit condicionIvaReceptorId", async () => {
    expect(
      await captureBody({
        condicionIvaReceptorId: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
      }),
    ).toContain(
      "<fev1:CondicionIVAReceptorId>1</fev1:CondicionIVAReceptorId>",
    );
  });
});

describe("solicitarCAE — happy path", () => {
  it("parses an approved CAE response", async () => {
    const fetchImpl = fakeFetchReturning(FE_SOLICITAR_CAE_APROBADO);
    const r = await solicitarCAE({
      ...baseOpts,
      fetchImpl,
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
      concepto: Concepto.SERVICIOS,
      docTipo: DocTipo.CUIT,
      docNro: "20123456786",
      cbteDesde: 43,
      cbteHasta: 43,
      cbteFch: "20260506",
      impTotal: 100,
      impNeto: 100,
      impIVA: 0,
      fchServDesde: "20260501",
      fchServHasta: "20260531",
      fchVtoPago: "20260615",
    });
    expect(r.resultado).toBe("A");
    expect(r.cae).toBe("76123456789012");
    expect(r.caeFchVto).toBe("20260516");
    expect(r.cbteDesde).toBe(43);
    expect(r.errors).toEqual([]);
  });

  it("includes Iva block when iva is provided", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return new Response(FE_SOLICITAR_CAE_APROBADO, { status: 200 });
    }) as unknown as typeof fetch;
    await solicitarCAE({
      ...baseOpts,
      fetchImpl,
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_B,
      concepto: Concepto.PRODUCTOS,
      docTipo: DocTipo.DNI,
      docNro: "12345678",
      cbteDesde: 1,
      cbteHasta: 1,
      cbteFch: "20260506",
      impTotal: 121,
      impNeto: 100,
      impIVA: 21,
      iva: [{ id: AlicuotaIva.VEINTIUNO.id, baseImp: 100, importe: 21 }],
    });
    expect(capturedBody).toContain("<fev1:Iva>");
    expect(capturedBody).toContain("<fev1:Id>5</fev1:Id>");
    expect(capturedBody).toContain("<fev1:BaseImp>100.00</fev1:BaseImp>");
    expect(capturedBody).toContain("<fev1:Importe>21.00</fev1:Importe>");
  });

  it("formats amounts to 2 decimals", async () => {
    let capturedBody = "";
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return new Response(FE_SOLICITAR_CAE_APROBADO, { status: 200 });
    }) as unknown as typeof fetch;
    await solicitarCAE({
      ...baseOpts,
      fetchImpl,
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
      concepto: Concepto.SERVICIOS,
      docTipo: DocTipo.CUIT,
      docNro: "20123456786",
      cbteDesde: 1,
      cbteHasta: 1,
      cbteFch: "20260506",
      impTotal: 12345.6789,
      impNeto: 12345.6789,
      impIVA: 0,
      fchServDesde: "20260501",
      fchServHasta: "20260531",
      fchVtoPago: "20260615",
    });
    expect(capturedBody).toContain("<fev1:ImpTotal>12345.68</fev1:ImpTotal>");
    expect(capturedBody).toContain("<fev1:ImpNeto>12345.68</fev1:ImpNeto>");
  });
});

describe("solicitarCAE — rechazado", () => {
  it("parses observaciones from a rejected response", async () => {
    const fetchImpl = fakeFetchReturning(FE_SOLICITAR_CAE_RECHAZADO);
    const r = await solicitarCAE({
      ...baseOpts,
      fetchImpl,
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
      concepto: Concepto.SERVICIOS,
      docTipo: DocTipo.CUIT,
      docNro: "20123456786",
      cbteDesde: 43,
      cbteHasta: 43,
      cbteFch: "20260506",
      impTotal: 200,
      impNeto: 100,
      impIVA: 0,
      fchServDesde: "20260501",
      fchServHasta: "20260531",
      fchVtoPago: "20260615",
    });
    expect(r.resultado).toBe("R");
    expect(r.cae).toBeNull();
    expect(r.observaciones).toHaveLength(1);
    expect(r.observaciones[0]!.code).toBe(10048);
    expect(r.observaciones[0]!.msg).toMatch(/Importe Total/);
  });
});

describe("solicitarCAE — SOAP-XML injection hardening (DeepSec MEDIUM)", () => {
  async function captureBody(extra: Record<string, unknown>) {
    let body = "";
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      body = init.body as string;
      return new Response(FE_SOLICITAR_CAE_APROBADO, { status: 200 });
    }) as unknown as typeof fetch;
    await solicitarCAE({
      ...baseOpts,
      fetchImpl,
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
      concepto: Concepto.SERVICIOS,
      docTipo: DocTipo.CUIT,
      docNro: "20123456786",
      cbteDesde: 1,
      cbteHasta: 1,
      cbteFch: "20260506",
      impTotal: 100,
      impNeto: 100,
      impIVA: 0,
      fchServDesde: "20260501",
      fchServHasta: "20260531",
      fchVtoPago: "20260615",
      ...extra,
    });
    return body;
  }

  const PAYLOAD = `</fev1:X><fev1:Injected>&pwn;`;

  it("escapes a hostile fchVtoPago instead of letting it break the envelope", async () => {
    const body = await captureBody({ fchVtoPago: PAYLOAD });
    expect(body).not.toContain("<fev1:Injected>");
    expect(body).toContain("&lt;/fev1:X&gt;&lt;fev1:Injected&gt;&amp;pwn;");
  });

  it("escapes a hostile monId", async () => {
    const body = await captureBody({ monId: `PES></fev1:MonId><evil/>` });
    expect(body).not.toContain("<evil/>");
    expect(body).toContain("PES&gt;&lt;/fev1:MonId&gt;&lt;evil/&gt;");
  });

  it("escapes a hostile docNro (string|number field, coerced)", async () => {
    const body = await captureBody({ docNro: `0</fev1:DocNro><x>` });
    expect(body).not.toContain("</fev1:DocNro><x>");
    expect(body).toContain("0&lt;/fev1:DocNro&gt;&lt;x&gt;");
  });

  it("escapes hostile cbtesAsoc cuit + fecha", async () => {
    const body = await captureBody({
      cbtesAsoc: [
        {
          tipo: CbteTipo.FACTURA_C,
          ptoVta: 1,
          nro: 1,
          cuit: `<inj/>`,
          fecha: `<inj2/>`,
        },
      ],
    });
    expect(body).not.toContain("<inj/>");
    expect(body).not.toContain("<inj2/>");
    expect(body).toContain("&lt;inj/&gt;");
    expect(body).toContain("&lt;inj2/&gt;");
  });

  it("escapes a hostile auth CUIT in the Auth block", async () => {
    const body = await captureBody({ cuit: `20123456786</fev1:Cuit><evil/>` });
    expect(body).not.toContain("<evil/>");
    expect(body).toContain("&lt;/fev1:Cuit&gt;&lt;evil/&gt;");
  });
});

describe("consultarComprobante", () => {
  it("returns found=false when AFIP returns errors", async () => {
    const errorResponse = `<?xml version="1.0"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
            <FECompConsultarResult>
              <Errors><Err><Code>602</Code><Msg>No existe el comprobante</Msg></Err></Errors>
            </FECompConsultarResult>
          </FECompConsultarResponse>
        </soap:Body>
      </soap:Envelope>`;
    const fetchImpl = fakeFetchReturning(errorResponse);
    const r = await consultarComprobante({
      ...baseOpts,
      fetchImpl,
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
      cbteNro: 999,
    });
    expect(r.found).toBe(false);
    expect(r.observaciones[0]!.code).toBe(602);
  });
});

describe("getTiposCbte", () => {
  it("parses a multi-item catalog response", async () => {
    const fetchImpl = fakeFetchReturning(FE_PARAM_TIPOS_CBTE);
    const items = await getTiposCbte({ ...baseOpts, fetchImpl });
    expect(items).toHaveLength(2);
    expect(items[0]!.id).toBe("1");
    expect(items[0]!.desc).toBe("Factura A");
    expect(items[1]!.id).toBe("11");
  });
});
