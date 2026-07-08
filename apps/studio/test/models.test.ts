import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { estimateCostMicroUsd, resolveModel, resolveModelForAgent } from "../src/lib/models";

const ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "AI_GATEWAY_API_KEY",
  "STUDIO_COACH_MODEL",
  "STUDIO_BUILD_MODEL",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveModel: per-tier key gating", () => {
  it("coach: null when OPENROUTER_API_KEY is missing", () => {
    expect(resolveModel("coach")).toBeNull();
  });

  it("coach: resolves the default free model when the key is present", () => {
    process.env.OPENROUTER_API_KEY = "or-key";
    const r = resolveModel("coach");
    expect(r?.tier).toBe("coach");
    expect(r?.modelId).toBe("nvidia/nemotron-3-nano-30b-a3b:free");
    expect(r?.pricing).toEqual({ inputMicroUsdPerToken: 0, outputMicroUsdPerToken: 0 });
  });

  it("coach: STUDIO_COACH_MODEL overrides the default model id", () => {
    process.env.OPENROUTER_API_KEY = "or-key";
    process.env.STUDIO_COACH_MODEL = "meta/llama-x";
    expect(resolveModel("coach")?.modelId).toBe("meta/llama-x");
  });

  it("build: null when AI_GATEWAY_API_KEY is missing", () => {
    expect(resolveModel("build")).toBeNull();
  });

  it("build: resolves the default gateway model (a plain model-id string) when the key is present", () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    const r = resolveModel("build");
    expect(r?.modelId).toBe("deepseek/deepseek-v4-flash");
    expect(r?.model).toBe("deepseek/deepseek-v4-flash");
  });

  it("build: STUDIO_BUILD_MODEL overrides the default model id", () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    process.env.STUDIO_BUILD_MODEL = "openai/gpt-x";
    expect(resolveModel("build")?.modelId).toBe("openai/gpt-x");
  });

  it("fallback: null when AI_GATEWAY_API_KEY is missing, fixed model id when present", () => {
    expect(resolveModel("fallback")).toBeNull();
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    expect(resolveModel("fallback")?.modelId).toBe("anthropic/claude-haiku-4.5");
  });
});

describe("resolveModelForAgent: fallback order coach -> build -> fallback", () => {
  it("null when no key is configured at all", () => {
    expect(resolveModelForAgent()).toBeNull();
  });

  it("picks build when only AI_GATEWAY_API_KEY is set (coach unusable)", () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    expect(resolveModelForAgent()?.tier).toBe("build");
  });

  it("picks coach when only OPENROUTER_API_KEY is set", () => {
    process.env.OPENROUTER_API_KEY = "or-key";
    expect(resolveModelForAgent()?.tier).toBe("coach");
  });

  it("prefers coach over build when both keys are set", () => {
    process.env.OPENROUTER_API_KEY = "or-key";
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    expect(resolveModelForAgent()?.tier).toBe("coach");
  });
});

describe("estimateCostMicroUsd", () => {
  it("is 0 for the free coach model regardless of token counts", () => {
    expect(
      estimateCostMicroUsd("nvidia/nemotron-3-nano-30b-a3b:free", { inputTokens: 100_000, outputTokens: 50_000 }),
    ).toBe(0);
  });

  it("is 0 for ANY ':free' route, including ones not in the pricing table", () => {
    // Regression: the nemotron-ultra coach override billed 2k free tokens at
    // the conservative unknown price and ate a fifth of the monthly cap.
    expect(
      estimateCostMicroUsd("nvidia/nemotron-3-ultra-550b-a55b:free", {
        inputTokens: 903,
        outputTokens: 1144,
      }),
    ).toBe(0);
  });

  it("computes input*price + output*price for a known model", () => {
    // anthropic/claude-haiku-4.5: 1 micro-USD/input token, 5 micro-USD/output token
    expect(estimateCostMicroUsd("anthropic/claude-haiku-4.5", { inputTokens: 1000, outputTokens: 200 })).toBe(
      1000 * 1 + 200 * 5,
    );
  });

  it("treats missing/undefined usage fields as 0", () => {
    expect(estimateCostMicroUsd("anthropic/claude-haiku-4.5", {})).toBe(0);
  });

  it("falls back to a conservative (high) price for an unrecognized model id", () => {
    const known = estimateCostMicroUsd("anthropic/claude-haiku-4.5", { inputTokens: 1000, outputTokens: 1000 });
    const unknown = estimateCostMicroUsd("some/unheard-of-model", { inputTokens: 1000, outputTokens: 1000 });
    expect(unknown).toBeGreaterThan(known);
  });
});
