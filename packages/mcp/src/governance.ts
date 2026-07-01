// art. 102 governance gate for the public MCP server.
//
// Why this exists: the @ar-agents/mcp server is published to npm and launched by
// `npx` inside any MCP host (Claude Desktop, Cursor, …). The host's model can
// call ANY registered tool — including ones that move real money (Mercado Pago),
// file real taxes (AFIP/ARCA) or constitute a real company (IGJ). The Sociedad
// Automatizada regime (art. 102) makes a human administrator responsible and
// bars delegating that supervision. So those acts MUST pass through a human.
//
// The @ar-agents/core risk manifest already decides WHICH tools are dangerous
// (`classifyTool` + `levelRequiresApproval`). This module is the thin MCP-side
// policy that turns that classification into a CallTool decision, default-ON,
// fail-closed. It reuses core's exports verbatim — it never re-implements the
// classifier.

import {
  classifyTool,
  levelRequiresApproval,
  type RiskLevel,
} from "@ar-agents/core";
import {
  decideSpending,
  inMemoryTally,
  type SpendingCaps,
  type SpendingTally,
} from "./guardrails";

/**
 * HITL approval hook. Called BEFORE an approval-level tool runs. Return true to
 * proceed; false (or throw) refuses. This is where the operator asks the human
 * administrator, consults a policy engine, or checks an approval token.
 */
export type ApproveHook = (
  toolName: string,
  args: unknown,
) => Promise<boolean> | boolean;

/**
 * Kill-switch hook. When it returns true, EVERY tool refuses (the society is
 * suspended), regardless of risk level. art. 102 supervision made operational.
 */
export type HaltHook = (
  toolName: string,
  args: unknown,
) => Promise<boolean> | boolean;

/**
 * Optional governance configuration passed to {@link createServer}. Every field
 * is optional: with NOTHING supplied the server is still default-ON and
 * fail-closed (see {@link resolveGovernance}), so a vanilla `npx` server refuses
 * money/fiscal/legal/irreversible/unknown tools.
 */
export interface GovernanceOptions {
  /**
   * Force enforce on/off, overriding the `AR_AGENTS_MCP_ENFORCE` env var and the
   * default. `true` = gate on, `false` = ungated passthrough. Leave undefined to
   * resolve from env, then default-ON.
   */
  enforce?: boolean;
  /**
   * HITL hook for approval-level tools. When enforce is on and no hook is
   * supplied, the default decision is DENY (fail closed).
   */
  approve?: ApproveHook;
  /**
   * Kill-switch. Overrides the `AR_AGENTS_MCP_HALT` env var. When it resolves to
   * a halt, ALL tools refuse with `society_suspended`. Default: no halt. See
   * `goodStandingHalt` to wire this to the ar-agents registry state.
   */
  isHalted?: HaltHook;
  /**
   * Spending guardrail (opt-in). With caps set, a MONEY tool within the per-op +
   * daily limits AUTO-APPROVES; over the caps it falls back to the approve hook.
   * Absent = the unchanged fail-closed default (every money tool needs approval).
   */
  caps?: SpendingCaps;
  /** Pluggable daily-spend tally (default: in-memory per-process). */
  tally?: SpendingTally;
}

/** Fully-resolved governance state used at CallTool time. */
export interface ResolvedGovernance {
  /** Whether the art. 102 risk gate is active. */
  enforce: boolean;
  /** The HITL approval hook, if the operator wired one. */
  approve?: ApproveHook | undefined;
  /** The kill-switch hook, if any (env or option). */
  isHalted?: HaltHook | undefined;
  /** True when enforce is on but NO approve hook was supplied (fail-closed deny). */
  failClosed: boolean;
  /** Spending caps, if configured (opt-in amount-aware approval). */
  caps?: SpendingCaps | undefined;
  /** Running daily-spend tally (always present; consulted only when caps are set). */
  tally: SpendingTally;
}

function envFlagOn(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "" ) return undefined;
  if (["off", "0", "false", "no", "disable", "disabled"].includes(v)) return false;
  if (["on", "1", "true", "yes", "enable", "enabled"].includes(v)) return true;
  // Any other non-empty value: treat as "on" (fail safe — never silently off).
  return true;
}

/**
 * Resolve the effective governance state. Resolution order, per the art. 102
 * invariant:
 *   enforce: explicit option  >  AR_AGENTS_MCP_ENFORCE env  >  default ON
 *   halt:    explicit isHalted >  AR_AGENTS_MCP_HALT=1 env   >  default no-halt
 *
 * Default-ON is the whole point: a self-hoster who sets nothing still gets the
 * gate. `AR_AGENTS_MCP_ENFORCE=off` is the documented opt-out.
 */
