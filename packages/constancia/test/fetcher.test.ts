import { describe, expect, it } from "vitest";
import {
  BrowseSkillConstanciaFetcher,
  ConstanciaError,
  type Constancia,
  MockConstanciaFetcher,
  normalizeCuit,
  parseSkillOutput,
  UnconfiguredConstanciaFetcher,
} from "../src";

const sampleData: Constancia = {
  cuit: "20417581015",
  denominacion: "CLEMENTE NAZARENO",
  tipoPersona: "fisica",
  condicion: "monotributo",
  monotributoCategoria: "A",
  domicilioFiscal: {
    direccion: "Cabo Corrientes 468",
    localidad: "Monte Grande",
    provincia: "Buenos Aires",
    codigoPostal: "1842",
  },
  actividades: [
    { codigo: "620100", descripcion: "Servicios informáticos", principal: true },
  ],
  impuestos: [{ descripcion: "MONOTRIBUTO", desde: "2026-04-17" }],
  fechaInscripcion: "2026-04-17",
  estado: "ACTIVO",
};

describe("normalizeCuit", () => {
  it("strips formatting to 11 bare digits", () => {
    expect(normalizeCuit("20-41758101-5")).toBe("20417581015");
    expect(normalizeCuit("20417581015")).toBe("20417581015");
    expect(normalizeCuit("  20.41758101.5 ")).toBe("20417581015");
  });

  it("returns null when not 11 digits", () => {
    expect(normalizeCuit("123")).toBeNull();
    expect(normalizeCuit("abcdefghijk")).toBeNull();
    expect(normalizeCuit("204175810155")).toBeNull();
  });
});

describe("UnconfiguredConstanciaFetcher", () => {
  it("is safe to call and reports not-configured", async () => {
    const f = new UnconfiguredConstanciaFetcher();
    const r = await f.getConstancia("20-41758101-5");
    expect(r.available).toBe(false);
    expect(r.source).toBe("unconfigured");
    expect(r.data).toBeNull();
    expect(r.pdf).toBeNull();
    expect(r.error).toMatch(/not configured/i);
    expect(r.cuit).toBe("20417581015");
  });
});

describe("MockConstanciaFetcher", () => {
  it("returns the fixture for a known CUIT (key normalized)", async () => {
    const f = new MockConstanciaFetcher(
      { "20-41758101-5": sampleData },
      { "20417581015": { base64: "JVBER", codigoVerificador: "ABC123" } },
    );
    const r = await f.getConstancia("20417581015");
    expect(r.available).toBe(true);
    expect(r.error).toBeNull();
    expect(r.data?.denominacion).toBe("CLEMENTE NAZARENO");
    expect(r.data?.monotributoCategoria).toBe("A");
    expect(r.pdf?.codigoVerificador).toBe("ABC123");
    expect(r.source).toBe("mock");
  });

  it("returns cuit_not_found for an unknown CUIT", async () => {
    const f = new MockConstanciaFetcher({ "20417581015": sampleData });
    const r = await f.getConstancia("30-70750012-9");
    expect(r.available).toBe(false);
    expect(r.error).toMatch(/cuit_not_found/);
    expect(r.data).toBeNull();
  });

  it("returns invalid_cuit for a malformed CUIT", async () => {
    const f = new MockConstanciaFetcher({});
    const r = await f.getConstancia("nope");
    expect(r.available).toBe(false);
    expect(r.error).toMatch(/invalid_cuit/);
  });

  it("found fixture without a PDF yields pdf:null", async () => {
    const f = new MockConstanciaFetcher({ "20417581015": sampleData });
    const r = await f.getConstancia("20417581015");
    expect(r.available).toBe(true);
    expect(r.pdf).toBeNull();
  });
});

