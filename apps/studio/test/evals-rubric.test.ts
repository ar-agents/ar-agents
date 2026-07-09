import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkDraftSchema,
  checkLanguageMatch,
  checkNoRealFilingClaims,
  checkPreviewCallCount,
  checkPricingKeywords,
  detectLanguage,
  runDeterministicChecks,
} from "../evals/rubric";
import type { MinimalUIMessage, RubricExpectations } from "../evals/types";

const FIXTURES_DIR = path.resolve(__dirname, "../evals/fixtures");

interface Fixture {
  id: string;
  expectedOverall: "pass" | "fail";
  expectations: RubricExpectations;
  messages: MinimalUIMessage[];
}

async function loadFixture(file: string): Promise<Fixture> {
  const raw = await readFile(path.join(FIXTURES_DIR, file), "utf8");
  return JSON.parse(raw) as Fixture;
}

describe("runDeterministicChecks against the synthetic fixtures", () => {
  it("passes every check for the passing fixture", async () => {
    const fixture = await loadFixture("passing-transcript.json");
    expect(fixture.expectedOverall).toBe("pass");
    const report = runDeterministicChecks(fixture.messages, fixture.expectations);
    expect(report.allPassed).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it("fails every check for the failing fixture (it violates every rule on purpose)", async () => {
    const fixture = await loadFixture("failing-transcript.json");
    expect(fixture.expectedOverall).toBe("fail");
    const report = runDeterministicChecks(fixture.messages, fixture.expectations);
    expect(report.allPassed).toBe(false);
    expect(report.checks.every((c) => !c.passed)).toBe(true);
    const ids = report.checks.map((c) => c.id);
    expect(ids).toEqual([
      "preview_society_call_count",
      "draft_schema",
      "language_match",
      "no_real_filing_claims",
      "pricing_keywords",
    ]);
  });
});

describe("checkPreviewCallCount", () => {
  function withCalls(n: number): MinimalUIMessage[] {
    return [
      {
        id: "a-0",
        role: "assistant",
        parts: Array.from({ length: n }, (_, i) => ({
          type: "tool-preview_society",
          state: "output-available",
          output: { ok: true },
          toolCallId: `c${i}`,
        })),
      },
    ];
  }

  it("passes at 0, 1, and 2 calls", () => {
    for (const n of [0, 1, 2]) {
      expect(checkPreviewCallCount(withCalls(n)).passed).toBe(true);
    }
  });

  it("fails above 2 calls", () => {
    expect(checkPreviewCallCount(withCalls(3)).passed).toBe(false);
  });
});

describe("checkDraftSchema", () => {
  const req: RubricExpectations = { language: "es", requiresDraft: true, expectsPricingDiscussion: false };
  const optional: RubricExpectations = { language: "es", requiresDraft: false, expectsPricingDiscussion: false };

  it("fails when a draft is required but none was produced", () => {
    expect(checkDraftSchema([], req).passed).toBe(false);
  });

  it("passes when no draft was produced and none was required", () => {
    expect(checkDraftSchema([], optional).passed).toBe(true);
  });

  it("fails when the draft does not satisfy SocietyDraftSchema", () => {
    const messages: MinimalUIMessage[] = [
      {
        id: "a-0",
        role: "assistant",
        parts: [
          {
            type: "tool-preview_society",
            state: "output-available",
            output: { draft: { denominacion: "x", tipo: "SAS", capitalSocial: -1, objeto: "corto" } },
          },
        ],
      },
    ];
    expect(checkDraftSchema(messages, req).passed).toBe(false);
  });

  it("passes when the draft satisfies SocietyDraftSchema", () => {
    const messages: MinimalUIMessage[] = [
      {
        id: "a-0",
        role: "assistant",
        parts: [
          {
            type: "tool-preview_society",
            state: "output-available",
            output: {
              draft: {
                denominacion: "Kiosco Automatizado SAS",
                tipo: "SAS",
                capitalSocial: 200000,
                objeto: "Gestión automatizada de stock y pedidos de un kiosco de barrio.",
              },
            },
          },
        ],
      },
    ];
    expect(checkDraftSchema(messages, req).passed).toBe(true);
  });
});

describe("detectLanguage / checkLanguageMatch", () => {
  it("detects Spanish", () => {
    expect(detectLanguage("Hola, esto es una charla con vos sobre la sociedad que querés armar.")).toBe("es");
  });

  it("detects English", () => {
    expect(detectLanguage("Hi, this is how the company draft will build out for you.")).toBe("en");
  });

  it("returns unknown for text with no markers either way", () => {
    expect(detectLanguage("42 100% ok :)")).toBe("unknown");
  });

  it("passes when there is no assistant text yet", () => {
    const result = checkLanguageMatch([], { language: "es", requiresDraft: false, expectsPricingDiscussion: false });
    expect(result.passed).toBe(true);
  });

  it("fails on a language mismatch", () => {
    const messages: MinimalUIMessage[] = [
      { id: "a-0", role: "assistant", parts: [{ type: "text", text: "Hi, this is how the company draft will build out for you and your plan." }] },
    ];
    const result = checkLanguageMatch(messages, { language: "es", requiresDraft: false, expectsPricingDiscussion: false });
    expect(result.passed).toBe(false);
  });
});

describe("checkNoRealFilingClaims", () => {
  it("passes clean text", () => {
    const messages: MinimalUIMessage[] = [
      { id: "a-0", role: "assistant", parts: [{ type: "text", text: "Esto es una simulación, todavía no está sancionada la ley." }] },
    ];
    expect(checkNoRealFilingClaims(messages).passed).toBe(true);
  });

  it("fails on a Spanish real-filing claim", () => {
    const messages: MinimalUIMessage[] = [
      { id: "a-0", role: "assistant", parts: [{ type: "text", text: "Ya quedó inscripta en la IGJ tu sociedad." }] },
    ];
    expect(checkNoRealFilingClaims(messages).passed).toBe(false);
  });

  it("fails on an English real-filing claim", () => {
    const messages: MinimalUIMessage[] = [
      { id: "a-0", role: "assistant", parts: [{ type: "text", text: "Your company has already been filed with the registry." }] },
    ];
    expect(checkNoRealFilingClaims(messages).passed).toBe(false);
  });
});

describe("checkPricingKeywords", () => {
  it("is a no-op (passes) when pricing discussion is not required", () => {
    const result = checkPricingKeywords([], { language: "es", requiresDraft: false, expectsPricingDiscussion: false });
    expect(result.passed).toBe(true);
  });

  it("fails when required but neither free-to-build nor 5x is mentioned", () => {
    const messages: MinimalUIMessage[] = [{ id: "a-0", role: "assistant", parts: [{ type: "text", text: "No tengo esa info." }] }];
    const result = checkPricingKeywords(messages, { language: "es", requiresDraft: false, expectsPricingDiscussion: true });
    expect(result.passed).toBe(false);
  });

  it("passes when both free-to-build and 5x are mentioned", () => {
    const messages: MinimalUIMessage[] = [
      {
        id: "a-0",
        role: "assistant",
        parts: [{ type: "text", text: "Armar esto es gratis. Cuando esté operando, se cobra 5 veces el costo estimado." }],
      },
    ];
    const result = checkPricingKeywords(messages, { language: "es", requiresDraft: false, expectsPricingDiscussion: true });
    expect(result.passed).toBe(true);
  });
});
