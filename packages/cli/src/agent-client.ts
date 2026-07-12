// Client for the studio's `/api/agent` contract (see
// apps/studio/src/app/api/agent/route.ts and docs/CONTRACT.md): posts the
// message history, streams back the AI SDK v7 UI-message response, and
// forwards text deltas + tool activity to the caller as they arrive.
// Fetch-agnostic and fully offline-testable, mirroring account-client.ts.

import { readAgentStream } from "./stream.js";
import { toolPart, type ToolPart, type UiMessage } from "./messages.js";

export class AgentClientError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AgentClientError";
    if (status !== undefined) {
      this.status = status;
    }
  }
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** POST {baseUrl}/api/agent with `x-studio-token`: sends the running message
 *  history, streams the reply. `onText`/`onTool` fire incrementally as the
 *  stream is read; the returned `{ text, error, toolParts }` is the final
 *  accumulation, where `toolParts` is every completed tool call from this
 *  turn in the persisted dynamic-tool shape (see ./messages.ts), ready to be
 *  folded into the next turn's history. */
export async function sendAgentTurn(opts: {
  baseUrl: string;
  token: string;
  messages: UiMessage[];
  fetchImpl?: typeof fetch;
  onText?: (delta: string) => void;
  onTool?: (name: string | null, output: unknown) => void;
}): Promise<{ text: string; error: string | null; toolParts: ToolPart[] }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${trimTrailingSlash(opts.baseUrl)}/api/agent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-studio-token": opts.token,
    },
    body: JSON.stringify({ messages: opts.messages }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    const detail = typeof data?.error === "string" ? data.error : undefined;
    throw new AgentClientError(
      detail ? `agent_request_failed:${res.status}:${detail}` : `agent_request_failed:${res.status}`,
      res.status,
    );
  }

  // Pending tool calls, keyed by toolCallId, filled in as `tool-input`
  // events arrive and consumed once the matching `tool-output` lands. A
  // call whose output never arrives (stream cut short) is simply never
  // turned into a ToolPart: only fully resolved calls are worth persisting.
  const pending = new Map<string, { toolName: string; input: unknown }>();
  const toolParts: ToolPart[] = [];

  const result = await readAgentStream({
    body: res.body,
    onEvent: (event) => {
      if (event.kind === "text") opts.onText?.(event.delta);
      if (event.kind === "tool-input") {
        pending.set(event.toolCallId, { toolName: event.toolName, input: event.input });
      }
      if (event.kind === "tool-output") {
        opts.onTool?.(event.toolName, event.output);
        const meta = pending.get(event.toolCallId);
        const toolName = event.toolName ?? meta?.toolName ?? "unknown";
        toolParts.push(toolPart(toolName, event.toolCallId, meta?.input, event.output));
      }
    },
  });

  return { ...result, toolParts };
}
