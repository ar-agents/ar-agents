import { describe, expect, it } from "vitest";
import { JsonToSseTransformStream, UI_MESSAGE_STREAM_HEADERS, type UIMessageChunk } from "ai";
import {
  appendUserTurn,
  buildInitialMessages,
  buildPersonaTurnPrompt,
  lastAssistantText,
  readFinalUIMessages,
  renderTranscript,
  sseBodyToUIMessageChunkStream,
} from "../evals/driver";

// This whole suite makes no model call: the SSE-decoding tests build the
// wire format by hand with the real "ai" SDK primitives (JsonToSseTransformStream,
// UI_MESSAGE_STREAM_HEADERS) instead of calling streamText, so they prove the
// decode path (parseJsonEventStream -> readUIMessageStream) is wired
// correctly without needing a model key.

describe("buildInitialMessages", () => {
  it("starts the transcript with the persona's opening as a single user message", () => {
    const messages = buildInitialMessages({ opening: "Quiero armar una sociedad automatizada." });
    expect(messages).toEqual([
      { id: "u-0", role: "user", parts: [{ type: "text", text: "Quiero armar una sociedad automatizada." }] },
    ]);
  });
});

describe("appendUserTurn", () => {
  it("appends without mutating the input array", () => {
    const original = buildInitialMessages({ opening: "hola" });
    const next = appendUserTurn(original, "segundo mensaje");
    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ id: "u-1", role: "user", parts: [{ type: "text", text: "segundo mensaje" }] });
  });
});

describe("lastAssistantText", () => {
  it("returns the empty string when there is no assistant message yet", () => {
    expect(lastAssistantText(buildInitialMessages({ opening: "hola" }))).toBe("");
  });

  it("joins every text part of the most recent assistant message", () => {
    const messages = [
      { id: "u-0", role: "user", parts: [{ type: "text", text: "hola" }] },
      { id: "a-0", role: "assistant", parts: [{ type: "text", text: "primera respuesta" }] },
      { id: "u-1", role: "user", parts: [{ type: "text", text: "segunda pregunta" }] },
      {
        id: "a-1",
        role: "assistant",
        parts: [
          { type: "text", text: "parte uno" },
          { type: "tool-preview_society", state: "output-available", output: {} },
          { type: "text", text: "parte dos" },
        ],
      },
    ];
    expect(lastAssistantText(messages)).toBe("parte uno\nparte dos");
  });
});

describe("renderTranscript", () => {
  it("renders roles and tool calls into a flat, judge-readable string", () => {
    const messages = [
      { id: "u-0", role: "user", parts: [{ type: "text", text: "hola" }] },
      {
        id: "a-0",
        role: "assistant",
        parts: [
          { type: "text", text: "dale" },
          { type: "tool-preview_society", state: "output-available", output: {} },
        ],
      },
    ];
    const text = renderTranscript(messages);
    expect(text).toContain("USER: hola");
    expect(text).toContain("ASSISTANT: dale [tools: tool-preview_society]");
  });
});

describe("buildPersonaTurnPrompt", () => {
  it("names the language in English for an en persona and includes the hint + last assistant text", () => {
    const { system, prompt } = buildPersonaTurnPrompt("An English-speaking founder.", "en", "Ask about pricing.", "Hi there!");
    expect(system).toContain("English");
    expect(system).toContain("An English-speaking founder.");
    expect(prompt).toContain("Ask about pricing.");
    expect(prompt).toContain("Hi there!");
  });

  it("names the language as Argentine Spanish for an es persona", () => {
    const { system } = buildPersonaTurnPrompt("Una diseñadora freelance.", "es", "hint", "texto anterior");
    expect(system).toContain("Argentine Spanish (es-AR)");
  });
});

describe("SSE decoding: sseBodyToUIMessageChunkStream + readFinalUIMessages", () => {
  function sseResponse(chunks: UIMessageChunk[]): Response {
    const readable = new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    const body = readable.pipeThrough(new JsonToSseTransformStream()).pipeThrough(new TextEncoderStream());
    return new Response(body, { headers: UI_MESSAGE_STREAM_HEADERS });
  }

  it("decodes a text-only stream back into the final assistant UIMessage", async () => {
    const res = sseResponse([
      { type: "start" },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "Hola" },
      { type: "text-delta", id: "t1", delta: " mundo" },
      { type: "text-end", id: "t1" },
      { type: "finish" },
    ]);

    const messages = await readFinalUIMessages(res);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].parts).toEqual([{ type: "text", text: "Hola mundo", state: "done" }]);
  });

  it("decodes a tool-call chunk into a tool part carrying its output", async () => {
    const res = sseResponse([
      { type: "start" },
      {
        type: "tool-input-available",
        toolCallId: "call-1",
        toolName: "preview_society",
        input: { prompt: "peluquería" },
      },
      {
        type: "tool-output-available",
        toolCallId: "call-1",
        output: { ok: true, draft: { denominacion: "Turnos SAS" } },
      },
      { type: "finish" },
    ]);

    const messages = await readFinalUIMessages(res);
    expect(messages).toHaveLength(1);
    const toolPart = messages[0].parts.find((p) => p.type === "tool-preview_society");
    expect(toolPart).toBeDefined();
    expect(toolPart?.state).toBe("output-available");
    expect(toolPart?.output).toEqual({ ok: true, draft: { denominacion: "Turnos SAS" } });
  });

  it("returns an empty array when the response has no body", async () => {
    const res = new Response(null, { headers: UI_MESSAGE_STREAM_HEADERS });
    expect(await readFinalUIMessages(res)).toEqual([]);
  });

  it("sseBodyToUIMessageChunkStream drops unparseable events instead of throwing", async () => {
    // A body that isn't valid SSE-encoded JSON at all: the transform should
    // just yield nothing, not crash the caller.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("not: sse\n\n"));
        controller.close();
      },
    });
    const chunkStream = sseBodyToUIMessageChunkStream(body);
    const reader = chunkStream.getReader();
    const { done } = await reader.read();
    expect(done).toBe(true);
  });
});
