/**
 * `withLocalAudit` -- the ONE wrapper that makes every tool call in the
 * agent loop (`lib/agent.ts`) append to the local signed audit log
 * (`./audit-log`). ROADMAP.md M3-4 / M3-5.
 *
 * Applied centrally via `applyToAllTools` in `buildTools()`, not copy
 * -pasted per tool: every tool -- read or mutating, always-on or
 * client-gated, approved or refused -- gets audited the same way. Runs
 * OUTSIDE `enforceRiskPolicy`'s own middleware (kill-switch + HITL
 * approval), so a refused or halted call is audited too (`errored: true`),
 * not just a successfully executed one -- an attempted money/fiscal/legal
 * act a human denied is exactly the kind of thing an operating history
 * should show.
 *
 * The audit write is best-effort by construction (`appendLocalAudit` never
 * throws), and this wrapper adds a second layer of defense (`try`/`catch`
 * around the append, not just inside it) so a bug in redaction/signing can
 * never surface as a failure of the tool call itself, nor shadow the tool's
 * own thrown error.
 */

import type { AnyTool, ToolMiddleware } from "@ar-agents/core";
import { classifyTool, isArAgentsError } from "@ar-agents/core";
import { appendLocalAudit } from "./audit-log";
import { writeToSink } from "./audit-sink";

export interface WithLocalAuditOptions {
  /** Same hook passed to `enforceRiskPolicy`, so the governance
   *  classification recorded here matches the one that gated the call. */
  sideEffectsFor?: (toolName: string) => string | undefined;
}

/** The one tool this app names specially: its own decision is the summary
 *  (see `./decision-tool`), not a generic "ran/failed" line -- recording
 *  the decision text IS the point of the audit entry. */
const DECISION_TOOL_NAME = "registrar_decision";

function extractString(value: unknown, field: string): string | null {
  if (!value || typeof value !== "object") return null;
  const v = (value as Record<string, unknown>)[field];
  return typeof v === "string" ? v : null;
}

function extractBoolean(value: unknown, field: string): boolean | null {
  if (!value || typeof value !== "object") return null;
  const v = (value as Record<string, unknown>)[field];
  return typeof v === "boolean" ? v : null;
}

function summarizeSuccess(toolName: string, args: unknown, result: unknown): string {
  if (toolName === DECISION_TOOL_NAME) {
    const decision = extractString(args, "decision");
    if (decision) return decision;
  }
  // Most @ar-agents/* tools return `{ available: boolean, error?, data? }`
  // when a required client isn't configured or an upstream call failed
  // gracefully; surface that (diagnostic, not sensitive) without touching
  // the rest of the payload.
  const available = extractBoolean(result, "available");
  if (available === false) {
    return `${toolName}: no disponible (configuración faltante o error del proveedor).`;
  }
  return `${toolName}: acción ejecutada.`;
}

function summarizeFailure(toolName: string, err: unknown): string {
  const code = isArAgentsError(err) ? err.code : "error";
  return `${toolName}: falló (${code}).`;
}

/**
 * Wrap a tool's `execute` so every call -- success, tool-level failure, or
 * a refusal thrown by an inner `enforceRiskPolicy` middleware -- appends
 * one entry to the local audit log. Governance is computed once at wrap
 * time via the same `classifyTool` the risk manifest uses, from the
 * tool's own name/description plus the optional `sideEffectsFor` hook.
 */
export function withLocalAudit(toolName: string, opts: WithLocalAuditOptions = {}): ToolMiddleware {
  return <T extends AnyTool>(tool: T): T => {
    const original = tool.execute as
      | ((args: unknown, ctx: unknown) => Promise<unknown> | unknown)
      | undefined;
    if (typeof original !== "function") return tool;
    const governance = classifyTool({
      name: toolName,
      description: typeof tool.description === "string" ? tool.description : undefined,
      sideEffects: opts.sideEffectsFor?.(toolName),
    });
    const wrapped = {
      ...tool,
      execute: async (args: unknown, ctx: unknown) => {
        let errored = false;
        let summary = "";
        try {
          const result = await original(args, ctx);
          summary = summarizeSuccess(toolName, args, result);
          return result;
        } catch (err) {
          errored = true;
          summary = summarizeFailure(toolName, err);
          throw err;
        } finally {
          try {
            // appendLocalAudit ALWAYS returns the constructed, signed entry
            // (even when local storage failed), so the dual-write below
            // forwards the exact same id/ts/hmac regardless of whether the
            // local copy landed.
            const entry = await appendLocalAudit({ tool: toolName, governance, errored, summary });
            // ROADMAP.md M3-6: best-effort second copy in ar-agents.ar's
            // per-society durable sink, isolated by this deploy's own
            // SOCIETY_GATE_TOKEN (see ./audit-sink). Never throws; a
            // failure here must never break (or shadow the error of) the
            // tool call it's recording, same contract as the local write.
            await writeToSink(entry);
          } catch {
            // Belt-and-suspenders: appendLocalAudit and writeToSink already
            // never throw. The audit trail must never break (or shadow the
            // error of) the tool call it's recording.
          }
        }
      },
    } as T;
    return wrapped;
  };
}
