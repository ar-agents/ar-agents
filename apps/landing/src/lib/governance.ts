/**
 * Runtime enforcement of the ALE charter (Kargieman, "Autonomous Legal Entities").
 *
 * The CHARTER.md DECLARES the governance mechanisms; this module ENFORCES them as
 * pure, deterministic logic the operating agent calls before acting. Pure functions
 * (time is injected, never read) so they are unit-testable and identical to the copy
 * shipped into each generated society by `generateGovernanceTs()` in ./incorporate.
 *
 * Mechanisms: distributed kill-switch (4 triggers), graduated sanctions, tiered
 * arbitration (the L0 automated layer), and the steward council roll-back window.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Kill-switch — 4 independent triggers, ANY one halts (distributed authority).
//    No single point of capture (the paper's "distributed katechon").
// ─────────────────────────────────────────────────────────────────────────────

export type KillSwitchTriggers = {
  /** The society's own monitoring tripped. */
  selfMonitor: boolean;
  /** The steward council pulled the override. */
  stewardOverride: boolean;
  /** The regulator suspended operations. */
  regulatorSuspension: boolean;
  /** The insurer withdrew coverage. */
  insurerWithdrawal: boolean;
};

export type KillSwitchResult = {
  halted: boolean;
  triggeredBy: Array<keyof KillSwitchTriggers>;
};

const KILL_SWITCH_KEYS: Array<keyof KillSwitchTriggers> = [
  "selfMonitor",
  "stewardOverride",
  "regulatorSuspension",
  "insurerWithdrawal",
];

