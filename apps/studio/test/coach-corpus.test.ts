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
