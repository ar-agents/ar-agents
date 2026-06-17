import { describe, expect, it } from "vitest";
import { validateSolicitarCae } from "../src/validator";
import { AlicuotaIva, CbteTipo, Concepto, DocTipo } from "../src/catalogs";
import type { SolicitarCaeInput } from "../src/types";

const factCBase: SolicitarCaeInput = {
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
};

describe("validateSolicitarCae — happy paths", () => {
  it("approves a clean Factura C servicios", () => {
    const v = validateSolicitarCae(factCBase);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("approves a Factura B with discriminated IVA", () => {
    const v = validateSolicitarCae({
      ...factCBase,
      cbteTipo: CbteTipo.FACTURA_B,
      concepto: Concepto.PRODUCTOS,
      impNeto: 100,
      impIVA: 21,
      impTotal: 121,
      iva: [
        {
          id: AlicuotaIva.VEINTIUNO.id,
          baseImp: 100,
          importe: 21,
        },
      ],
      // products → service dates not required
      fchServDesde: undefined,
      fchServHasta: undefined,
      fchVtoPago: undefined,
    });
    expect(v.valid).toBe(true);
  });

  it("approves a Nota de Crédito C with cbtesAsoc", () => {
    const v = validateSolicitarCae({
      ...factCBase,
      cbteTipo: CbteTipo.NOTA_CREDITO_C,
      cbtesAsoc: [
        {
          tipo: CbteTipo.FACTURA_C,
          ptoVta: 1,
          nro: 5,
        },
      ],
    });
    expect(v.valid).toBe(true);
  });
});

describe("validateSolicitarCae — error cases", () => {
  it("rejects when impTotal != sum of components (AFIP error 10048)", () => {
    const v = validateSolicitarCae({ ...factCBase, impTotal: 200, impNeto: 100, impIVA: 0 });
    expect(v.valid).toBe(false);
    expect(v.errors[0]!.field).toBe("impTotal");
    expect(v.errors[0]!.message).toMatch(/10048/);
  });

  it("rejects Factura C with impIVA > 0", () => {
    const v = validateSolicitarCae({
      ...factCBase,
      impIVA: 21,
      impNeto: 100,
      impTotal: 121,
    });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.field === "impIVA")).toBe(true);
  });

  it("rejects Factura B with iva sum != impIVA", () => {
    const v = validateSolicitarCae({
      ...factCBase,
      cbteTipo: CbteTipo.FACTURA_B,
      concepto: Concepto.PRODUCTOS,
      impNeto: 100,
      impIVA: 21,
      impTotal: 121,
      fchServDesde: undefined,
      fchServHasta: undefined,
      fchVtoPago: undefined,
      iva: [
        {
          id: AlicuotaIva.VEINTIUNO.id,
          baseImp: 100,
          importe: 5, // wrong!
        },
      ],
    });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.field === "iva")).toBe(true);
  });

  it("rejects servicios sin fchServDesde", () => {
    const v = validateSolicitarCae({
      ...factCBase,
      fchServDesde: undefined,
      fchServHasta: undefined,
      fchVtoPago: undefined,
    });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.field === "fchServDesde")).toBe(true);
  });

  it("rejects malformed cbteFch", () => {
    const v = validateSolicitarCae({ ...factCBase, cbteFch: "2026-05-06" });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.field === "cbteFch")).toBe(true);
  });

  it("rejects ptoVta = 0", () => {
    const v = validateSolicitarCae({ ...factCBase, ptoVta: 0 });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.field === "ptoVta")).toBe(true);
  });

  it("rejects Nota de Crédito sin cbtesAsoc", () => {
    const v = validateSolicitarCae({
      ...factCBase,
      cbteTipo: CbteTipo.NOTA_CREDITO_C,
    });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.field === "cbtesAsoc")).toBe(true);
  });

  it("rejects monId !== PES con monCotiz = 1", () => {
    const v = validateSolicitarCae({
      ...factCBase,
      monId: "DOL",
      monCotiz: 1,
    });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.field === "monCotiz")).toBe(true);
  });

  it("rejects cbteHasta < cbteDesde", () => {
    const v = validateSolicitarCae({
      ...factCBase,
      cbteDesde: 5,
      cbteHasta: 3,
    });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.field === "cbteHasta")).toBe(true);
  });

  it("rejects ImpIVA > 0 sin filas iva en Factura B", () => {
    const v = validateSolicitarCae({
      ...factCBase,
      cbteTipo: CbteTipo.FACTURA_B,
      concepto: Concepto.PRODUCTOS,
      impNeto: 100,
      impIVA: 21,
      impTotal: 121,
      fchServDesde: undefined,
      fchServHasta: undefined,
      fchVtoPago: undefined,
    });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.field === "iva")).toBe(true);
  });
});