describe("parseSkillOutput", () => {
  it("normalizes a full payload (object)", () => {
    const r = parseSkillOutput("20417581015", {
      found: true,
      denominacion: "  ACME S.A.  ",
      tipoPersona: "juridica",
      condicion: "Responsable Inscripto",
      domicilioFiscal: {
        direccion: "Av Siempreviva 742",
        provincia: "CABA",
        codigoPostal: "",
      },
      actividades: [
        { codigo: "620100", descripcion: "Software", principal: true },
        { descripcion: "" },
        "garbage",
      ],
      impuestos: ["IVA", { descripcion: "GANANCIAS", desde: "01/03/2026" }],
      fechaInscripcion: "15/01/2020",
      estado: "ACTIVO",
      pdf: { base64: "JVBERi0x", codigoVerificador: "XYZ" },
    });
    expect(r.available).toBe(true);
    expect(r.data?.denominacion).toBe("ACME S.A.");
    expect(r.data?.tipoPersona).toBe("juridica");
    expect(r.data?.condicion).toBe("responsable_inscripto");
    expect(r.data?.domicilioFiscal).toEqual({
      direccion: "Av Siempreviva 742",
      provincia: "CABA",
    });
    expect(r.data?.actividades).toEqual([
      { codigo: "620100", descripcion: "Software", principal: true },
    ]);
    expect(r.data?.impuestos).toEqual([
      { descripcion: "IVA" },
      { descripcion: "GANANCIAS", desde: "2026-03-01" },
    ]);
    expect(r.data?.fechaInscripcion).toBe("2020-01-15");
    expect(r.pdf?.base64).toBe("JVBERi0x");
    expect(r.source).toBe("browse-skill");
  });

  it("parses a JSON string and infers monotributo + category", () => {
    const r = parseSkillOutput(
      "20417581015",
      JSON.stringify({
        denominacion: "CLEMENTE NAZARENO",
        condicion: "Monotributo",
        monotributoCategoria: "a",
      }),
    );
    expect(r.data?.condicion).toBe("monotributo");
    expect(r.data?.monotributoCategoria).toBe("A");
  });

  it.each([
    ["exento", "exento"],
    ["No Alcanzado", "no_alcanzado"],
    ["sin inscripción", "no_inscripto"],
    ["algo raro", "desconocida"],
  ])("maps condición %s → %s", (input, expected) => {
    const r = parseSkillOutput("20417581015", {
      denominacion: "X",
      condicion: input,
    });
    expect(r.data?.condicion).toBe(expected);
  });

  it("throws cuit_not_found when found:false", () => {
    expect(() => parseSkillOutput("20417581015", { found: false })).toThrow(
      ConstanciaError,
    );
    try {
      parseSkillOutput("20417581015", { found: false });
    } catch (e) {
      expect((e as ConstanciaError).code).toBe("cuit_not_found");
    }
  });

  it("throws cuit_not_found when the skill reports 'no figura'", () => {
    try {
      parseSkillOutput("20417581015", { error: "el CUIT no figura inscripto" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ConstanciaError).code).toBe("cuit_not_found");
    }
  });

  it("throws fetcher_unexpected_response on a generic skill error", () => {
    try {
      parseSkillOutput("20417581015", { error: "timeout navigating" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ConstanciaError).code).toBe("fetcher_unexpected_response");
    }
  });

  it("throws fetcher_unexpected_response when denominacion is missing", () => {
    try {
      parseSkillOutput("20417581015", { condicion: "monotributo" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ConstanciaError).code).toBe("fetcher_unexpected_response");
    }
  });

  it("throws on invalid JSON string and on empty input", () => {
    expect(() => parseSkillOutput("20417581015", "{not json")).toThrow(
      /not valid JSON/,
    );
    expect(() =>
      parseSkillOutput("20417581015", null as unknown as string),
    ).toThrow(/empty or not an object/);
  });
});

describe("BrowseSkillConstanciaFetcher", () => {
  it("rejects a malformed CUIT before running the skill", async () => {
    let called = false;
    const f = new BrowseSkillConstanciaFetcher({
      runSkill: async () => {
        called = true;
        return {};
      },
    });
    const r = await f.getConstancia("nope");
    expect(called).toBe(false);
    expect(r.available).toBe(false);
    expect(r.error).toMatch(/invalid_cuit/);
    expect(r.source).toBe("browse-skill");
  });

  it("returns a parsed result when the skill succeeds", async () => {
    const f = new BrowseSkillConstanciaFetcher({
      runSkill: async (cuit) => ({
        cuit,
        denominacion: "CLEMENTE NAZARENO",
        condicion: "monotributo",
        monotributoCategoria: "A",
        pdf: { url: "https://x/y.pdf" },
      }),
    });
    const r = await f.getConstancia("20-41758101-5");
    expect(r.available).toBe(true);
    expect(r.data?.condicion).toBe("monotributo");
    expect(r.pdf?.url).toBe("https://x/y.pdf");
  });

  it("maps a thrown runSkill to fetcher_unreachable", async () => {
    const f = new BrowseSkillConstanciaFetcher({
      runSkill: async () => {
        throw new Error("browserbase 503");
      },
    });
    const r = await f.getConstancia("20417581015");
    expect(r.available).toBe(false);
    expect(r.error).toMatch(/fetcher_unreachable/);
    expect(r.error).toMatch(/browserbase 503/);
  });

  it("maps a not-found skill payload to cuit_not_found", async () => {
    const f = new BrowseSkillConstanciaFetcher({
      runSkill: async () => ({ found: false }),
    });
    const r = await f.getConstancia("20417581015");
    expect(r.available).toBe(false);
    expect(r.error).toMatch(/cuit_not_found/);
  });

  it("maps a structurally-broken payload to fetcher_unexpected_response", async () => {
    const f = new BrowseSkillConstanciaFetcher({
      runSkill: async () => ({ condicion: "monotributo" }), // no denominacion
    });
    const r = await f.getConstancia("20417581015");
    expect(r.available).toBe(false);
    expect(r.error).toMatch(/fetcher_unexpected_response/);
  });
});
