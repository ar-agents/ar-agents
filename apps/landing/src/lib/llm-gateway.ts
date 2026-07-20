/**
 * llm-gateway — the SINGLE boundary for LLM calls in the landing app.
 *
 * Every model call routes through here so:
 *  1. the model + provider are resolved from ONE config — provider/hosting
 *     switches are ENV-only (AR_AGENTS_LLM_MODEL), routed through the Vercel AI
 *     Gateway (which also gives per-route observability + one billing line).
 *  2. posture + context metadata (purpose, session, entity) travel with the call.
 *  3. governance-relevant calls are recorded in the audit ledger (metadata only —
 *     never the prompt content or PII).
 *  4. the "LLMs suggest, code decides" invariant holds: the gateway returns DATA
 *     (generateObject is schema-constrained, so a model physically cannot return
 *     executable text) or a token stream to a human. It NEVER lets a model move
 *     money or mutate state — that enforcement lives downstream in deterministic
 *     code (the art.102 gate + the schema re-validation at each call site).
 *
 * A scattered `generateObject`/`streamText` import from "ai" bypasses all of the
 * above; llm-gateway-boundary.test.ts locks the runtime call sites to this module.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject, streamText } from "ai";
import type { z } from "zod";
import { appendLink } from "./ledger";

/** The default gateway model id. String form => provider resolved by the AI Gateway. */
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

/** Default model on the OpenRouter path. Mirrors the studio coach's proven
 *  pick (apps/studio/src/lib/models.ts, M1-8: first model to pass the live
 *  eval gate). Free tier, so this path works with a $0 balance. */
export const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

/** The ONE place model selection lives. Provider/model switch = env only. */
export function gatewayModel(): string {
  return process.env.AR_AGENTS_LLM_MODEL?.trim() || DEFAULT_MODEL;
}

type LlmModel = Parameters<typeof streamText>[0]["model"];

export interface ResolvedLlm {
  provider: "openrouter" | "gateway";
  modelId: string;
  model: LlmModel;
}

/**
 * Provider resolution, env-only, same convention as the studio's model
 * tiers (apps/studio/src/lib/models.ts): when OPENROUTER_API_KEY is set,
 * route via OpenRouter (free-tier capable, survives a drained Vercel AI
 * Gateway balance — the 2026-07-20 outage took down every landing model
 * call including BYOK); otherwise keep the AI Gateway string path.
 * AR_AGENTS_OPENROUTER_MODEL overrides the OpenRouter model id;
 * AR_AGENTS_LLM_MODEL keeps overriding the gateway id, unchanged.
 */
export function resolveLlm(): ResolvedLlm {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (key) {
    const modelId = process.env.AR_AGENTS_OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
    const provider = createOpenAICompatible({
      baseURL: "https://openrouter.ai/api/v1",
      name: "openrouter",
      apiKey: key,
    });
    return { provider: "openrouter", modelId, model: provider(modelId) };
  }
  return { provider: "gateway", modelId: gatewayModel(), model: gatewayModel() };
}

/** Posture reported with every call: LLM access is mediated by the gateway. */
export const MODEL_POSTURE = "gateway" as const;

export interface LlmContext {
  /** Why the model is being consulted, e.g. "prompt-to-society", "demo-chat". */
  purpose: string;
  sessionId?: string;
  entityId?: string;
  /** Extra PII-free posture/context to travel with the audit record. */
  posture?: Record<string, string | number | boolean>;
  /** Record a governance audit entry in the ledger. Default true. Set false for
   * high-frequency interactive chat (the Vercel gateway already observes those). */
  audit?: boolean;
}

/** Best-effort ledger audit of a model call. Metadata ONLY — no prompt/PII. Never throws. */
async function auditCall(ctx: LlmContext, meta: Record<string, unknown>): Promise<void> {
  if (ctx.audit === false) return;
  try {
    await appendLink({
      societyId: ctx.entityId ?? null,
      actor: "llm-gateway",
      action: "llm.call",
      meta: {
        purpose: ctx.purpose,
        modelPosture: MODEL_POSTURE,
        ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        ...(ctx.posture ?? {}),
        ...meta,
      },
    });
  } catch {
    // best-effort: auditing a model call must never fail the call
  }
}

export interface GenerateObjectParams {
  schema: z.ZodTypeAny;
  prompt: string;
  instructions?: string;
  maxOutputTokens?: number;
}

/**
 * Schema-constrained object generation — the "LLM emits DATA" path. Returns the
 * raw model object as `unknown`; the caller MUST re-validate it (the gateway never
 * trusts the model's output). Audits the call (metadata only) via the ledger.
 */
export async function gwGenerateObject(ctx: LlmContext, params: GenerateObjectParams): Promise<unknown> {
  const { provider, modelId, model } = resolveLlm();
  const promptChars = (params.prompt?.length ?? 0) + (params.instructions?.length ?? 0);
  try {
    const { object } = await generateObject({
      model,
      schema: params.schema,
      prompt: params.prompt,
      ...(params.instructions ? { instructions: params.instructions } : {}),
      ...(params.maxOutputTokens ? { maxOutputTokens: params.maxOutputTokens } : {}),
    });
    await auditCall(ctx, { kind: "generateObject", model: modelId, provider, promptChars, outcome: "ok" });
    return object;
  } catch (e) {
    await auditCall(ctx, { kind: "generateObject", model: modelId, provider, promptChars, outcome: "error" });
    throw e;
  }
}

type StreamTextArg = Parameters<typeof streamText>[0];
type OnFinishEvent = Parameters<NonNullable<StreamTextArg["onFinish"]>>[0];

/** streamText options with `model` + `onFinish` made optional — the gateway supplies them. */
export type GwStreamParams = Omit<StreamTextArg, "model" | "onFinish"> & {
  model?: StreamTextArg["model"];
  onFinish?: StreamTextArg["onFinish"];
};

/**
 * Streamed chat/tool-loop generation for a human. Resolves the model from the
 * gateway (unless the caller pins one), and attaches an onFinish that audits the
 * completed call (metadata only) while preserving any caller onFinish.
 */
export function gwStreamText(ctx: LlmContext, params: GwStreamParams): ReturnType<typeof streamText> {
  const callerOnFinish = params.onFinish;
  const resolved = params.model ? null : resolveLlm();
  return streamText({
    ...params,
    model: params.model ?? resolved!.model,
    onFinish: async (event: OnFinishEvent) => {
      void auditCall(ctx, {
        kind: "streamText",
        outcome: "finish",
        ...(resolved ? { model: resolved.modelId, provider: resolved.provider } : {}),
      });
      if (callerOnFinish) await callerOnFinish(event);
    },
  } as StreamTextArg);
}
