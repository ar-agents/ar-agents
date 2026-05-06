import { describe, expect, it } from "vitest";
import {
  AlicuotaIva,
  CbteTipo,
  Concepto,
  describeCbteTipo,
  DocTipo,
  Moneda,
} from "../src/catalogs";

describe("CbteTipo", () => {
  it("has the canonical fac/nota codes", () => {
    expect(CbteTipo.FACTURA_A).toBe(1);
    expect(CbteTipo.FACTURA_B).toBe(6);
    expect(CbteTipo.FACTURA_C).toBe(11);
    expect(CbteTipo.NOTA_DEBITO_A).toBe(2);
    expect(CbteTipo.NOTA_CREDITO_A).toBe(3);
    expect(CbteTipo.NOTA_DEBITO_B).toBe(7);
    expect(CbteTipo.NOTA_CREDITO_B).toBe(8);
    expect(CbteTipo.NOTA_DEBITO_C).toBe(12);
    expect(CbteTipo.NOTA_CREDITO_C).toBe(13);
  });

  it("has the FCE MiPyMEs codes (RG 4367)", () => {
    expect(CbteTipo.FCE_FACTURA_A).toBe(201);
    expect(CbteTipo.FCE_FACTURA_B).toBe(206);
    expect(CbteTipo.FCE_FACTURA_C).toBe(211);
  });

  it("has Factura E for exports", () => {
    expect(CbteTipo.FACTURA_E).toBe(19);
  });
});

describe("DocTipo", () => {
  it("has the common doc codes", () => {
    expect(DocTipo.CUIT).toBe(80);
    expect(DocTipo.CUIL).toBe(86);
    expect(DocTipo.DNI).toBe(96);
    expect(DocTipo.PASAPORTE).toBe(94);
    expect(DocTipo.CONSUMIDOR_FINAL).toBe(99);
  });
});

describe("Concepto", () => {
  it("has 1, 2, 3", () => {
    expect(Concepto.PRODUCTOS).toBe(1);
    expect(Concepto.SERVICIOS).toBe(2);
    expect(Concepto.PRODUCTOS_Y_SERVICIOS).toBe(3);
  });
});

describe("AlicuotaIva", () => {
  it("matches AFIP-published rates", () => {
    expect(AlicuotaIva.VEINTIUNO.percent).toBe(21);
    expect(AlicuotaIva.VEINTIUNO.id).toBe(5);
    expect(AlicuotaIva.DIEZ_CINCO.percent).toBe(10.5);
    expect(AlicuotaIva.DIEZ_CINCO.id).toBe(4);
    expect(AlicuotaIva.CERO.percent).toBe(0);
    expect(AlicuotaIva.CERO.id).toBe(3);
  });
});

describe("Moneda", () => {
  it("has PES and DOL", () => {
    expect(Moneda.PESOS).toBe("PES");
    expect(Moneda.DOLAR).toBe("DOL");
  });
});

describe("describeCbteTipo", () => {
  it("describes the common types in Spanish", () => {
    expect(describeCbteTipo(1)).toBe("Factura A");
    expect(describeCbteTipo(6)).toBe("Factura B");
    expect(describeCbteTipo(11)).toBe("Factura C");
    expect(describeCbteTipo(3)).toBe("Nota de Crédito A");
    expect(describeCbteTipo(13)).toBe("Nota de Crédito C");
    expect(describeCbteTipo(201)).toBe("FCE Factura A");
  });

  it("falls back to a generic label for unknown codes", () => {
    expect(describeCbteTipo(9999)).toBe("Comprobante tipo 9999");
  });
});
