// Pure parser for the AI SDK v7 UI-message stream (SSE over `POST
// /api/agent`, see apps/studio/src/app/api/agent/route.ts and
// apps/studio/test/evals-driver.test.ts for the authoritative chunk shapes).
// No dependency on the "ai" package: this only needs to understand the wire
// format (`data: <json>\n\n` events), not the SDK's own types, so the CLI
// can parse it offline without pulling in a model runtime.

export type AgentEvent =
  | { kind: "text"; delta: string }
  | { kind: "tool-input"; toolCallId: string; toolName: string; input: unknown }
  | { kind: "tool-output"; toolCallId: string; toolName: string | null; output: unknown }
  | { kind: "error"; message: string }
  | { kind: "finish" };

interface RawChunk {
  type?: unknown;
  id?: unknown;
  delta?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  input?: unknown;
  output?: unknown;
  errorText?: unknown;
}

/** Incremental SSE -> AgentEvent parser. Buffers across `push()` calls so a
 *  network chunk boundary landing mid-event never loses data; call `flush()`
 *  once the stream ends to parse any trailing event without a final blank
 *  line. */
export class UiMessageStreamParser {
  private buffer = "";
  private toolNames = new Map<string, string>();

  /** Feeds a raw decoded text chunk in, returns the events found in the
   *  complete SSE event blocks (terminated by a blank line) seen so far. */
  push(textChunk: string): AgentEvent[] {
    this.buffer += textChunk.replace(/\r\n/g, "\n");
    const events: AgentEvent[] = [];
    let boundary: number;
    while ((boundary = this.buffer.indexOf("\n\n")) !== -1) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      this.consumeBlock(block, events);
    }
    return events;
  }

  /** Parses whatever is left in the buffer (a trailing event that never got
   *  a closing blank line) and clears it. */
  flush(): AgentEvent[] {
    const events: AgentEvent[] = [];
    if (this.buffer.length > 0) {
      this.consumeBlock(this.buffer, events);
      this.buffer = "";
    }
    return events;
  }

  private consumeBlock(block: string, events: AgentEvent[]): void {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice("data:".length).trim();
      let chunk: RawChunk;
      try {
        chunk = JSON.parse(payload) as RawChunk;
      } catch {
        continue;
      }
      const event = this.mapChunk(chunk);
      if (event) events.push(event);
    }
  }

  private mapChunk(chunk: RawChunk): AgentEvent | null {
    switch (chunk.type) {
      case "text-delta":
        return typeof chunk.delta === "string" ? { kind: "text", delta: chunk.delta } : null;
      case "tool-input-available": {
        if (typeof chunk.toolCallId !== "string" || typeof chunk.toolName !== "string") return null;
        this.toolNames.set(chunk.toolCallId, chunk.toolName);
        return { kind: "tool-input", toolCallId: chunk.toolCallId, toolName: chunk.toolName, input: chunk.input };
      }
      case "tool-output-available": {
        if (typeof chunk.toolCallId !== "string") return null;
        const toolName = this.toolNames.get(chunk.toolCallId) ?? null;
        return { kind: "tool-output", toolCallId: chunk.toolCallId, toolName, output: chunk.output };
      }
      case "error":
        return { kind: "error", message: typeof chunk.errorText === "string" ? chunk.errorText : "error_desconocido" };
      case "finish":
        return { kind: "finish" };
      default:
        return null;
    }
  }
}

/** Reads a `POST /api/agent` response body end to end, feeding every decoded
 *  chunk through a UiMessageStreamParser and calling `onEvent` for each
 *  event as it is found. Returns the concatenated assistant text and the
 *  first error's message, if any. */
export async function readAgentStream(opts: {
  body: ReadableStream<Uint8Array> | null;
  onEvent: (e: AgentEvent) => void;
}): Promise<{ text: string; error: string | null }> {
  if (!opts.body) return { text: "", error: null };

  const parser = new UiMessageStreamParser();
  const decoder = new TextDecoder();
  const reader = opts.body.getReader();
  let text = "";
  let error: string | null = null;

  const handle = (events: AgentEvent[]) => {
    for (const event of events) {
      opts.onEvent(event);
      if (event.kind === "text") text += event.delta;
      if (event.kind === "error" && error === null) error = event.message;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    handle(parser.push(decoder.decode(value, { stream: true })));
  }
  handle(parser.push(decoder.decode()));
  handle(parser.flush());

  return { text, error };
}
