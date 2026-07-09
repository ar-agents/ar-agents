/**
 * Drives a full founder journey against `POST /api/agent`, in process (no
 * HTTP server, no browser): imports the route handler directly, the same
 * shape test/agent-route.test.ts already uses. Only exercised by
 * `run.mjs --mode live` (offline mode checks fixtures instead, see
 * rubric.ts + run.mjs); the pure helpers below are also unit-tested without
 * any model call (test/evals-driver.test.ts). See ROADMAP.md M1-7.
 */

import { generateText, parseJsonEventStream, readUIMessageStream, uiMessageChunkSchema, type UIMessageChunk } from "ai";
import { createAccount } from "@/lib/account";
import { resolveModel } from "@/lib/models";
import { POST } from "@/app/api/agent/route";
import { collectToolParts, latestToolOutput } from "@/lib/ui/tool-parts";
import type { Persona } from "./personas";
import type { JourneyResult, MinimalUIMessage } from "./types";

/** Caps the conversation at this many assistant replies, per ROADMAP.md
 *  M1-7 ("cap 4 assistant turns"). */
export const MAX_ASSISTANT_TURNS = 4;

// ── Pure message-assembly helpers (unit-tested, no model call) ────────────

/** The opening UIMessage array for a persona. */
export function buildInitialMessages(persona: Pick<Persona, "opening">): MinimalUIMessage[] {
  return [{ id: "u-0", role: "user", parts: [{ type: "text", text: persona.opening }] }];
}

/** Appends a new user turn to a growing message list, without mutating it. */
export function appendUserTurn(messages: MinimalUIMessage[], text: string): MinimalUIMessage[] {
  return [...messages, { id: `u-${messages.length}`, role: "user", parts: [{ type: "text", text }] }];
}

/** The plain text of the most recent assistant message, used both to seed
 *  the next persona-actor turn and to render the judge transcript. */
export function lastAssistantText(messages: MinimalUIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    return m.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n");
  }
  return "";
}

/** Renders a full transcript to plain text for the judge prompt (judge.ts)
 *  and for report.json's human-readable summary. */
export function renderTranscript(messages: MinimalUIMessage[]): string {
  return messages
    .map((m) => {
      const text = m.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join(" ");
      const tools = m.parts
        .map((p) => p.type)
        .filter((t) => t.startsWith("tool-") || t === "dynamic-tool");
      const toolNote = tools.length > 0 ? ` [tools: ${tools.join(", ")}]` : "";
      return `${m.role.toUpperCase()}: ${text}${toolNote}`;
    })
    .join("\n\n");
}

/** The system + user prompt that seeds the cheap actor model for one
 *  persona follow-up turn. The hint is a stage direction, not a script: the
 *  actor paraphrases it in character so the transcript reads like a real
 *  conversation instead of a fixture replay. */
export function buildPersonaTurnPrompt(
  description: string,
  language: "es" | "en",
  hint: string,
  assistantLastText: string,
): { system: string; prompt: string } {
  const languageName = language === "en" ? "English" : "Argentine Spanish (es-AR)";
  return {
    system:
      `You are role-playing a founder talking to a startup coach, strictly in character. ` +
      `Persona: ${description} Reply in ${languageName}, as one short conversational ` +
      `message, with no meta-commentary about being an AI or about this being a test.`,
    prompt:
      `The coach just said:\n"""${assistantLastText}"""\n\n` +
      `Your intent for this next turn: ${hint}\n\n` +
      `Write only your next message to the coach.`,
  };
}

// ── SSE decoding (unit-tested against a hand-built stream, no model call) ─

// parseJsonEventStream's per-chunk result type (@ai-sdk/provider-utils'
// `ParseResult<T>`) isn't exported from "ai" under a name we can import
// directly, and this app does not depend on @ai-sdk/provider-utils itself
// (only transitively, through "ai"), so its shape is reproduced here by
// hand instead. `ReturnType<typeof parseJsonEventStream>` was tried first
// but a generic function's ReturnType resolves against its unconstrained
// type parameter (not this call site's `schema: uiMessageChunkSchema`),
// which collapsed `value` to `unknown`.
type ParsedEvent = { success: true; value: UIMessageChunk; rawValue: unknown } | { success: false; error: unknown; rawValue: unknown };

/** Turns the raw byte body of a `toUIMessageStreamResponse()` Response back
 *  into a `ReadableStream<UIMessageChunk>`, the input `readUIMessageStream`
 *  expects. `parseJsonEventStream` yields `{ success, value | error }`
 *  parse results, not the chunks themselves, so this unwraps them. */
