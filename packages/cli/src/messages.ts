// Pure UI-message history builder for `ar-agents chat`. Mirrors the id
// scheme used by apps/studio/evals/driver.ts (u-0, a-0, u-1, ...) so
// fixtures and expectations line up across the repo. No AI SDK import: the
// CLI only ever needs the minimal `{ id, role, parts }` shape to send
// `POST /api/agent` and to render history back to the user.
//
// Scope: this now carries both the TEXT and the tool-call/tool-output parts
// of the conversation across turns (M1-4g). Tool parts are persisted using
// the AI SDK v7 "dynamic-tool" shape (`type: "dynamic-tool"`, with
// `toolName` alongside it), rather than a statically-typed `tool-<name>`
// part: the CLI does not share the server's tool types, so it cannot know
// each tool's input/output shape ahead of time, and dynamic-tool is exactly
// the form apps/studio/src/lib/ui/tool-parts.ts documents for that case.
// Every persisted tool part is already resolved (`state: "output-available"`),
// since the CLI only learns about a tool call once its stream has finished.

export type TextPart = { type: "text"; text: string };

export type ToolPart = {
  type: "dynamic-tool";
  toolName: string;
  toolCallId: string;
  state: "output-available";
  input: unknown;
  output: unknown;
};

export type UiPart = TextPart | ToolPart;

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  parts: UiPart[];
}

/** Builds a persisted, already-resolved dynamic-tool part for `toolName`. */
export function toolPart(toolName: string, toolCallId: string, input: unknown, output: unknown): ToolPart {
  return { type: "dynamic-tool", toolName, toolCallId, state: "output-available", input, output };
}

export function userMessage(text: string, index: number): UiMessage {
  return { id: `u-${index}`, role: "user", parts: [{ type: "text", text }] };
}

/** Builds an assistant message from any tool parts collected during the turn
 *  plus its text, in that order. An empty `text` never gets a text part: a
 *  blank text block poisons the next request (the model provider rejects an
 *  empty text part), so a tool-only turn ends up with only its tool parts. */
export function assistantMessage(text: string, index: number, toolParts: ToolPart[] = []): UiMessage {
  const parts: UiPart[] = [...toolParts];
  if (text.length > 0) parts.push({ type: "text", text });
  return { id: `a-${index}`, role: "assistant", parts };
}

function countRole(history: UiMessage[], role: "user" | "assistant"): number {
  return history.filter((m) => m.role === role).length;
}

/** Returns a new array with a user message appended; never mutates `history`. */
export function appendUserTurn(history: UiMessage[], text: string): UiMessage[] {
  return [...history, userMessage(text, countRole(history, "user"))];
}

/** Returns a new array with an assistant message appended; never mutates `history`. */
export function appendAssistantTurn(history: UiMessage[], text: string, toolParts: ToolPart[] = []): UiMessage[] {
  return [...history, assistantMessage(text, countRole(history, "assistant"), toolParts)];
}
