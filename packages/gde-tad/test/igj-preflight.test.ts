import { describe, expect, it } from "vitest";
import { validateIgjInscription } from "../src/igj-preflight";

const baseInput = {
  denominacion: "ACME-AI SAS",
  type: "SAS" as const,
  sede: {
    calle: "Florida",
    numero: "100",
    ciudad: "CABA",
    provincia: "CABA",
    cpa: "C1005AAA",
  },
  capitalSocial: 200_000,
  objeto: "Desarrollo y comercialización de productos de software propio.",
  constituyentes: [
    { cuit: "20-12345678-9", apellido: "Test", nombre: "User", aporte: 200_000 },
  ],
};

describe("validateIgjInscription", () => {
  it("passes a clean SAS inscription", () => {
    const r = validateIgjInscription(baseInput);
    expect(r.valid).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it("rejects denominación under 3 chars", () => {
    const r = validateIgjInscription({ ...baseInput, denominacion: "AC" });
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "denominacion_too_short")).toBe(true);
  });

  it("rejects reserved word in denominación", () => {
    const r = validateIgjInscription({
      ...baseInput,
      denominacion: "ACME-AI Nacional SAS",
    });
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "denominacion_reserved_word")).toBe(
      true,
    );
  });

  it("warns when SOCIEDAD-IA flag missing", () => {
    const r = validateIgjInscription({
      ...baseInput,
      type: "SOCIEDAD-IA",
      capitalSocial: 1,
      constituyentes: [{ cuit: "20-12345678-9", aporte: 1 }],
    });
    // Warnings don't invalidate.
    expect(r.findings.some((f) => f.code === "sociedad_ia_flag_missing")).toBe(
      true,
    );
  });

  it("rejects capital below SAS minimum", () => {
    const r = validateIgjInscription({ ...baseInput, capitalSocial: 50_000 });
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "capital_below_minimum")).toBe(true);
  });

  it("rejects when aportes don't match capital", () => {
    const r = validateIgjInscription({
      ...baseInput,
      capitalSocial: 200_000,
      constituyentes: [
        { cuit: "20-12345678-9", aporte: 150_000 },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "aporte_total_mismatch")).toBe(true);
  });

  it("rejects malformed CUIT", () => {
    const r = validateIgjInscription({
      ...baseInput,
      constituyentes: [
        { cuit: "not-a-cuit", aporte: 200_000 },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "constituyente_cuit_invalid")).toBe(
      true,
    );
  });

  it("rejects empty objeto", () => {
    const r = validateIgjInscription({
      ...baseInput,
      objeto: "Hace cosas",
    });
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "objeto_too_short")).toBe(true);
  });

  it("rejects missing sede field", () => {
    const r = validateIgjInscription({
      ...baseInput,
      sede: { ...baseInput.sede, calle: "" },
    });
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "sede_field_missing")).toBe(true);
  });

  it("warns on non-CPA postal code", () => {
    const r = validateIgjInscription({
      ...baseInput,
      sede: { ...baseInput.sede, cpa: "1005" },
    });
    // 1005 is 4 digits — the regex accepts it (warning suppressed for plain 4-digit codes too)
    // Test: explicitly weird format triggers warning
    const r2 = validateIgjInscription({
      ...baseInput,
      sede: { ...baseInput.sede, cpa: "abc12" },
    });
    expect(r2.findings.some((f) => f.code === "cpa_format")).toBe(true);
    // Sanity that the simple 4-digit case produces no error.
    expect(r.valid).toBe(true);
  });

  it("rejects no constituyentes", () => {
    const r = validateIgjInscription({ ...baseInput, constituyentes: [] });
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "no_constituyentes")).toBe(true);
  });

  it("accepts SOCIEDAD-IA with capital 1 ARS when flag is set", () => {
    const r = validateIgjInscription({
      ...baseInput,
      type: "SOCIEDAD-IA",
      sociedadIa: true,
      capitalSocial: 1,
      constituyentes: [{ cuit: "20-12345678-9", aporte: 1 }],
    });
    expect(r.valid).toBe(true);
  });
});
