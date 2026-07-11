import { describe, expect, it } from "vitest";
import { readAgentStream, UiMessageStreamParser, type AgentEvent } from "../src/stream";

function sseEvent(chunk: unknown): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

const TEXT_FIXTURE = [
  sseEvent({ type: "start" }),
  sseEvent({ type: "text-start", id: "t1" }),
  sseEvent({ type: "text-delta", id: "t1", delta: "Hola" }),
  sseEvent({ type: "text-delta", id: "t1", delta: " mundo" }),
  sseEvent({ type: "text-end", id: "t1" }),
  sseEvent({ type: "finish" }),
].join("");

const TOOL_FIXTURE = [
  sseEvent({ type: "start" }),
  sseEvent({
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "preview_society",
    input: { prompt: "peluqueria" },
  }),
  sseEvent({
    type: "tool-output-available",
    toolCallId: "call-1",
    output: { ok: true, draft: { denominacion: "Turnos SAS" } },
  }),
  sseEvent({ type: "finish" }),
].join("");

const ERROR_FIXTURE = sseEvent({ type: "error", errorText: "proveedor_sin_credito" });

describe("UiMessageStreamParser", () => {
  it("parses a text-only fixture into text events whose deltas concatenate, plus a finish event", () => {
    const parser = new UiMessageStreamParser();
    const events = [...parser.push(TEXT_FIXTURE), ...parser.flush()];
    const text = events.filter((e) => e.kind === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(text).toBe("Hola mundo");
    expect(events.at(-1)).toEqual({ kind: "finish" });
  });

  it("parses a tool fixture into a tool-output event carrying the looked-up toolName + output", () => {
    const parser = new UiMessageStreamParser();
    const events = [...parser.push(TOOL_FIXTURE), ...parser.flush()];
    const toolOutput = events.find((e) => e.kind === "tool-output");
    expect(toolOutput).toEqual({
      kind: "tool-output",
      toolCallId: "call-1",
      toolName: "preview_society",
      output: { ok: true, draft: { denominacion: "Turnos SAS" } },
    });
  });

  it("buffers a split delivery at every possible offset and yields the same events as a whole delivery", () => {
    const whole = new UiMessageStreamParser();
    const wholeEvents = [...whole.push(TOOL_FIXTURE), ...whole.flush()];

    // Split at EVERY character offset, including ones inside a JSON payload and
    // exactly between the two newlines of a "\n\n" separator, proving the
    // parser buffers incomplete events across push() regardless of where the
    // network chunk boundary falls.
    for (let splitAt = 0; splitAt <= TOOL_FIXTURE.length; splitAt++) {
      const split = new UiMessageStreamParser();
      const first = split.push(TOOL_FIXTURE.slice(0, splitAt));
      const second = split.push(TOOL_FIXTURE.slice(splitAt));
      const splitEvents = [...first, ...second, ...split.flush()];
      expect(splitEvents, `split at ${splitAt}`).toEqual(wholeEvents);
    }
  });

  it("yields an error event carrying errorText", () => {
    const parser = new UiMessageStreamParser();
    const events = [...parser.push(ERROR_FIXTURE), ...parser.flush()];
    expect(events).toEqual([{ kind: "error", message: "proveedor_sin_credito" }]);
  });

  it("ignores a [DONE] sentinel and a malformed JSON line instead of throwing", () => {
    const parser = new UiMessageStreamParser();
    const fixture = "data: [DONE]\n\ndata: {not json\n\n";
    expect(() => parser.push(fixture)).not.toThrow();
    const events = [...parser.push(fixture), ...parser.flush()];
    expect(events).toEqual([]);
  });

  it("normalizes \\r\\n to \\n", () => {
    const parser = new UiMessageStreamParser();
    const fixture = TEXT_FIXTURE.replace(/\n/g, "\r\n");
    const events = [...parser.push(fixture), ...parser.flush()];
    const text = events.filter((e) => e.kind === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(text).toBe("Hola mundo");
  });
});

describe("readAgentStream", () => {
  function bodyFrom(text: string): ReadableStream<Uint8Array> {
    const encoded = new TextEncoder().encode(text);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });
  }

  it("returns the accumulated text and null error for a text-only fixture, calling onEvent per event", async () => {
    const events: AgentEvent[] = [];
    const result = await readAgentStream({ body: bodyFrom(TEXT_FIXTURE), onEvent: (e) => events.push(e) });
    expect(result).toEqual({ text: "Hola mundo", error: null });
    expect(events.some((e) => e.kind === "finish")).toBe(true);
  });

  it("returns empty text and null error when body is null", async () => {
    const result = await readAgentStream({ body: null, onEvent: () => {} });
    expect(result).toEqual({ text: "", error: null });
  });

  it("records the first error event's message", async () => {
    const result = await readAgentStream({ body: bodyFrom(ERROR_FIXTURE), onEvent: () => {} });
    expect(result.error).toBe("proveedor_sin_credito");
  });
});
