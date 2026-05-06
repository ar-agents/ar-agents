import { describe, expect, it } from "vitest";
import { facturacionTools } from "../src/tools";

/**
 * The cbteTipo / docTipo / iva.id / concepto Zod enums in `emitir_factura`
 * were tightened from open `z.number().int()` to closed `z.union` of
 * `z.literal()` lists. If a typo in the literal list silently rejects a
 * real AFIP code, the agent layer surfaces a confusing validation error
 * instead of letting AFIP respond.
 *
 * These tests assert that EVERY documented AFIP code in `catalogs.ts`
 * also passes the Zod schema, and a sample of clearly-invalid codes
 * (5/95/99 for cbteTipo etc.) are rejected.
 *
 * If you add a new code to `catalogs.ts`, add it here AND to the Zod
 * union in `tools.ts`. The CI run of this test will fail loudly if drift
 * happens.
 */

const tools = facturacionTools({ defaultPtoVta: 1 });
const schema = tools.emitir_factura.inputSchema;

const validBase = {
  cbteFch: "20260506",
  impTotal: 121,
  impNeto: 100,
  impIVA: 21,
  cbteDesde: 1,
  docNro: 0,
};

describe("emitir_factura — cbteTipo enum coverage", () => {
  // Every code declared in catalogs.ts CbteTipo. If you add one there,
  // add one here AND in tools.ts's z.union.
  const VALID_CBTE_TIPOS = [
    1, 2, 3, 4, 5, // A-series
    6, 7, 8, 9, 10, // B-series
    11, 12, 13, 15, // C-series
    19, 20, 21, // E-series (export)
    51, 52, 53, 54, // M-series
    201, 202, 203, 206, 207, 208, 211, 212, 213, // FCE MiPyMEs
  ];

  for (const code of VALID_CBTE_TIPOS) {
    it(`accepts cbteTipo = ${code}`, () => {
      const r = schema.safeParse({ ...validBase, cbteTipo: code, concepto: 1, docTipo: 99 });
      expect(r.success).toBe(true);
    });
  }

  const INVALID_CBTE_TIPOS = [0, 14, 16, 17, 18, 22, 50, 99, 100, 200, 214, 999];
  for (const code of INVALID_CBTE_TIPOS) {
    it(`rejects cbteTipo = ${code}`, () => {
      const r = schema.safeParse({ ...validBase, cbteTipo: code, concepto: 1, docTipo: 99 });
      expect(r.success).toBe(false);
    });
  }
});

describe("emitir_factura — docTipo enum coverage", () => {
  const VALID_DOC_TIPOS = [80, 86, 87, 89, 90, 91, 92, 93, 94, 95, 96, 99];
  for (const code of VALID_DOC_TIPOS) {
    it(`accepts docTipo = ${code}`, () => {
      const r = schema.safeParse({ ...validBase, cbteTipo: 1, concepto: 1, docTipo: code });
      expect(r.success).toBe(true);
    });
  }

  const INVALID_DOC_TIPOS = [0, 1, 50, 81, 82, 88, 97, 98, 100];
  for (const code of INVALID_DOC_TIPOS) {
    it(`rejects docTipo = ${code}`, () => {
      const r = schema.safeParse({ ...validBase, cbteTipo: 1, concepto: 1, docTipo: code });
      expect(r.success).toBe(false);
    });
  }
});

describe("emitir_factura — concepto enum coverage", () => {
  for (const code of [1, 2, 3]) {
    it(`accepts concepto = ${code}`, () => {
      const r = schema.safeParse({ ...validBase, cbteTipo: 1, concepto: code, docTipo: 99 });
      expect(r.success).toBe(true);
    });
  }
  for (const code of [0, 4, 99]) {
    it(`rejects concepto = ${code}`, () => {
      const r = schema.safeParse({ ...validBase, cbteTipo: 1, concepto: code, docTipo: 99 });
      expect(r.success).toBe(false);
    });
  }
});

describe("emitir_factura — IVA alícuota id coverage", () => {
  const VALID_IVA_IDS = [3, 4, 5, 6, 8, 9];
  for (const id of VALID_IVA_IDS) {
    it(`accepts iva[].id = ${id}`, () => {
      const r = schema.safeParse({
        ...validBase,
        cbteTipo: 1,
        concepto: 1,
        docTipo: 99,
        iva: [{ id, baseImp: 100, importe: 21 }],
      });
      expect(r.success).toBe(true);
    });
  }
  for (const id of [1, 2, 7, 10, 11]) {
    it(`rejects iva[].id = ${id}`, () => {
      const r = schema.safeParse({
        ...validBase,
        cbteTipo: 1,
        concepto: 1,
        docTipo: 99,
        iva: [{ id, baseImp: 100, importe: 21 }],
      });
      expect(r.success).toBe(false);
    });
  }
});

describe("emitir_factura — importe constraints", () => {
  it("rejects negative impTotal (.nonnegative())", () => {
    const r = schema.safeParse({
      ...validBase,
      cbteTipo: 1,
      concepto: 1,
      docTipo: 99,
      impTotal: -100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects Infinity in impNeto (.finite())", () => {
    const r = schema.safeParse({
      ...validBase,
      cbteTipo: 1,
      concepto: 1,
      docTipo: 99,
      impNeto: Number.POSITIVE_INFINITY,
    });
    expect(r.success).toBe(false);
  });
});
