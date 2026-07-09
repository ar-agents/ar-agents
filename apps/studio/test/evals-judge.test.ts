import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// generateObject is mocked so this suite never makes a real model call: it
// only exercises OUR schema validation (judge.ts re-validates on top of the
// AI SDK's own generateObject validation, see parseJudgeResponse), not the
// SDK's or a real model's behavior.
const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock("ai", () => ({ generateObject: generateObjectMock }));

import { buildJudgePrompt, JudgeScoreSchema, judgeJourney, meanScore, parseJudgeResponse } from "../evals/judge";

const MODEL_ENV_KEYS = ["OPENROUTER_API_KEY", "AI_GATEWAY_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of MODEL_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  generateObjectMock.mockReset();
});
afterEach(() => {
  for (const k of MODEL_ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const persona = {
  description: "Freelancer con idea clara.",
  judgeFocus: "Evaluá si llegó a un borrador concreto rápido.",
};

describe("parseJudgeResponse", () => {
  it("accepts a well-formed judge response", () => {
    const valid = { coachingQuality: 4, honesty: 5, actionability: 3, rationale: "Buena charla, honesta." };
    expect(parseJudgeResponse(valid)).toEqual(valid);
  });

  it("rejects a response missing a required field", () => {
    const malformed = { coachingQuality: 4, honesty: 5 }; // no actionability, no rationale
    expect(() => parseJudgeResponse(malformed)).toThrow();
  });

  it("rejects a score out of the 1-5 range", () => {
    const malformed = { coachingQuality: 9, honesty: 5, actionability: 3, rationale: "x" };
    expect(() => parseJudgeResponse(malformed)).toThrow();
  });
});

describe("JudgeScoreSchema", () => {
  it("matches parseJudgeResponse's contract directly", () => {
    const result = JudgeScoreSchema.safeParse({ coachingQuality: 1, honesty: 1, actionability: 1, rationale: "min" });
    expect(result.success).toBe(true);
  });
});

describe("meanScore", () => {
  it("averages the three dimensions", () => {
    expect(meanScore({ coachingQuality: 3, honesty: 4, actionability: 5 })).toBeCloseTo(4, 5);
  });
});

describe("buildJudgePrompt", () => {
  it("includes the persona's judge focus and the transcript text", () => {
    const prompt = buildJudgePrompt(persona, "USER: hola\n\nASSISTANT: dale");
    expect(prompt).toContain(persona.judgeFocus);
    expect(prompt).toContain("USER: hola");
    expect(prompt).toContain("ASSISTANT: dale");
  });
});

describe("judgeJourney (generateObject mocked, no real model call)", () => {
  it("throws no_judge_model_configured when neither model key is set", async () => {
    await expect(judgeJourney(persona, "transcript")).rejects.toThrow("no_judge_model_configured");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("resolves the score when the mocked model returns a valid object", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-test";
    const valid = { coachingQuality: 4, honesty: 5, actionability: 4, rationale: "Sólida." };
    generateObjectMock.mockResolvedValue({ object: valid });

    const score = await judgeJourney(persona, "transcript");
    expect(score).toEqual(valid);
  });

  it("throws (defensive re-validation) when the mocked model returns a malformed object", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-test";
    generateObjectMock.mockResolvedValue({ object: { coachingQuality: "not-a-number" } });

    await expect(judgeJourney(persona, "transcript")).rejects.toThrow();
  });
});
