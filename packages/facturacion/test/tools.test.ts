import { describe, expect, it } from "vitest";
import { facturacionTools } from "../src/tools";
import { CbteTipo, Concepto, DocTipo } from "../src/catalogs";

describe("facturacionTools — unconfigured", () => {
  it("exposes 10 tools", () => {
    const tools = facturacionTools();
    expect(Object.keys(tools).sort()).toEqual([
      "consultar_factura_emitida",
      "consultar_ultimo_comprobante",
      "emitir_factura",
      "health_check_afip",
      "obtener_alicuotas_iva",
      "obtener_cotizacion",
      "obtener_tipos_comprobante",
      "obtener_tipos_concepto",
      "obtener_tipos_documento",
      "obtener_tipos_moneda",
    ]);
  });

  it("emitir_factura returns 'not configured' when no client passed", async () => {
    const tools = facturacionTools();
    const r = await (tools.emitir_factura as any).execute({
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
      concepto: Concepto.SERVICIOS,
      docTipo: DocTipo.CUIT,
      docNro: "20417581015",
      cbteFch: "20260506",
      impTotal: 100,
      impNeto: 100,
      impIVA: 0,
      cbteDesde: 1,
      fchServDesde: "20260501",
      fchServHasta: "20260531",
      fchVtoPago: "20260615",
    });
    expect(r.available).toBe(false);
    expect(r.error).toMatch(/no está configurado/i);
  });

  it("descriptions can be overridden", () => {
    const tools = facturacionTools({
      descriptions: { emitir_factura: "Custom emisión" },
    });
    expect((tools.emitir_factura as any).description).toBe("Custom emisión");
  });
});

