import { describe, it, expect } from "vitest";
import {
  createFacturacionHook,
  selectFacturaType,
  type SellerFiscal,
  type WsfeAuthorizeResponse,
  type ArcaPadronLookupResult,
} from "../src/integrations";
import type { CheckoutSession } from "../src/schemas/checkout-session";
import type { Order } from "../src/schemas/order";

const seller: SellerFiscal = {
  cuit: "20123456786",
  punto_venta: 1,
  regime: "monotributo",
  legal_name: "Naza Clemente",
};

const baseSession: CheckoutSession = {
  id: "cs_abc",
  status: "completed",
  currency: "ars",
  line_items: [
    {
      id: "li_1",
      item: { id: "item_x", name: "X", unit_amount: 100000 }, // 1000 ARS
      quantity: 1,
      unit_amount: 100000,
      totals: [{ type: "subtotal", display_text: "S", amount: 100000 }],
    },
  ],
  fulfillment_options: [],
  totals: [{ type: "total", display_text: "T", amount: 121000 }], // 1210 ARS
  messages: [],
  links: [],
  buyer: {
    email: "tere@example.com",
    company: { name: "Tere SRL", tax_id: "30-71234567-8" },
  },
};

const baseOrder: Order = {
  type: "order",
  id: "ord_xyz",
  checkout_session_id: "cs_abc",
  permalink_url: "https://example.com/o/ord_xyz",
};

describe("selectFacturaType matrix", () => {
  it("monotributo seller always emits Factura C", () => {
    expect(selectFacturaType("monotributo", "consumidor_final")).toBe("C");
    expect(selectFacturaType("monotributo", "responsable_inscripto")).toBe("C");
    expect(selectFacturaType("monotributo", "monotributista")).toBe("C");
  });

  it("RI seller emits A for RI/monotributo buyers", () => {
    expect(selectFacturaType("responsable_inscripto", "responsable_inscripto"))
      .toBe("A");
    expect(selectFacturaType("responsable_inscripto", "monotributista")).toBe(
      "A",
    );
  });

  it("RI seller emits B for consumidor final", () => {
    expect(selectFacturaType("responsable_inscripto", "consumidor_final")).toBe(
      "B",
    );
  });

  it("Cross-border buyer always gets Factura E", () => {
    expect(selectFacturaType("monotributo", "extranjero")).toBe("E");
    expect(selectFacturaType("responsable_inscripto", "extranjero")).toBe("E");
  });
});

