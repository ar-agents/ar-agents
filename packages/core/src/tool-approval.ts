// AI SDK 7 native tool-approval, driven by the SAME risk manifest as
// `enforceRiskPolicy` (see ./risk-manifest). This is the agent-loop counterpart
// to the middleware gate: pass it as the `toolApproval` setting on a v7
// generateText / streamText / Agent call, paired with
// `experimental_toolApprovalSecret` so the SDK HMAC-signs each approval request
// and rejects forged/replayed approvals (InvalidToolApprovalSignatureError).
//
// Why both this AND enforceRiskPolicy exist:
//   - enforceRiskPolicy wraps tool `execute` with middleware — it protects EVERY
//     transport, including a third party calling the public MCP server, where no
//     agent-loop `toolApproval` setting is in play. It stays the universal gate.
//   - toolApprovalFromRisk is the agent-loop-native path: it lets the AI SDK 7
//     runtime emit a cryptographically-signed approval request and pause, instead
//     of the tool's execute returning a refusal. Use it when the host implements
//     the v7 approval lifecycle (e.g. a WorkflowAgent with durable, resumable
//     approvals). The classification law is identical, so the two never disagree.
//
// Same invariant as the manifest: money / fiscal / legal / irreversible / unknown
// require approval; read / create proceed. Unknown FAILS CLOSED ('user-approval').

import {
  classifyTool,
  levelRequiresApproval,
  type ToolRiskInput,
} from "./risk-manifest";

/**
 * The subset of the AI SDK 7 `toolApproval` generic-function argument this
 * helper reads. Declared structurally so `@ar-agents/core` does not depend on
 * `ai` at the type level; the returned function is assignable to the SDK's
 * `ToolApprovalConfiguration` generic-function form.
 */
export interface ToolApprovalCallInfo {
  toolCall: { toolName: string; input?: unknown };
}

/**
 * The AI SDK 7 approval statuses this helper returns. `'user-approval'` defers
 * to a human; `'not-applicable'` lets the tool run without approval. (The SDK
 * also accepts `'approved'` / `'denied'`; we never auto-approve or auto-deny a
 * classified-risky tool here — that decision belongs to the human gate.)
 */
export type RiskToolApprovalStatus = "user-approval" | "not-applicable";

export interface ToolApprovalFromRiskOptions {
  /** Supply a tool's manifest `sideEffects` by name to sharpen classification. */
  sideEffectsFor?: (toolName: string) => string | undefined;
  /**
   * Supply a tool's description by name so the `**IRREVERSIBLE**` flag is seen.
   * Optional: when the tools are passed to the SDK they carry their own
   * descriptions, but the approval callback only receives the tool NAME, so the
   * host can thread descriptions through here for parity with enforceRiskPolicy.
   */
  descriptionFor?: (toolName: string) => string | undefined;
}

/**
 * Build an AI SDK 7 `toolApproval` generic function from the risk manifest.
 *
 * @example
 * ```ts
 * import { toolApprovalFromRisk } from "@ar-agents/core";
 * const result = await agent.generate({
 *   prompt,
 *   toolApproval: toolApprovalFromRisk({ sideEffectsFor }),
 *   experimental_toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET, // HMAC-signs requests
 * });
 * ```
 */
export function toolApprovalFromRisk(
  opts: ToolApprovalFromRiskOptions = {},
): (info: ToolApprovalCallInfo) => RiskToolApprovalStatus {
  return (info) => {
    const name = info.toolCall.toolName;
    const input: ToolRiskInput = {
      name,
      description: opts.descriptionFor?.(name),
      sideEffects: opts.sideEffectsFor?.(name),
    };
    return levelRequiresApproval(classifyTool(input))
      ? "user-approval"
      : "not-applicable";
  };
}
