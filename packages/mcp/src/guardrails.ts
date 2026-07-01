// Guardrails for the public MCP server: spending caps + amount-aware approval,
// and a kill-switch wired to the ar-agents registry good-standing state.
//
// These EXTEND the art. 102 gate (governance.ts). The art. 102 gate answers
// "does this act need a human?"; guardrails answer "how much, and is this entity
// still allowed to operate at all?".
//
// AMOUNT-AWARE APPROVAL (opt-in): with NO caps configured the fail-closed default
// is unchanged (every money tool needs the approve hook). With caps configured, a
// money tool whose amount is WITHIN the per-op + daily limits AUTO-APPROVES (so an
// autonomous entity can make small payments without a human on each one); an
// amount OVER the caps (or one we cannot read) falls back to the human approve
// hook. This never LOOSENS a non-money act and never runs when caps are absent.

import { classifyTool } from "@ar-agents/core";
import type { HaltHook } from "./governance";

export interface SpendingCaps {
  /** Max amount for a SINGLE money tool call. Undefined = no per-op cap. */
  perOpMax?: number;
  /** Max cumulative amount per UTC day. Undefined = no daily cap. */
  dailyMax?: number;
  /** Currency label (single-currency v1; used to bucket the daily tally). */
  currency?: string;
  /**
   * Operator-supplied, TOOL-AWARE amount reader. REQUIRED for amount-based
   * auto-approval: it must return the TRUE charge a money tool will move (e.g. for
   * MercadoPago `create_payment` -> args.amount_ars; for a payment preference ->
   * sum(items[].unit_price * quantity)). Return null whenever unsure.
   *
   * Without this, money tools NEVER auto-approve (they fall to the human approve
   * hook). We deliberately do NOT guess the amount from generic arg keys: a caller
   * can add a small decoy `amount` key (which the tool's schema strips before
   * execution) to auto-approve a large real charge, and generic keys miss the real
   * fields (amount_ars, items[].unit_price) entirely.
   */
  extractAmount?: (toolName: string, args: unknown) => number | null;
}

/** Pluggable running spend store (default: in-memory, per-process, resets by UTC day). */
export interface SpendingTally {
  spentToday(currency: string): number;
  add(currency: string, amount: number): void;
}

/** In-memory daily tally. Keyed by `${utcDay}:${currency}`; older days are inert. */
export function inMemoryTally(): SpendingTally {
  const store = new Map<string, number>();
  const key = (currency: string) => `${new Date().toISOString().slice(0, 10)}:${currency}`;
  return {
    spentToday: (currency) => store.get(key(currency)) ?? 0,
    add: (currency, amount) => store.set(key(currency), (store.get(key(currency)) ?? 0) + amount),
  };
}

// NOTE: there is deliberately NO built-in generic amount extractor. Reading a
// money amount from generic arg keys is UNSAFE: (1) a caller can add a small decoy
// `amount` key that the tool's Zod schema strips before execution, auto-approving
// a large real charge; (2) generic keys miss the real fields the bundled tools use
// (amount_ars, items[].unit_price); (3) first-match ordering can under-read.
// Amount-based auto-approval therefore REQUIRES an operator-supplied, tool-aware
// `caps.extractAmount`; absent that (or on ANY doubt) money tools go to the human.

export type SpendingDecision =
  | { kind: "not_applicable" } // not a money tool, or no caps configured
  | { kind: "within_caps"; amount: number } // auto-approve (recorded)
  | { kind: "over_caps"; reason: string; amount: number | null }; // -> human approval

/**
 * Decide the spending guardrail for one tool call. Records the spend on the tally
 * ONLY when it auto-approves (within caps). Non-money tools + absent caps return
 * `not_applicable` so the caller falls through to the art. 102 gate unchanged.
 */
export function decideSpending(
  input: { toolName: string; description?: string | undefined; sideEffects?: string | undefined; args: unknown },
  caps: SpendingCaps | undefined,
  tally: SpendingTally,
): SpendingDecision {
  if (!caps) return { kind: "not_applicable" };
  const level = classifyTool({ name: input.toolName, description: input.description, sideEffects: input.sideEffects });
  if (level !== "money") return { kind: "not_applicable" };

  const currency = caps.currency ?? "ARS";

  // FAIL-SAFE 1: a caps object with NO numeric limit set must NEVER auto-approve
  // (that would silently disable the fail-closed money gate). Require a human.
  if (caps.perOpMax === undefined && caps.dailyMax === undefined) {
    return { kind: "over_caps", reason: "caps configured but no per-op/daily limit set; human approval required", amount: null };
  }

  // FAIL-SAFE 2: amount-based auto-approval requires an operator-supplied,
  // tool-aware reader. We NEVER guess the amount from generic keys. No reader -> human.
  if (!caps.extractAmount) {
    return { kind: "over_caps", reason: "no caps.extractAmount configured; cannot confirm the amount safely, human approval required", amount: null };
  }

  let amount: number | null;
  try {
    amount = caps.extractAmount(input.toolName, input.args);
  } catch {
    return { kind: "over_caps", reason: "amount extractor threw; human approval required", amount: null };
  }

  // FAIL-SAFE 3: any doubt about the amount -> human. Only a single, finite,
  // non-negative number within the limits auto-approves.
  if (amount === null || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return {
      kind: "over_caps",
      reason: "amount not confidently readable; human approval required",
      amount: typeof amount === "number" && Number.isFinite(amount) ? amount : null,
    };
  }
  if (caps.perOpMax !== undefined && amount > caps.perOpMax) {
    return { kind: "over_caps", reason: `amount ${amount} exceeds per-op cap ${caps.perOpMax} ${currency}`, amount };
  }
  if (caps.dailyMax !== undefined && tally.spentToday(currency) + amount > caps.dailyMax) {
    return {
      kind: "over_caps",
      reason: `amount ${amount} would exceed the daily cap ${caps.dailyMax} ${currency} (spent ${tally.spentToday(currency)})`,
      amount,
    };
  }
  tally.add(currency, amount);
  return { kind: "within_caps", amount };
}

/**
 * A kill-switch (HaltHook) wired to the ar-agents registry good-standing state.
 * Wire it as `createServer({ governance: { isHalted: goodStandingHalt({ entityId }) } })`
 * and the registry can REMOTELY halt this entity: once it is `suspended`/`revoked`
 * in the registry, every tool refuses. Best-effort: a transient oracle error does
 * NOT halt by default (set haltOnUnreachable:true for a stricter fail-closed posture).
 */
export function goodStandingHalt(opts: {
  entityId?: string;
  entityUrl?: string;
  oracleBase?: string;
  haltOnUnreachable?: boolean;
  timeoutMs?: number;
}): HaltHook {
  const base = (opts.oracleBase ?? "https://ar-agents.ar").replace(/\/+$/, "");
  return async () => {
    if (!opts.entityId && !opts.entityUrl) return false;
    const q = opts.entityId
      ? `id=${encodeURIComponent(opts.entityId)}`
      : `url=${encodeURIComponent(opts.entityUrl!)}`;
    try {
      const r = await fetch(`${base}/api/registry/good-standing?${q}`, {
        signal: AbortSignal.timeout(opts.timeoutMs ?? 4000),
        headers: { "user-agent": "ar-agents-mcp-killswitch" },
      });
      if (!r.ok) return opts.haltOnUnreachable ?? false;
      const d = (await r.json()) as { body?: { goodStanding?: { state?: string } } };
      const state = d.body?.goodStanding?.state;
      return state === "suspended" || state === "revoked";
    } catch {
      return opts.haltOnUnreachable ?? false;
    }
  };
}
