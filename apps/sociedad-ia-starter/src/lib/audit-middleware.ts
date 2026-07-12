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
 *
 * ROADMAP.md M2-4c adds one more optional layer: a per-tool `moneySummarizer`
 * registry. The generic `summarizeSuccess`/`summarizeFailure` below produce a
 * fine but generic line ("accion ejecutada" / "fallo (code)"); a money-moving
 * tool (wallet-cdp's `wallet_transfer_usdc`, treasury's
 * `treasury_offramp_convert`) can instead map its own args/result/thrown-error
 * into `@ar-agents/treasury`'s common `MoneyAuditEvent` and get a richer,
 * structured summary via `formatMoneyAuditSummary` -- see
 * `./money-audit-summarizers.ts` for the concrete mappings, wired in here by
 * `./agent.ts`. A tool with no entry in the registry (or whose summarizer
 * returns null for THIS call, e.g. the generic "no disponible" case) falls
 * through to the existing generic summaries unchanged.
 */

import type { AnyTool, ToolMiddleware } from "@ar-agents/core";
import { classifyTool, isArAgentsError } from "@ar-agents/core";
import { formatMoneyAuditSummary, type MoneyAuditEvent } from "@ar-agents/treasury";
import { appendLocalAudit } from "./audit-log";
import { writeToSink } from "./audit-sink";

/**
 * Maps ONE money-moving tool's own args/result (success path) or args/thrown
 * error (failure path) into the common `MoneyAuditEvent` schema. Returns null
 * to defer to the generic summary -- e.g. the tool's own "not configured"
 * shape, or an error that isn't a money-outcome (a plain validation bug
 * should still read as a generic failure, not a fabricated "denied"/"failed"
 * money event).
 */
export interface MoneySummarizer {
  onSuccess?: (args: unknown, result: unknown) => MoneyAuditEvent | null;
  onError?: (args: unknown, err: unknown) => MoneyAuditEvent | null;
}

/** Tool name -> its money summarizer. See `./money-audit-summarizers.ts`. */
export type MoneySummarizerRegistry = Record<string, MoneySummarizer>;

export interface WithLocalAuditOptions {
  /** Same hook passed to `enforceRiskPolicy`, so the governance
   *  classification recorded here matches the one that gated the call. */
  sideEffectsFor?: (toolName: string) => string | undefined;
  /** ROADMAP.md M2-4c: optional per-tool structured money-audit summarizers.
   *  Keyed by tool name; a tool absent from the map (or whose summarizer
   *  returns null) gets the existing generic summary. */
  moneySummarizers?: MoneySummarizerRegistry;
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

function summarizeSuccess(
  toolName: string,
  args: unknown,
  result: unknown,
  moneySummarizer?: MoneySummarizer,
): string {
  if (toolName === DECISION_TOOL_NAME) {
    const decision = extractString(args, "decision");
    if (decision) return decision;
  }
  // ROADMAP.md M2-4c: a money-moving tool with a registered summarizer gets a
  // structured summary instead of the generic lines below. `onSuccess`
  // returning null (not registered for this tool, or this particular result
  // shape isn't a money outcome -- e.g. the tool's own "not configured" case)
  // falls through to the generic handling unchanged.
  const event = moneySummarizer?.onSuccess?.(args, result);
  if (event) return formatMoneyAuditSummary(event);
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

function summarizeFailure(toolName: string, args: unknown, err: unknown, moneySummarizer?: MoneySummarizer): string {
  const event = moneySummarizer?.onError?.(args, err);
  if (event) return formatMoneyAuditSummary(event);
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
    const moneySummarizer = opts.moneySummarizers?.[toolName];
    const wrapped = {
      ...tool,
      execute: async (args: unknown, ctx: unknown) => {
        let errored = false;
        let summary = "";
        try {
          const result = await original(args, ctx);
          summary = summarizeSuccess(toolName, args, result, moneySummarizer);
          return result;
        } catch (err) {
          errored = true;
          summary = summarizeFailure(toolName, args, err, moneySummarizer);
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