describe("facturacionTools — local validation", () => {
  it("emitir_factura runs local validation BEFORE hitting the client", async () => {
    // Stub client that throws if reached
    const stubWsfe = {
      solicitarCAE: async () => {
        throw new Error("should not be reached");
      },
    } as any;
    const tools = facturacionTools({ wsfe: stubWsfe });
    const r = await (tools.emitir_factura as any).execute({
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
      concepto: Concepto.SERVICIOS,
      docTipo: DocTipo.CUIT,
      docNro: "20417581015",
      cbteFch: "20260506",
      impTotal: 200, // bad: impNeto=100, impIVA=0 → expected total 100
      impNeto: 100,
      impIVA: 0,
      cbteDesde: 1,
      fchServDesde: "20260501",
      fchServHasta: "20260531",
      fchVtoPago: "20260615",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Validación local/);
    expect(r.errors).toBeDefined();
  });

  it("uses defaultPtoVta when ptoVta omitted from input", async () => {
    let calledWithPtoVta: number | undefined;
    const stubWsfe = {
      solicitarCAE: async (input: any) => {
        calledWithPtoVta = input.ptoVta;
        return {
          resultado: "A",
          cae: "76123456789012",
          caeFchVto: "20260516",
          ptoVta: input.ptoVta,
          cbteTipo: input.cbteTipo,
          cbteDesde: input.cbteDesde,
          cbteHasta: input.cbteHasta,
          cbteFch: input.cbteFch,
          fchProceso: "20260506",
          observaciones: [],
          errors: [],
          eventos: [],
        };
      },
    } as any;
    const tools = facturacionTools({ wsfe: stubWsfe, defaultPtoVta: 7 });
    await (tools.emitir_factura as any).execute({
      cbteTipo: CbteTipo.FACTURA_C,
      concepto: Concepto.SERVICIOS,
      docTipo: DocTipo.CUIT,
      docNro: "20417581015",
      cbteFch: "20260506",
      impTotal: 100,
      impNeto: 100,
      impIVA: 0,
      cbteDesde: 1,
      fchServDesde: "20260501",
      fchServHasta: "20260531",
      fchVtoPago: "20260615",
    });
    expect(calledWithPtoVta).toBe(7);
  });

  it("consultar_ultimo_comprobante adds proximoNumero to result", async () => {
    const stubWsfe = {
      consultarUltimoAutorizado: async () => ({
        ptoVta: 1,
        cbteTipo: 11,
        cbteNro: 42,
      }),
    } as any;
    const tools = facturacionTools({ wsfe: stubWsfe });
    const r = await (tools.consultar_ultimo_comprobante as any).execute({
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
    });
    expect(r.proximoNumero).toBe(43);
    expect(r.tipoComprobanteDescripcion).toBe("Factura C");
  });
});

describe("facturacionTools — catalog tools", () => {
  const stubWsfe = {
    getTiposCbte: async () => [{ id: "1", desc: "Factura A" }],
    getTiposDoc: async () => [{ id: "80", desc: "CUIT" }],
    getTiposIva: async () => [{ id: "5", desc: "21%" }],
    getTiposConcepto: async () => [{ id: "1", desc: "Productos" }],
    getTiposMonedas: async () => [{ id: "PES", desc: "Pesos Argentinos" }],
    getCotizacion: async () => ({ monId: "DOL", cotiz: 1180.5, fchCotiz: "20260506" }),
    dummy: async () => ({ appServer: "OK", dbServer: "OK", authServer: "OK" }),
    consultarComprobante: async () => ({
      found: true,
      ptoVta: 1,
      cbteTipo: 11,
      cbteDesde: 5,
      cbteHasta: 5,
      cbteFch: "20260506",
      cae: "76123456789012",
      caeFchVto: "20260516",
      resultado: "A",
      emisionTipo: "CAE",
      docTipo: 80,
      docNro: "20417581015",
      impTotal: 100,
      impNeto: 100,
      impIVA: 0,
      observaciones: [],
    }),
  } as any;

  it("obtener_tipos_comprobante returns the catalog", async () => {
    const tools = facturacionTools({ wsfe: stubWsfe });
    const r = await (tools.obtener_tipos_comprobante as any).execute({});
    expect(r.available).toBe(true);
    expect(r.items).toHaveLength(1);
  });

  it("obtener_tipos_documento returns the catalog", async () => {
    const tools = facturacionTools({ wsfe: stubWsfe });
    const r = await (tools.obtener_tipos_documento as any).execute({});
    expect(r.items[0].id).toBe("80");
  });

  it("obtener_alicuotas_iva returns the catalog", async () => {
    const tools = facturacionTools({ wsfe: stubWsfe });
    const r = await (tools.obtener_alicuotas_iva as any).execute({});
    expect(r.items[0].desc).toBe("21%");
  });

  it("obtener_tipos_concepto returns the catalog", async () => {
    const tools = facturacionTools({ wsfe: stubWsfe });
    const r = await (tools.obtener_tipos_concepto as any).execute({});
    expect(r.items[0].desc).toBe("Productos");
  });

  it("obtener_tipos_moneda returns the catalog", async () => {
    const tools = facturacionTools({ wsfe: stubWsfe });
    const r = await (tools.obtener_tipos_moneda as any).execute({});
    expect(r.items[0].id).toBe("PES");
  });

  it("obtener_cotizacion returns the rate", async () => {
    const tools = facturacionTools({ wsfe: stubWsfe });
    const r = await (tools.obtener_cotizacion as any).execute({ monId: "DOL" });
    expect(r.cotiz).toBe(1180.5);
  });

  it("health_check_afip flags ok=true when all servers OK", async () => {
    const tools = facturacionTools({ wsfe: stubWsfe });
    const r = await (tools.health_check_afip as any).execute({});
    expect(r.ok).toBe(true);
    expect(r.appServer).toBe("OK");
  });

  it("consultar_factura_emitida returns the comprobante", async () => {
    const tools = facturacionTools({ wsfe: stubWsfe });
    const r = await (tools.consultar_factura_emitida as any).execute({
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
      cbteNro: 5,
    });
    expect(r.cae).toBe("76123456789012");
    expect(r.tipoComprobanteDescripcion).toBe("Factura C");
  });

  it("emitir_factura returns approved CAE on happy path", async () => {
    const stubOk = {
      ...stubWsfe,
      solicitarCAE: async (input: any) => ({
        resultado: "A",
        cae: "76123456789012",
        caeFchVto: "20260516",
        ptoVta: input.ptoVta,
        cbteTipo: input.cbteTipo,
        cbteDesde: input.cbteDesde,
        cbteHasta: input.cbteHasta,
        cbteFch: input.cbteFch,
        fchProceso: "20260506",
        observaciones: [],
        errors: [],
        eventos: [],
      }),
    };
    const tools = facturacionTools({ wsfe: stubOk });
    const r = await (tools.emitir_factura as any).execute({
      ptoVta: 1,
      cbteTipo: CbteTipo.FACTURA_C,
      concepto: 2,
      docTipo: 80,
      docNro: "20417581015",
      cbteFch: "20260506",
      impTotal: 100,
      impNeto: 100,
      impIVA: 0,
      cbteDesde: 1,
      fchServDesde: "20260501",
      fchServHasta: "20260531",
      fchVtoPago: "20260615",
    });
    expect(r.ok).toBe(true);
    expect(r.cae).toBe("76123456789012");
  });
});
