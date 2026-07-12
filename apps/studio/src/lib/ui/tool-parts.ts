// Pure helpers for reading tool-call results out of AI SDK v7 UIMessage
// parts, without importing the backend's tool definitions (this app never
// imports backend libs; docs/CONTRACT.md documents what each tool returns).
// Works for both statically-typed tool parts (`type: "tool-<name>"`) and
// dynamic-tool parts (`type: "dynamic-tool", toolName: "<name>"`), which is
// how a tool call can show up when the client doesn't share the server's
// tool types (our case: the model routing + tool set live server-side only).

export interface MinimalToolPart {
  type: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export interface MinimalUIMessage {
  id: string;
  role: string;
  parts: MinimalToolPart[];
}

export interface ToolPartMatch {
  message: MinimalUIMessage;
  part: MinimalToolPart;
  name: string;
}

/** Name of the tool a part refers to, whether static (`tool-<name>`) or
 *  dynamic (`dynamic-tool` + `toolName`). Null for a non-tool part (text,
 *  reasoning, file, step-start, etc). */
export function toolPartName(part: MinimalToolPart): string | null {
  if (part.type === "dynamic-tool") return part.toolName ?? null;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return null;
}

/** All tool parts across every message, in conversation order. */
export function collectToolParts(messages: MinimalUIMessage[]): ToolPartMatch[] {
  const out: ToolPartMatch[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      const name = toolPartName(part);
      if (name) out.push({ message, part, name });
    }
  }
  return out;
}

/** The most recent successful (`output-available`) part for a named tool, or
 *  null if it was never called or never completed. Returns the whole part
 *  (not just its output) so a caller can compare it by reference -- e.g. the
 *  chat UI uses this to render the ConstitutionCard exactly once, on the
 *  latest preview_society part, instead of once per historical draft. */
export function latestToolPart(
  messages: MinimalUIMessage[],
  toolName: string,
): MinimalToolPart | null {
  const matches = collectToolParts(messages).filter(
    (m) => m.name === toolName && m.part.state === "output-available",
  );
  return matches.length > 0 ? matches[matches.length - 1].part : null;
}

/** The most recent successful (`output-available`) result for a named tool,
 *  or undefined if it was never called or never completed. */
export function latestToolOutput(
  messages: MinimalUIMessage[],
  toolName: string,
): unknown | undefined {
  return latestToolPart(messages, toolName)?.output;
}

/** Whether the named tool is currently mid-call anywhere in the conversation
 *  (input streaming/available but no output yet) - drives "consultando..."
 *  status lines. */
export function isToolPending(messages: MinimalUIMessage[], toolName: string): boolean {
  return collectToolParts(messages).some(
    (m) =>
      m.name === toolName &&
      (m.part.state === "input-streaming" || m.part.state === "input-available"),
  );
}
