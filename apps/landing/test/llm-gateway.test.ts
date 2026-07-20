import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** llm-gateway: model resolution + audited generation/stream wrappers. The AI SDK
 * and the ledger are mocked so the boundary behavior is tested without a live model. */

vi.mock("ai", () => ({
  generateObject: vi.fn(),
  streamText: vi.fn(),
}));
vi.mock("../src/lib/ledger", () => ({
  appendLink: vi.fn(async () => null),
}));

import { generateObject, streamText } from "ai";
import { appendLink } from "../src/lib/ledger";
import { gwGenerateObject, gwStreamText, gatewayModel, resolveLlm, DEFAULT_MODEL, DEFAULT_OPENROUTER_MODEL, MODEL_POSTURE } from "../src/lib/llm-gateway";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGen = generateObject as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockStream = streamText as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAppend = appendLink as any;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AR_AGENTS_LLM_MODEL;
  delete process.env.AR_AGENTS_OPENROUTER_MODEL;
  delete process.env.OPENROUTER_API_KEY;
});

describe("gatewayModel", () => {
  it("defaults, and switches by env only (config-only provider switch)", () => {
    expect(gatewayModel()).toBe(DEFAULT_MODEL);
    process.env.AR_AGENTS_LLM_MODEL = "openai/gpt-x";
    expect(gatewayModel()).toBe("openai/gpt-x");
  });
});

describe("resolveLlm", () => {
  it("without OPENROUTER_API_KEY stays on the AI Gateway string path", () => {
    const r = resolveLlm();
    expect(r.provider).toBe("gateway");
    expect(r.modelId).toBe(DEFAULT_MODEL);
    expect(r.model).toBe(DEFAULT_MODEL);
  });

  it("with OPENROUTER_API_KEY routes via OpenRouter on the free default", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const r = resolveLlm();
    expect(r.provider).toBe("openrouter");
    expect(r.modelId).toBe(DEFAULT_OPENROUTER_MODEL);
    // A provider-bound model instance, not the raw gateway string.
    expect(typeof r.model).not.toBe("string");
  });

  it("AR_AGENTS_OPENROUTER_MODEL overrides the OpenRouter model id only", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    process.env.AR_AGENTS_OPENROUTER_MODEL = "meta-llama/llama-x:free";
    expect(resolveLlm().modelId).toBe("meta-llama/llama-x:free");
    delete process.env.OPENROUTER_API_KEY;
    // Gateway path ignores the OpenRouter override.
    expect(resolveLlm().modelId).toBe(DEFAULT_MODEL);
  });
});

describe("gwGenerateObject", () => {
  it("returns the object, uses the gateway model, and audits ok with NO prompt content", async () => {
    mockGen.mockResolvedValueOnce({ object: { hello: "world" } });
    const out = await gwGenerateObject(
      { purpose: "prompt-to-society" },
      { schema: z.object({ hello: z.string() }), prompt: "SECRETPROMPT", instructions: "sys" },
    );
    expect(out).toEqual({ hello: "world" });
    expect(mockGen).toHaveBeenCalledWith(expect.objectContaining({ model: DEFAULT_MODEL }));
    expect(mockAppend).toHaveBeenCalledTimes(1);
    const link = mockAppend.mock.calls[0][0];
    expect(link.action).toBe("llm.call");
    expect(link.meta.purpose).toBe("prompt-to-society");
    expect(link.meta.outcome).toBe("ok");
    expect(link.meta.modelPosture).toBe(MODEL_POSTURE);
    // metadata-only: the prompt/instructions never reach the audit record
    expect(JSON.stringify(link)).not.toContain("SECRETPROMPT");
    expect(JSON.stringify(link)).not.toContain("sys");
  });

  it("audits an error outcome and rethrows", async () => {
    mockGen.mockRejectedValueOnce(new Error("boom"));
    await expect(
      gwGenerateObject({ purpose: "t" }, { schema: z.object({}), prompt: "x" }),
    ).rejects.toThrow("boom");
    expect(mockAppend.mock.calls[0][0].meta.outcome).toBe("error");
  });

  it("audit:false skips the ledger write", async () => {
    mockGen.mockResolvedValueOnce({ object: {} });
    await gwGenerateObject({ purpose: "t", audit: false }, { schema: z.object({}), prompt: "x" });
    expect(mockAppend).not.toHaveBeenCalled();
  });
});

describe("gwStreamText", () => {
  it("resolves the gateway model, wraps onFinish to audit, and preserves the caller onFinish", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let captured: any;
    mockStream.mockImplementation((args: unknown) => {
      captured = args;
      return { streamed: true };
    });
    const callerOnFinish = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = gwStreamText({ purpose: "demo-chat" }, { messages: [], onFinish: callerOnFinish } as any);
    expect(res).toEqual({ streamed: true });
    expect(captured.model).toBe(DEFAULT_MODEL);

    // Invoking the wrapped onFinish audits (default audit true) and calls the caller's.
    await captured.onFinish({ usage: { totalTokens: 5 } });
    expect(mockAppend).toHaveBeenCalledTimes(1);
    expect(mockAppend.mock.calls[0][0].meta.kind).toBe("streamText");
    expect(callerOnFinish).toHaveBeenCalledTimes(1);
  });
});