describe("createFacturacionHook", () => {
  function makeWsfe(response: WsfeAuthorizeResponse) {
    return { solicitarCAE: async () => response };
  }

  it("emits Factura C for monotributo seller, attaches CAE to metadata", async () => {
    const hook = createFacturacionHook({
      seller,
      wsfe: makeWsfe({
        cae: "70123456789012",
        vencimiento_cae: "20260520",
        numero_comprobante: 1,
        resultado: "A",
      }),
    });
    const out = await hook.onOrderConfirmed!({
      session: baseSession,
      order: baseOrder,
    });
    expect(out?.metadata?.["factura_type"]).toBe("C");
    expect(out?.metadata?.["factura_cae"]).toBe("70123456789012");
    expect(out?.metadata?.["factura_numero"]).toBe(1);
  });

  it("emits Factura A for RI seller + RI buyer (resolved via padron lookup)", async () => {
    let receivedReq: unknown = null;
    const arcaPadronLookup = async (
      cuit: string,
    ): Promise<ArcaPadronLookupResult | null> => ({
      cuit,
      legal_name: "Tere SRL",
      iva_condition: "responsable_inscripto",
    });
    const hook = createFacturacionHook({
      seller: { ...seller, regime: "responsable_inscripto" },
      arcaPadronLookup,
      wsfe: {
        solicitarCAE: async (req) => {
          receivedReq = req;
          return {
            cae: "70999999999999",
            vencimiento_cae: "20260601",
            numero_comprobante: 42,
            resultado: "A",
          };
        },
      },
    });
    const out = await hook.onOrderConfirmed!({
      session: baseSession,
      order: baseOrder,
    });
    expect(out?.metadata?.["factura_type"]).toBe("A");
    expect((receivedReq as { factura_type: string }).factura_type).toBe("A");
    // For RI, IVA % = 21, so neto = total / 1.21
    const totalMajor = 1210;
    const expectedNeto = totalMajor / 1.21;
    expect((receivedReq as { importe_neto: number }).importe_neto).toBeCloseTo(
      Math.round(expectedNeto * 100) / 100,
      2,
    );
  });

  it("captures WSFE rejection in metadata.factura_error", async () => {
    const hook = createFacturacionHook({
      seller,
      wsfe: makeWsfe({
        cae: "",
        vencimiento_cae: "",
        numero_comprobante: 0,
        resultado: "R",
        observaciones: ["Servicio no disponible"],
      }),
    });
    const out = await hook.onOrderConfirmed!({
      session: baseSession,
      order: baseOrder,
    });
    expect(out?.metadata?.["factura_error"]).toContain("Servicio no disponible");
    expect(out?.metadata?.["factura_cae"]).toBeUndefined();
  });

  it("captures thrown WSFE errors in metadata.factura_error", async () => {
    const hook = createFacturacionHook({
      seller,
      wsfe: {
        solicitarCAE: async () => {
          throw new Error("network down");
        },
      },
    });
    const out = await hook.onOrderConfirmed!({
      session: baseSession,
      order: baseOrder,
    });
    expect(out?.metadata?.["factura_error"]).toContain("network down");
  });

  it("invokes onEmission with success=true on success", async () => {
    let received: unknown = null;
    const hook = createFacturacionHook({
      seller,
      wsfe: makeWsfe({
        cae: "70000000000001",
        vencimiento_cae: "20260520",
        numero_comprobante: 5,
        resultado: "A",
      }),
      onEmission: (e) => {
        received = e;
      },
    });
    await hook.onOrderConfirmed!({
      session: baseSession,
      order: baseOrder,
    });
    expect((received as { success: boolean }).success).toBe(true);
    expect((received as { cae: string }).cae).toBe("70000000000001");
  });

  it("falls back to consumidor_final when no padron lookup is configured", async () => {
    let receivedReq: unknown = null;
    const hook = createFacturacionHook({
      seller, // monotributo
      wsfe: {
        solicitarCAE: async (req) => {
          receivedReq = req;
          return {
            cae: "70123456789013",
            vencimiento_cae: "20260520",
            numero_comprobante: 99,
            resultado: "A",
          };
        },
      },
    });
    const out = await hook.onOrderConfirmed!({
      session: baseSession,
      order: baseOrder,
    });
    expect(out?.metadata?.["factura_type"]).toBe("C");
    // monotributo + consumidor_final => Factura C, no IVA breakdown
    expect((receivedReq as { importe_iva: number }).importe_iva).toBe(0);
  });

  it("skips emission when buyer cannot be resolved at all", async () => {
    const sessionWithoutBuyer: CheckoutSession = {
      ...baseSession,
      buyer: undefined,
    };
    const hook = createFacturacionHook({
      seller,
      wsfe: makeWsfe({
        cae: "x",
        vencimiento_cae: "x",
        numero_comprobante: 1,
        resultado: "A",
      }),
    });
    const out = await hook.onOrderConfirmed!({
      session: sessionWithoutBuyer,
      order: baseOrder,
    });
    expect(out?.metadata?.["factura_skipped"]).toBe(
      "no_buyer_fiscal_resolved",
    );
  });

  it("uses resolveBuyer override when provided", async () => {
    const hook = createFacturacionHook({
      seller,
      wsfe: makeWsfe({
        cae: "70AAAA",
        vencimiento_cae: "20260520",
        numero_comprobante: 1,
        resultado: "A",
      }),
      resolveBuyer: async () => ({
        iva_condition: "extranjero",
        doc_type: "PASSPORT",
        doc_number: "AB123456",
        legal_name: "Foreign Buyer",
      }),
    });
    const out = await hook.onOrderConfirmed!({
      session: baseSession,
      order: baseOrder,
    });
    expect(out?.metadata?.["factura_type"]).toBe("E");
    expect(out?.metadata?.["factura_buyer_legal_name"]).toBe("Foreign Buyer");
  });
});