export function sseBodyToUIMessageChunkStream(body: ReadableStream<Uint8Array>): ReadableStream<UIMessageChunk> {
  const parsed = parseJsonEventStream({ stream: body, schema: uiMessageChunkSchema });
  return parsed.pipeThrough(
    new TransformStream<ParsedEvent, UIMessageChunk>({
      transform(result, controller) {
        if (result.success) controller.enqueue(result.value);
        // A malformed chunk is dropped rather than thrown: one bad SSE line
        // shouldn't take down the whole eval run. readUIMessageStream still
        // sees an incomplete message, which the rubric will catch (e.g. an
        // empty/partial draft failing SocietyDraftSchema).
      },
    }),
  );
}

/** Consumes a `toUIMessageStreamResponse()` Response, returning the final
 *  UIMessage(s) it streamed. In practice this is exactly one assistant
 *  message per turn (growing in place as parts complete), but this stays
 *  generic and merges by id. */
export async function readFinalUIMessages(res: Response): Promise<MinimalUIMessage[]> {
  if (!res.body) return [];
  const out: MinimalUIMessage[] = [];
  for await (const message of readUIMessageStream({ stream: sseBodyToUIMessageChunkStream(res.body) })) {
    const idx = out.findIndex((m) => m.id === message.id);
    const minimal = message as unknown as MinimalUIMessage;
    if (idx >= 0) out[idx] = minimal;
    else out.push(minimal);
  }
  return out;
}

// ── Live-mode orchestration (real model calls; never run by CI/typecheck) ─

async function mintAccountToken(): Promise<string> {
  const created = await createAccount();
  if (!created) throw new Error("could_not_create_eval_account");
  return created.token;
}

function agentRequest(token: string, messages: MinimalUIMessage[]): Request {
  return new Request("https://eval.local/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-studio-token": token },
    body: JSON.stringify({ messages }),
  });
}

/** One coach turn: POST the current transcript to the real route handler,
 *  read back the streamed reply, and merge it into the transcript by id. */
async function stepAssistantTurn(token: string, messages: MinimalUIMessage[]): Promise<MinimalUIMessage[]> {
  const res = await POST(agentRequest(token, messages));
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`agent_route_failed:${res.status}:${body.slice(0, 300)}`);
  }
  const replies = await readFinalUIMessages(res);
  const merged = [...messages];
  for (const message of replies) {
    const idx = merged.findIndex((m) => m.id === message.id);
    if (idx >= 0) merged[idx] = message;
    else merged.push(message);
  }
  return merged;
}

function toJourneyResult(persona: Persona, messages: MinimalUIMessage[], turns: number, error?: string): JourneyResult {
  const previewCallCount = collectToolParts(messages).filter((m) => m.name === "preview_society").length;
  const previewOutput = latestToolOutput(messages, "preview_society") as { draft?: unknown } | undefined;
  return {
    id: persona.id,
    messages,
    previewCallCount,
    draft: previewOutput?.draft,
    turns,
    ...(error ? { error } : {}),
  };
}

/**
 * Drives the full journey for one persona: opening message, then up to
 * MAX_ASSISTANT_TURNS assistant replies, with a cheap model (the "build"
 * tier, see src/lib/models.ts) playing the persona's follow-ups in between,
 * seeded by `persona.followUps`. Real model calls: live mode only.
 */
export async function runJourney(persona: Persona): Promise<JourneyResult> {
  const token = await mintAccountToken();
  let messages = buildInitialMessages(persona);
  let turns = 0;

  try {
    messages = await stepAssistantTurn(token, messages);
    turns++;

    for (const hint of persona.followUps) {
      if (turns >= MAX_ASSISTANT_TURNS) break;
      const actor = resolveModel("build") ?? resolveModel("coach") ?? resolveModel("fallback");
      if (!actor) break; // no model configured for the persona actor: stop early, report what we have

      const { system, prompt } = buildPersonaTurnPrompt(
        persona.description,
        persona.expectations.language,
        hint,
        lastAssistantText(messages),
      );
      const { text } = await generateText({ model: actor.model, system, prompt, temperature: 0.4 });
      messages = appendUserTurn(messages, text.trim() || hint);
      messages = await stepAssistantTurn(token, messages);
      turns++;
    }
  } catch (e) {
    return toJourneyResult(persona, messages, turns, e instanceof Error ? e.message : String(e));
  }

  return toJourneyResult(persona, messages, turns);
}
