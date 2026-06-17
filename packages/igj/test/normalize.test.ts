import { describe, expect, it } from "vitest";
import {
  normalizeCuit,
  normalizeEntityType,
  parseAsamblea,
  parseAutoridad,
  parseBalance,
  parseDomicilio,
  parseEntity,
} from "../src";

describe("normalizeCuit", () => {
  it.each([
    ["20-12345678-6", "20123456786"],
    ["20.12345678.6", "20123456786"],
    ["20 12345678 6", "20123456786"],
    ["20123456786", "20123456786"],
  ])("strips %s → %s", (input, expected) => {
    expect(normalizeCuit(input)).toBe(expected);
  });

  it("returns undefined for non-11-digit input", () => {
    expect(normalizeCuit("20-12345-9")).toBeUndefined();
    expect(normalizeCuit("")).toBeUndefined();
    expect(normalizeCuit(null)).toBeUndefined();
  });
});

describe("normalizeEntityType", () => {
  it.each([
    ["Sociedad Anónima", "sa"],
    ["S.A.", "sa"],
    ["sociedad de responsabilidad limitada", "srl"],
    ["S.R.L.", "srl"],
    ["SAS", "sas"],
    ["Asociación Civil", "asociacion_civil"],
    ["Fundación", "fundacion"],
    ["Cooperativa", "cooperativa"],
    ["Mutual", "mutual"],
    ["Sociedad Extranjera", "sociedad_extranjera"],
    ["xxx", "otro"],
    ["", "otro"],
  ])("maps %s → %s", (input, expected) => {
    expect(normalizeEntityType(input)).toBe(expected);
  });

  it("handles null/undefined", () => {
    expect(normalizeEntityType(null)).toBe("otro");
    expect(normalizeEntityType(undefined)).toBe("otro");
  });
});

describe("parseEntity", () => {
  it("extracts core fields from a CKAN-shaped row", () => {
    const e = parseEntity({
      _id: 42,
      denominacion: "ACME S.A.",
      cuit: "30-70750012-9",
      tipoEntidad: "Sociedad Anónima",
      fechaInscripcion: "2020-06-12",
      matricula: "12345",
    });
    expect(e.id).toBe("42");
    expect(e.nombre).toBe("ACME S.A.");
    expect(e.cuit).toBe("30707500129");
    expect(e.tipoEntidad).toBe("sa");
    expect(e.fechaInscripcion).toBe("2020-06-12");
    expect(e.matricula).toBe("12345");
  });

  it("falls back through alternate column names", () => {
    const e = parseEntity({
      correlativo: "X-1",
      razon_social: "Foo Coop",
      tipo_entidad: "Cooperativa",
    });
    expect(e.id).toBe("X-1");
    expect(e.nombre).toBe("Foo Coop");
    expect(e.tipoEntidad).toBe("cooperativa");
  });

  it("returns 'otro' for unknown types and skips missing CUIT", () => {
    const e = parseEntity({ _id: 1, denominacion: "Foo", tipoEntidad: "Aliens" });
    expect(e.tipoEntidad).toBe("otro");
    expect(e.cuit).toBeUndefined();
  });
});

describe("parseDomicilio / parseAutoridad / parseBalance / parseAsamblea", () => {
  it("parses a domicilio row", () => {
    const d = parseDomicilio({
      correlativo: "1",
      tipo: "legal",
      calle: "San Martín",
      numero: "100",
      provincia: "CABA",
      codigo_postal: "1000",
    });
    expect(d.entityId).toBe("1");
    expect(d.tipo).toBe("legal");
    expect(d.calle).toBe("San Martín");
    expect(d.codigoPostal).toBe("1000");
  });

  it("parses an autoridad row with gender", () => {
    const a = parseAutoridad({
      correlativo: "1",
      nombre: "Juan Pérez",
      cargo: "Presidente",
      genero: "M",
    });
    expect(a.nombre).toBe("Juan Pérez");
    expect(a.cargo).toBe("Presidente");
    expect(a.genero).toBe("M");
  });

  it("parses a balance row", () => {
    const b = parseBalance({
      correlativo: "1",
      cierreEjercicio: "2025-12-31",
      numeroEjercicio: 5,
      fechaPresentacion: "2026-04-15",
    });
    expect(b.entityId).toBe("1");
    expect(b.cierreEjercicio).toBe("2025-12-31");
    expect(b.numeroEjercicio).toBe(5);
  });

  it("parses an asamblea row", () => {
    const a = parseAsamblea({
      correlativo: "1",
      tipo: "ordinaria",
      fecha: "2026-04-30",
    });
    expect(a.entityId).toBe("1");
    expect(a.tipo).toBe("ordinaria");
    expect(a.fecha).toBe("2026-04-30");
  });
});
