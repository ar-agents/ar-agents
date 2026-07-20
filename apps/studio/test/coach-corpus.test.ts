import { describe, expect, it } from "vitest";
import {
  ARGENTINA_MD,
  AUTOMATED_BUSINESS_MD,
  CORPUS_DIGEST,
  LEAN_STARTUP_MD,
  PAUL_GRAHAM_MD,
} from "../src/coach/corpus";
import { buildSystemPrompt } from "../src/coach/system-prompt";

const CORPUS_FILE_EXPORTS = {
  LEAN_STARTUP_MD,
  PAUL_GRAHAM_MD,
  AUTOMATED_BUSINESS_MD,
  ARGENTINA_MD,
} as const;

describe("coach corpus exports", () => {
  for (const [name, value] of Object.entries(CORPUS_FILE_EXPORTS)) {
    it(`${name} is a non-empty string`, () => {
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    });

    it(`${name} starts with a "Fuente/uso" header`, () => {
      expect(value).toMatch(/Fuente\/uso/);
    });
  }

  it("CORPUS_DIGEST is a non-empty string, kept compact (under 1000 words)", () => {
    expect(CORPUS_DIGEST.trim().length).toBeGreaterThan(0);
    const digestWords = CORPUS_DIGEST.trim().split(/\s+/).length;
    expect(digestWords).toBeLessThan(1000);
  });
});

describe("buildSystemPrompt: length ceiling", () => {
  it("composed prompt (any stage, any tool availability) stays under ~6000 words", () => {
    const stages = [undefined, "idea", "validacion", "spec", "constitucion", "operacion"] as const;
    for (const stage of stages) {
      for (const webSearchAvailable of [true, false]) {
        const prompt = buildSystemPrompt(stage, { webSearchAvailable });
        const words = prompt.trim().split(/\s+/).length;
        expect(words).toBeLessThan(6000);
      }
    }
  });

  it("includes the corpus digest content", () => {
    const prompt = buildSystemPrompt("idea", { webSearchAvailable: true });
    expect(prompt).toContain("Lean startup");
    expect(prompt).toContain("Paul Graham");
  });

  it("includes the current stage label when given", () => {
    const prompt = buildSystemPrompt("validacion", { webSearchAvailable: true });
    expect(prompt).toMatch(/validación/);
  });

  it("omits the stage line when no stage is given", () => {
    const withStage = buildSystemPrompt("idea", { webSearchAvailable: true });
    const withoutStage = buildSystemPrompt(undefined, { webSearchAvailable: true });
    expect(withStage).toMatch(/Etapa actual/);
    expect(withoutStage).not.toMatch(/Etapa actual/);
  });

  it("notes live search is unavailable when webSearchAvailable is false", () => {
    const prompt = buildSystemPrompt("idea", { webSearchAvailable: false });
    expect(prompt).toMatch(/no tenés acceso a búsqueda web/i);
  });

  it("mentions research_web when webSearchAvailable is true", () => {
    const prompt = buildSystemPrompt("idea", { webSearchAvailable: true });
    expect(prompt).toMatch(/research_web/);
  });

  it("never claims the model can constitute a society (unchanged behavior)", () => {
    const prompt = buildSystemPrompt("constitucion", { webSearchAvailable: true });
    expect(prompt).toMatch(/nunca constituís/i);
  });
});

describe("buildSystemPrompt: selected-language instruction (M1-3d)", () => {
  it("defaults to the Spanish (es) instruction when no locale is given", () => {
    const prompt = buildSystemPrompt("idea", { webSearchAvailable: true });
    expect(prompt).toMatch(/Idioma seleccionado en la interfaz: español \(es\)/);
    expect(prompt).toMatch(/Selected UI language: Spanish \(es\)/);
    expect(prompt).not.toMatch(/Idioma seleccionado en la interfaz: inglés/);
  });

  it("uses the Spanish instruction, with voseo called out, when locale is 'es'", () => {
    const prompt = buildSystemPrompt("idea", { webSearchAvailable: true, locale: "es" });
    expect(prompt).toMatch(/Idioma seleccionado en la interfaz: español \(es\)/);
    expect(prompt).toMatch(/con vos/);
  });

  it("uses the English instruction, keeping legal terms and proper nouns as-is, when locale is 'en'", () => {
    const prompt = buildSystemPrompt("idea", { webSearchAvailable: true, locale: "en" });
    expect(prompt).toMatch(/Idioma seleccionado en la interfaz: inglés \(en\)/);
    expect(prompt).toMatch(/Selected UI language: English \(en\)/);
    // Proper nouns / legal terms called out to stay untranslated.
    expect(prompt).toMatch(/sociedad, art\. 102, IGJ, AFIP/);
    expect(prompt).not.toMatch(/Idioma seleccionado en la interfaz: español/);
  });

  it("still includes the corpus digest and its sources for both locales", () => {
    const es = buildSystemPrompt("idea", { webSearchAvailable: true, locale: "es" });
    const en = buildSystemPrompt("idea", { webSearchAvailable: true, locale: "en" });
    for (const prompt of [es, en]) {
      expect(prompt).toContain("Lean startup");
      expect(prompt).toContain("Paul Graham");
    }
  });

  it("still keeps the pricing-mechanics refusal rule intact for both locales", () => {
    const es = buildSystemPrompt("idea", { webSearchAvailable: true, locale: "es" });
    const en = buildSystemPrompt("idea", { webSearchAvailable: true, locale: "en" });
    for (const prompt of [es, en]) {
      expect(prompt).toMatch(/NO son algo que vos sepas/);
      expect(prompt).toMatch(/ar-agents\.ar\/precios/);
    }
  });
});