/** Halts if ANY trigger is set. Returns which ones. */
export function evaluateKillSwitch(t: KillSwitchTriggers): KillSwitchResult {
  const triggeredBy = KILL_SWITCH_KEYS.filter((k) => t[k]);
  return { halted: triggeredBy.length > 0, triggeredBy };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Graduated sanctions — an ordered ladder, never a binary punish/don't-punish.
// ─────────────────────────────────────────────────────────────────────────────

export const SANCTION_LADDER = [
  "none",
  "warning",
  "throttle",
  "partial-suspension",
  "full-suspension",
  "kill-switch",
] as const;

export type Sanction = (typeof SANCTION_LADDER)[number];

/** Move one rung up the ladder (clamped at kill-switch). */
export function escalate(current: Sanction): Sanction {
  const i = SANCTION_LADDER.indexOf(current);
  return SANCTION_LADDER[Math.min(i + 1, SANCTION_LADDER.length - 1)];
}

/** Move one rung down the ladder (clamped at none). */
export function deescalate(current: Sanction): Sanction {
  const i = SANCTION_LADDER.indexOf(current);
  return SANCTION_LADDER[Math.max(i - 1, 0)];
}

/**
 * Map an incident severity in [0,1] to the minimum sanction. Monotonic: a higher
 * severity never yields a softer sanction. Only severity >= 1 reaches kill-switch.
 */
export function sanctionForSeverity(severity: number): Sanction {
  const s = Math.max(0, Math.min(1, severity));
  if (s >= 1) return "kill-switch";
  if (s >= 0.8) return "full-suspension";
  if (s >= 0.6) return "partial-suspension";
  if (s >= 0.4) return "throttle";
  if (s >= 0.2) return "warning";
  return "none";
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tiered arbitration — route a claim to its layer; L0 (<USD 50k) auto-resolves
//    by decision-log rules within 48h, else it escalates.
// ─────────────────────────────────────────────────────────────────────────────

export const ARBITRATION = {
  L0_MAX_USD: 50_000,
  L0_DEADLINE_HOURS: 48,
  L1_DEADLINE_HOURS: 30 * 24,
  L2_DEADLINE_HOURS: 90 * 24,
} as const;

export type Claim = {
  amountUsd: number;
  crossJurisdictional?: boolean;
  constitutional?: boolean;
};

export type ArbitrationLayer = 0 | 1 | 2 | 3;

export type ArbitrationRoute = {
  layer: ArbitrationLayer;
  deadlineHours: number | null; // null = standard court timeline (Layer 3)
  automated: boolean;
};

/** Route a claim to its arbitration layer per the charter. */
export function routeClaim(c: Claim): ArbitrationRoute {
  if (c.constitutional) return { layer: 3, deadlineHours: null, automated: false };
  if (c.crossJurisdictional)
    return { layer: 2, deadlineHours: ARBITRATION.L2_DEADLINE_HOURS, automated: false };
  if (c.amountUsd < ARBITRATION.L0_MAX_USD)
    return { layer: 0, deadlineHours: ARBITRATION.L0_DEADLINE_HOURS, automated: true };
  return { layer: 1, deadlineHours: ARBITRATION.L1_DEADLINE_HOURS, automated: false };
}

export type DecisionRule = {
  id: string;
  match: (c: Claim) => boolean;
  resolution: string;
};

export type L0Outcome =
  | { resolved: true; ruleId: string; resolution: string }
  | { resolved: false; escalateTo: ArbitrationLayer };

/**
 * Layer 0 resolver: only for claims that route to L0. Applies the first matching
 * decision-log rule; if none matches, escalates to Layer 1. Pure: no I/O, no clock.
 */
export function resolveL0(c: Claim, rules: DecisionRule[]): L0Outcome {
  if (routeClaim(c).layer !== 0) return { resolved: false, escalateTo: 1 };
  const rule = rules.find((r) => r.match(c));
  return rule
    ? { resolved: true, ruleId: rule.id, resolution: rule.resolution }
    : { resolved: false, escalateTo: 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Steward council — majority-human, with roll-back authority over algorithmic
//    changes within a 72h window.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLLBACK_WINDOW_HOURS = 72;

export type Steward = { id: string; human: boolean };
export type Council = { stewards: Steward[] };

/** The council must be majority human (strictly more than half). */
export function isMajorityHuman(c: Council): boolean {
  if (c.stewards.length === 0) return false;
  const humans = c.stewards.filter((s) => s.human).length;
  return humans * 2 > c.stewards.length;
}

/**
 * A roll-back is valid iff: the actor is a steward, the council is majority-human,
 * and now is within the 72h window after the action (and not before it).
 * Times are epoch ms, injected.
 */
export function canRollback(
  council: Council,
  actorId: string,
  actionAtMs: number,
  nowMs: number,
): boolean {
  const isSteward = council.stewards.some((s) => s.id === actorId);
  if (!isSteward) return false;
  if (!isMajorityHuman(council)) return false;
  const elapsed = nowMs - actionAtMs;
  return elapsed >= 0 && elapsed <= ROLLBACK_WINDOW_HOURS * 3_600_000;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Hard enforcement: gate EVERY tool call by the kill-switch. This is the part
//    that does not depend on the agent obeying an instruction: a wrapped tool's
//    side-effecting `execute` simply never runs while halted.
// ─────────────────────────────────────────────────────────────────────────────

/** Read the 4 kill-switch triggers from env. A steward/regulator/insurer flips one. */
export function loadKillSwitch(
  env: Record<string, string | undefined> = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {},
): KillSwitchTriggers {
  const on = (v: string | undefined) => v === "1" || v === "true";
  return {
    selfMonitor: on(env.AR_KILL_SELF),
    stewardOverride: on(env.AR_KILL_STEWARD),
    regulatorSuspension: on(env.AR_KILL_REGULATOR),
    insurerWithdrawal: on(env.AR_KILL_INSURER),
  };
}

export type BlockedResult = {
  ok: false;
  blocked: true;
  reason: "kill-switch";
  triggeredBy: Array<keyof KillSwitchTriggers>;
  message: string;
};

/**
 * Wrap a tools record so every tool's `execute` is hard-gated by the kill-switch.
 * While any trigger is active the real `execute` never runs; the tool returns a
 * structured blocked result instead. Non-executable entries pass through unchanged.
 * `getTriggers` is injected (defaults to loadKillSwitch) so it is unit-testable.
 */
export function guardTools<T extends Record<string, unknown>>(
  tools: T,
  getTriggers: () => KillSwitchTriggers = loadKillSwitch,
): T {
  const out: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(tools)) {
    const tool = t as { execute?: (...args: unknown[]) => unknown } | null;
    if (tool && typeof tool.execute === "function") {
      const orig = tool.execute.bind(tool);
      out[name] = {
        ...(t as object),
        execute: async (...args: unknown[]): Promise<unknown> => {
          const ks = evaluateKillSwitch(getTriggers());
          if (ks.halted) {
            const blocked: BlockedResult = {
              ok: false,
              blocked: true,
              reason: "kill-switch",
              triggeredBy: ks.triggeredBy,
              message:
                "Acción bloqueada: kill-switch activo (" +
                ks.triggeredBy.join(", ") +
                "). Ver CHARTER.md / RFC-001.",
            };
            return blocked;
          }
          return orig(...args);
        },
      };
    } else {
      out[name] = t;
    }
  }
  return out as T;
}
