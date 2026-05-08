import { describe, expect, it } from "vitest";
import {
  buildNormaUrl,
  classifyTipo,
  describeSeccion,
  extractCuits,
  SECCIONES,
} from "../src";

describe("SECCIONES", () => {
  it("contains all four secciones", () => {
    expect(SECCIONES).toEqual(["primera", "segunda", "tercera", "cuarta"]);
  });
});

describe("describeSeccion", () => {
  it.each([
    ["primera", "Sección Primera — Legislación y Avisos Oficiales"],
    ["segunda", "Sección Segunda — Sociedades"],
    ["tercera", "Sección Tercera — Contrataciones del Estado"],
    ["cuarta", "Sección Cuarta — Avisos Judiciales"],
  ] as const)("describes %s correctly", (s, expected) => {
    expect(describeSeccion(s)).toBe(expected);
  });
});

describe("classifyTipo", () => {
  it.each([
    ["LEY 27.123", "primera", "ley"],
    ["LEY Nº 27.123", "primera", "ley"],
    ["DECRETO 412/2026", "primera", "decreto"],
    ["DNU 70/2026", "primera", "decreto"],
    ["RESOLUCIÓN GENERAL Nº 5612/2026", "primera", "resolucion"],
    ["DISPOSICIÓN 23/2026", "primera", "disposicion"],
    ["DECISIÓN ADMINISTRATIVA 144/2026", "primera", "decision_administrativa"],
    ["COMUNICACIÓN A 7842 BCRA", "primera", "comunicacion"],
    ["AVISO COMERCIAL — SOCIEDAD ANÓNIMA", "segunda", "sociedad"],
    ["LICITACIÓN PÚBLICA Nº 12/2026", "tercera", "contratacion"],
    ["EDICTO JUDICIAL", "cuarta", "edicto"],
    ["RANDOM TEXT", "primera", "otro"],
  ] as const)("classifies %s in %s as %s", (titulo, seccion, expected) => {
    expect(classifyTipo(titulo, seccion)).toBe(expected);
  });
});

describe("extractCuits", () => {
  it("finds CUITs in mixed text", () => {
    const text = "El responsable es 20-41758101-5, junto a 30.70750012.9 y 27123456780.";
    const cuits = extractCuits(text);
    expect(cuits).toContain("20417581015");
    expect(cuits).toContain("30707500129");
    expect(cuits).toContain("27123456780");
  });

  it("returns empty array when no CUITs are present", () => {
    expect(extractCuits("hola mundo, no hay CUITs aquí")).toEqual([]);
  });

  it("dedupes repeated CUITs", () => {
    const text = "20-41758101-5 menciona 20-41758101-5 nuevamente";
    expect(extractCuits(text)).toEqual(["20417581015"]);
  });

  it("ignores 11-digit numbers that don't look like CUITs (wrong prefix)", () => {
    expect(extractCuits("99999999999")).toEqual([]);
  });
});

describe("buildNormaUrl", () => {
  it("builds canonical URLs", () => {
    expect(buildNormaUrl("primera", "999", "2026-04-28")).toBe(
      "https://www.boletinoficial.gob.ar/detalleAviso/primera/999/20260428",
    );
  });
});
