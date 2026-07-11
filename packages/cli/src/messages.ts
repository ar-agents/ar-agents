// Pure UI-message history builder for `ar-agents chat`. Mirrors the id
// scheme used by apps/studio/evals/driver.ts (u-0, a-0, u-1, ...) so
// fixtures and expectations line up across the repo. No AI SDK import: the
// CLI only ever needs the minimal `{ id, role, parts }` shape to send
// `POST /api/agent` and to render history back to the user.
//
// Scope: this carries the TEXT of the conversation across turns. Tool-call and
// tool-output parts are surfaced live in the terminal but are not persisted
// into history yet (the studio UI keeps them via readUIMessageStream; doing
// that faithfully here needs the AI SDK). Tracked as a follow-up (M1-4g).

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
}

export function userMessage(text: string, index: number): UiMessage {
  return { id: `u-${index}`, role: "user", parts: [{ type: "text", text }] };
}

export function assistantMessage(text: string, index: number): UiMessage {
  return { id: `a-${index}`, role: "assistant", parts: [{ type: "text", text }] };
}

function countRole(history: UiMessage[], role: "user" | "assistant"): number {
  return history.filter((m) => m.role === role).length;
}

/** Returns a new array with a user message appended; never mutates `history`. */
export function appendUserTurn(history: UiMessage[], text: string): UiMessage[] {
  return [...history, userMessage(text, countRole(history, "user"))];
}

/** Returns a new array with an assistant message appended; never mutates `history`. */
export function appendAssistantTurn(history: UiMessage[], text: string): UiMessage[] {
  return [...history, assistantMessage(text, countRole(history, "assistant"))];
}