export function resolveGovernance(
  opts: GovernanceOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedGovernance {
  const enforce =
    opts.enforce ?? envFlagOn(env.AR_AGENTS_MCP_ENFORCE) ?? true;

  // Halt: an explicit hook wins; otherwise the env flag becomes a constant hook.
  let isHalted: HaltHook | undefined = opts.isHalted;
  if (!isHalted && envFlagOn(env.AR_AGENTS_MCP_HALT) === true) {
    isHalted = () => true;
  }

  const failClosed = enforce && !opts.approve;

  return {
    enforce,
    approve: opts.approve,
    isHalted,
    failClosed,
    caps: opts.caps,
    tally: opts.tally ?? inMemoryTally(),
  };
}

/** A CallTool decision produced by {@link decideGovernance}. */
export type GovernanceDecision =
  | { kind: "allow" }
  | { kind: "halted"; message: string }
  | { kind: "deny"; level: RiskLevel; reason: "fail_closed" | "approve_refused"; message: string };

/**
 * Decide whether a tool call may proceed, given the resolved governance and the
 * tool's name + description (+ optional `sideEffects`). READ-level tools always
 * pass. The kill-switch is checked first (suspends EVERYTHING). Then the art.
 * 102 risk gate:
 *   - approval-level tool + no approve hook  -> DENY (fail closed)
 *   - approval-level tool + approve hook      -> ask it; refuse on false/throw
 *
 * Classification is delegated entirely to @ar-agents/core `classifyTool`. The
 * `sideEffects` arg is passed through so core's layer-3 (sideEffects: "moves
 * money"/"irreversible" -> approval-level) is LIVE here — parity with the local
 * `enforceRiskPolicy` path. Without it, a future read-ish-named tool carrying a
 * money/irreversible sideEffect would be downgraded to read and ALLOWED (a
 * latent fail-OPEN).
 */
export async function decideGovernance(
  gov: ResolvedGovernance,
  toolName: string,
  description: string | undefined,
  args: unknown,
  sideEffects?: string | undefined,
): Promise<GovernanceDecision> {
  // Kill-switch is checked even when enforce is off: an operator who wired a
  // halt (env or hook) means "suspend the society", full stop.
  if (gov.isHalted) {
    let halted = false;
    try {
      halted = await gov.isHalted(toolName, args);
    } catch {
      // Fail closed: a throwing kill-switch halts.
      halted = true;
    }
    if (halted) {
      return {
        kind: "halted",
        message:
          `society_suspended: this autonomous company is halted (art. 102 kill-switch). ` +
          `Tool "${toolName}" was refused. Clear AR_AGENTS_MCP_HALT or the isHalted hook to resume.`,
      };
    }
  }

  // Ungated passthrough when enforce is off.
  if (!gov.enforce) return { kind: "allow" };

  const level = classifyTool({ name: toolName, description, sideEffects });
  if (!levelRequiresApproval(level)) {
    // read / create -> always pass.
    return { kind: "allow" };
  }

  // Spending guardrail (amount-aware, opt-in). Only affects MONEY tools when caps
  // are configured: WITHIN caps -> auto-approve (spend recorded on the tally);
  // OVER caps (or an unreadable amount) -> fall through to the human approve hook
  // below. Non-money tools / no caps -> no effect (not_applicable).
  const spend = decideSpending({ toolName, description, sideEffects, args }, gov.caps, gov.tally);
  if (spend.kind === "within_caps") {
    return { kind: "allow" };
  }
  const capNote = spend.kind === "over_caps" ? ` Spending guardrail: ${spend.reason}.` : "";

  // Approval-level tool. Fail closed when no human-approval hook is wired.
  if (!gov.approve) {
    return {
      kind: "deny",
      level,
      reason: "fail_closed",
      message:
        `Tool "${toolName}" needs human approval (art. 102): ${level} risk.${capNote} ` +
        `This @ar-agents/mcp server enforces the art. 102 governance gate by default. ` +
        `No approval hook is wired, so money/fiscal/legal/irreversible/unknown tools are refused. ` +
        `Either wire an approve hook via createServer({ governance: { approve } }), ` +
        `or set AR_AGENTS_MCP_ENFORCE=off to run ungated (NOT recommended for autonomous money/fiscal/legal acts).`,
    };
  }

  let approved = false;
  try {
    approved = await gov.approve(toolName, args);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return {
      kind: "deny",
      level,
      reason: "approve_refused",
      message: `Tool "${toolName}" refused by approval hook (art. 102, ${level} risk): ${why}`,
    };
  }
  if (!approved) {
    return {
      kind: "deny",
      level,
      reason: "approve_refused",
      message: `Tool "${toolName}" was not approved by the human administrator (art. 102, ${level} risk).`,
    };
  }
  return { kind: "allow" };
}

/** One-line, stderr-friendly summary of the governance mode at boot. */
export function describeGovernance(gov: ResolvedGovernance): string {
  if (!gov.enforce) {
    const halt = gov.isHalted ? " · HALT active (all tools refuse)" : "";
    return `governance      → enforce=OFF (ungated passthrough · AR_AGENTS_MCP_ENFORCE=off)${halt}`;
  }
  const hook = gov.approve ? "approve hook wired" : "NO approve hook → fail-closed DENY";
  const halt = gov.isHalted ? " · HALT active (all tools refuse)" : "";
  const caps = gov.caps
    ? ` · caps(${gov.caps.perOpMax ?? "none"}/op, ${gov.caps.dailyMax ?? "none"}/day ${gov.caps.currency ?? "ARS"})`
    : "";
  return `governance      → enforce=ON (art. 102 gate · ${hook})${caps}${halt}`;
}
