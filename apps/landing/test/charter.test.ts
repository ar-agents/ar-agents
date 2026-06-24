/**
 * Unit tests for the ALE charter layer of /api/auto-incorporate:
 * the beneficiarioPublico input + generateCharterMd (the Autonomous Legal
 * Entity charter). Kept separate from incorporate.test.ts so the ALE
 * surface is testable on its own.
 */

import { describe, expect, it } from "vitest";
import {
  Body,
  generateCharterMd,
  generateInstructionsMd,
  REQUIRED_PIEZAS,
  resolvePiezas,
} from "../src/lib/incorporate";

const baseInput = {
  denominacion: "ACME-AI SAS",
  tipo: "SOCIEDAD-IA" as const,
  capitalSocial: 1,
  objeto: "Desarrollo y comercialización de software propio para empresas argentinas.",
  piezas: [...REQUIRED_PIEZAS],
};

describe("beneficiarioPublico (Body schema)", () => {
  it("accepts a valid public beneficiary", () => {
    const r = Body.safeParse({
      ...baseInput,
      beneficiarioPublico: { entidad: "Fondo Soberano Argentino", porcentaje: 40 },
    });
    expect(r.success).toBe(true);
  });
  it("rejects porcentaje > 100", () => {
    const r = Body.safeParse({
      ...baseInput,
      beneficiarioPublico: { entidad: "FSA", porcentaje: 140 },
    });
    expect(r.success).toBe(false);
  });
  it("rejects porcentaje < 0", () => {
    const r = Body.safeParse({
      ...baseInput,
      beneficiarioPublico: { entidad: "FSA", porcentaje: -5 },
    });
    expect(r.success).toBe(false);
  });
  it("rejects empty entidad", () => {
    const r = Body.safeParse({
      ...baseInput,
      beneficiarioPublico: { entidad: "", porcentaje: 40 },
    });
    expect(r.success).toBe(false);
  });
  it("is optional (omitted is valid)", () => {
    const r = Body.safeParse(baseInput);
    expect(r.success).toBe(true);
  });
});

describe("generateCharterMd()", () => {
  const piezas = resolvePiezas([...REQUIRED_PIEZAS]);

  it("declares the ALE structure and that it is NOT AI personhood", () => {
    const md = generateCharterMd(Body.parse(baseInput), piezas);
    expect(md).toContain("ACME-AI SAS");
    expect(md).toContain("Sociedad Automatizada");
    expect(md).toContain("art. 14");
    expect(md).toContain("contenedor");
    expect(md.toLowerCase()).toContain("no personería");
  });

  it("declares the four ALE governance mechanisms", () => {
    const md = generateCharterMd(Body.parse(baseInput), piezas);
    expect(md).toContain("Consejo de Stewards");
    expect(md).toContain("roll-back");
    expect(md).toContain("kill-switch");
    expect(md).toContain("4 gatillos");
    expect(md).toContain("Capa 0"); // tiered arbitration
    expect(md.toLowerCase()).toContain("sanciones graduadas");
    expect(md.toLowerCase()).toContain("seguro");
    expect(md).toContain("Supervisory API");
    expect(md.toLowerCase()).toContain("reconocimiento mutuo");
  });

  it("includes the objeto and the enabled piezas in the bounded scope", () => {
    const md = generateCharterMd(Body.parse(baseInput), piezas);
    expect(md).toContain(baseInput.objeto);
    expect(md).toContain("identity");
  });

  it("declares the designated public beneficiary + liability relief when given", () => {
    const md = generateCharterMd(
      Body.parse({
        ...baseInput,
        beneficiarioPublico: { entidad: "Fondo Soberano Argentino", porcentaje: 40 },
      }),
      piezas,
    );
    expect(md).toContain("Fondo Soberano Argentino");
    expect(md).toContain("40%");
    expect(md.toLowerCase()).toContain("alivio");
  });

  it("notes the beneficiary is available when not designated", () => {
    const md = generateCharterMd(Body.parse(baseInput), piezas);
    expect(md.toLowerCase()).toContain("sin beneficiario");
    expect(md).toContain("FSA");
  });

  it("reflects the declared human administrator (steward attachment point)", () => {
    const md = generateCharterMd(
      Body.parse({
        ...baseInput,
        representante: { nombre: "Juan Pérez", cuit: "20-12345678-6" },
      }),
      piezas,
    );
    expect(md).toContain("Juan Pérez");
  });
});

describe("generateInstructionsMd() ALE wiring", () => {
  it("points the operating agent at the CHARTER.md governance", () => {
    const md = generateInstructionsMd(Body.parse(baseInput));
    expect(md).toContain("CHARTER.md");
    expect(md).toContain("stewards");
    // Existing RFC-001 governance still present (no regression).
    expect(md).toContain("requireConfirmation");
  });
});

describe("generateCharterMd() — fiscal/treasury clause", () => {
  it("declares the crypto->pesos bridge + honest AFIP posture when treasury/x402 are selected", () => {
    const md = generateCharterMd(Body.parse(baseInput), ["identity", "treasury", "x402"]);
    expect(md).toContain("## 11. Puente cripto-pesos y postura fiscal");
    expect(md).toContain("Intake (x402/Base)");
    expect(md).toContain("cedular 5%");
    expect(md).toContain("Pago a AFIP (honesto)");
    // No em dashes in the section we authored (hard copy rule).
    const fiscal = md.slice(md.indexOf("## 11."));
    expect(fiscal).not.toContain("—");
  });
  it("omits the fiscal clause when neither treasury nor x402 is selected", () => {
    const md = generateCharterMd(Body.parse(baseInput), ["identity", "banking"]);
    expect(md).not.toContain("Puente cripto-pesos");
  });
});
