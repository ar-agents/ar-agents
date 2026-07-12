/**
 * Model routing for the agent loop. Two tiers, config-only (env-overridable),
 * plus a fixed hard fallback:
 *  - "coach": the default, cheap/conversational tier. OpenRouter by default
 *    (needs OPENROUTER_API_KEY), routed via @ai-sdk/openai-compatible.
 *  - "build": the tier for heavier structuring steps. Vercel AI Gateway by
 *    default (needs AI_GATEWAY_API_KEY) -- a plain "provider/model" string is
 *    enough, the AI SDK v7 global gateway resolves it from that env var.
 *  - "fallback": a fixed gateway model (anthropic/claude-haiku-4.5), tried
 *    last, also needs AI_GATEWAY_API_KEY.
 *
 * `resolveModel(tier)` returns null when that tier's required key is
 * missing, so a caller can walk the fallback chain and skip unusable tiers.
 * `resolveModelForAgent()` is that walk: coach -> build -> fallback, per
 * CONTRACT.md; returns null (=> the route answers 503 no_model_configured)
 * only when none of the three has its key configured.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { streamText } from "ai";

export type ModelTier = "coach" | "build" | "fallback";

/** Pricing is expressed in micro-USD per token, which is numerically
 *  identical to "USD per million tokens" (1 USD/1e6 tokens = 1e-6 USD/token
 *  = 1 micro-USD/token). Figures below are approximate reference prices from
 *  each provider's published rate card at the time this file was written;
 *  they are a config constant for the ESTIMATED cost shown to the user (v1
 *  charges nothing for real), not a billing source of truth. Review
 *  periodically against provider pricing pages.
 */
interface TokenPricing {
  inputMicroUsdPerToken: number;
  outputMicroUsdPerToken: number;
}

const PRICING: Record<string, TokenPricing> = {
  // OpenRouter free-tier promotional model (":free" suffix): no cost.
  "nvidia/nemotron-3-nano-30b-a3b:free": { inputMicroUsdPerToken: 0, outputMicroUsdPerToken: 0 },
  // AI Gateway rate card (ai-gateway.vercel.sh/v1/models, checked 2026-07-08):
  // 0.14 / 0.28 USD per 1M tokens.
  "deepseek/deepseek-v4-flash": { inputMicroUsdPerToken: 0.14, outputMicroUsdPerToken: 0.28 },
  // Same rate card: 0.20 / 1.25 USD per 1M tokens.
  "openai/gpt-5.4-nano": { inputMicroUsdPerToken: 0.2, outputMicroUsdPerToken: 1.25 },
  // Anthropic's published Claude Haiku 4.5 pricing.
  "anthropic/claude-haiku-4.5": { inputMicroUsdPerToken: 1, outputMicroUsdPerToken: 5 },
};

/** Conservative (high) price for a model id with no table entry, so an
 *  unrecognized model is never UNDER-counted. */
const UNKNOWN_MODEL_PRICING: TokenPricing = {
  inputMicroUsdPerToken: 15,
  outputMicroUsdPerToken: 75,
};

function pricingFor(modelId: string): TokenPricing {
  const known = PRICING[modelId];
  if (known) return known;
  // OpenRouter's ":free" suffix is a routing contract, not a name: those
  // routes bill nothing. Without this rule any free model missing from the
  // table (e.g. a coach override) falls to the conservative unknown price
  // and burns the user's free cap on a zero-cost conversation.
  if (modelId.endsWith(":free")) {
    return { inputMicroUsdPerToken: 0, outputMicroUsdPerToken: 0 };
  }
  return UNKNOWN_MODEL_PRICING;
}

/** Estimate the model cost (micro-USD) of one call's token usage. */
export function estimateCostMicroUsd(
  modelId: string,
  usage: { inputTokens?: number; outputTokens?: number },
): number {
  const p = pricingFor(modelId);
  const input = Math.max(0, usage.inputTokens ?? 0);
  const output = Math.max(0, usage.outputTokens ?? 0);
  return Math.round(input * p.inputMicroUsdPerToken + output * p.outputMicroUsdPerToken);
}

type StreamTextModel = Parameters<typeof streamText>[0]["model"];

interface TierSpec {
  /** Env var whose presence gates whether this tier is usable at all. */
  requiredEnv: string;
  /** Env var that overrides the default model id for this tier, if any. */
  overrideEnv?: string;
  defaultModelId: string;
  provider: "gateway" | "openrouter";
}

const TIER_SPECS: Record<ModelTier, TierSpec> = {
  coach: {
    requiredEnv: "OPENROUTER_API_KEY",
    overrideEnv: "STUDIO_COACH_MODEL",
    // M1-8 (2026-07-12): ultra is the first coach model to pass the live
    // eval gate (mean 3.83 vs the 3.5 gate, all deterministic checks green).
    // super-120b hit 3.50 on the same run day but violated language
    // mirroring and skipped a required draft. A STUDIO_COACH_MODEL env pin
    // still wins over this default (prod must drop or update its pin).
    defaultModelId: "nvidia/nemotron-3-ultra-550b-a55b:free",
    provider: "openrouter",
  },
  build: {
    requiredEnv: "AI_GATEWAY_API_KEY",
    overrideEnv: "STUDIO_BUILD_MODEL",
    defaultModelId: "deepseek/deepseek-v4-flash",
    provider: "gateway",
  },
  fallback: {
    requiredEnv: "AI_GATEWAY_API_KEY",
    defaultModelId: "anthropic/claude-haiku-4.5",
    provider: "gateway",
  },
};

export interface ResolvedModel {
  tier: ModelTier;
  modelId: string;
  model: StreamTextModel;
  pricing: TokenPricing;
}

/** Resolve one tier. Returns null when that tier's required key is missing
 *  from the environment, so callers can skip it and try the next tier. */
export function resolveModel(tier: ModelTier): ResolvedModel | null {
  const spec = TIER_SPECS[tier];
  const key = process.env[spec.requiredEnv]?.trim();
  if (!key) return null;

  const modelId = (spec.overrideEnv && process.env[spec.overrideEnv]?.trim()) || spec.defaultModelId;

  const model: StreamTextModel =
    spec.provider === "gateway"
      ? modelId
      : createOpenAICompatible({
          baseURL: "https://openrouter.ai/api/v1",
          name: "openrouter",
          apiKey: key,
        })(modelId);

  return { tier, modelId, model, pricing: pricingFor(modelId) };
}

/**
 * Walk the fallback order coach -> build -> fallback, skipping any tier
 * whose required key is missing, and return the first usable one. Null
 * means NONE is configured (the route answers 503 no_model_configured).
 */
export function resolveModelForAgent(): ResolvedModel | null {
  return resolveModel("coach") ?? resolveModel("build") ?? resolveModel("fallback");
}
