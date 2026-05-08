// Stateful evaluator support for `payment.budget` + `payment.agent_recurrence`.
//
// AP2 v0.2 §C requires the verifier to track running spend + occurrence
// counts against an Open Payment Mandate. Phase 2.1 stubbed this with a
// pass-through; Phase 2.2 ships a real in-memory implementation suitable
// for single-process deployments. Distributed deployments should provide
// their own `BudgetTracker` backed by Redis / Postgres / a queue.
//
// Tracker key: a stable digest of the Open Payment Mandate (the verifier's
// `linkedOpenPaymentMandateDigest`). Each authorized presentation of a
// closed payment mandate against that open mandate is recorded.

import type { Frequency } from "./schemas/common";

export interface BudgetTracker {
  inspect(openMandateDigest: string): Promise<TrackerSnapshot>;
  /**
   * Record a successful presentation. Called by the verifier AFTER all
   * non-stateful checks pass and the closed mandate is about to be
   * authorized for execution. Implementations MUST be atomic.
   */
  recordPresentation(args: RecordPresentationArgs): Promise<void>;
  /** Optional: clear all state for a digest (e.g. when the open mandate expires). */
  clear?(openMandateDigest: string): Promise<void>;
}

export interface TrackerSnapshot {
  totalSpentMinor: number;
  occurrences: number;
  /** Last execution as Unix seconds. */
  lastExecutedAt?: number;
}

export interface RecordPresentationArgs {
  openMandateDigest: string;
  amountMinor: number;
  /** ISO 4217 (uppercase). */
  currency: string;
  /** Optional execution time. Default Unix-now-seconds. */
  executedAt?: number;
}

// ---------------------------------------------------------------------------
// Recurrence helpers — used by the constraint evaluator (Phase 2.2 hook).
// ---------------------------------------------------------------------------

const SECONDS = {
  DAILY: 24 * 3600,
  WEEKLY: 7 * 24 * 3600,
  BIWEEKLY: 14 * 24 * 3600,
  MONTHLY: 30 * 24 * 3600, // approximation; AP2 spec doesn't pin exact weeks
  QUARTERLY: 91 * 24 * 3600,
  ANNUALLY: 365 * 24 * 3600,
  ON_DEMAND: 0,
} as const;

/**
 * Returns true if the recurrence interval has elapsed since `lastExecutedAt`.
 * `ON_DEMAND` always passes.
 */
export function isWithinRecurrenceWindow(
  frequency: Frequency,
  lastExecutedAt: number | undefined,
  nowSeconds: number,
): boolean {
  if (frequency === "ON_DEMAND") return true;
  if (lastExecutedAt === undefined) return true;
  const minIntervalSeconds = SECONDS[frequency];
  return nowSeconds - lastExecutedAt >= minIntervalSeconds;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

/**
 * In-memory BudgetTracker. Suitable for single-process tests, dev demos,
 * and small deployments. NOT durable — state is lost on process restart.
 *
 * Production implementations should back this with Redis / Postgres / a
 * queue. The interface is stable so swapping is a one-line change.
 */
export class InMemoryBudgetTracker implements BudgetTracker {
  private state = new Map<string, TrackerSnapshot>();

  async inspect(openMandateDigest: string): Promise<TrackerSnapshot> {
    return this.state.get(openMandateDigest) ?? {
      totalSpentMinor: 0,
      occurrences: 0,
    };
  }

  async recordPresentation(args: RecordPresentationArgs): Promise<void> {
    const prev = this.state.get(args.openMandateDigest) ?? {
      totalSpentMinor: 0,
      occurrences: 0,
    };
    const next: TrackerSnapshot = {
      totalSpentMinor: prev.totalSpentMinor + args.amountMinor,
      occurrences: prev.occurrences + 1,
      lastExecutedAt: args.executedAt ?? Math.floor(Date.now() / 1000),
    };
    this.state.set(args.openMandateDigest, next);
  }

  async clear(openMandateDigest: string): Promise<void> {
    this.state.delete(openMandateDigest);
  }
}

// ---------------------------------------------------------------------------
// Stateful constraint evaluator — used by the verifier when an Open Payment
// Mandate carries `payment.budget` + `payment.agent_recurrence`.
// ---------------------------------------------------------------------------

export interface BudgetEvaluationInput {
  tracker: BudgetTracker;
  openMandateDigest: string;
  /** Closed payment mandate's amount, in minor units. */
  amountMinor: number;
  /** Closed payment mandate's currency, uppercase ISO 4217. */
  currency: string;
  /** From the open mandate's `payment.budget` constraint. Major units. */
  budget: { max: number; currency: string };
  /** From the open mandate's `payment.agent_recurrence` constraint. */
  recurrence?: { frequency: Frequency; max_occurrences: number };
  /** Major-unit divisor for `currency`. Caller computes via `divisorFor`. */
  divisor: number;
  /** Override "now" for tests. */
  nowSeconds?: number;
}

export type BudgetEvaluationResult =
  | { ok: true }
  | {
      ok: false;
      code: "invalid_mandate";
      reason: string;
      details?: Record<string, unknown>;
    };

/**
 * Evaluate a budget + (optional) recurrence constraint against a tracker
 * snapshot. The verifier should call this BEFORE authorizing the payment;
 * if it returns `ok: true`, the verifier then calls
 * `tracker.recordPresentation(...)` to mark the spend.
 *
 * This function is pure — it doesn't mutate the tracker.
 */
export async function evaluateBudgetWithRecurrence(
  input: BudgetEvaluationInput,
): Promise<BudgetEvaluationResult> {
  if (input.budget.currency.toUpperCase() !== input.currency.toUpperCase()) {
    return {
      ok: false,
      code: "invalid_mandate",
      reason: `Budget currency '${input.budget.currency}' does not match payment currency '${input.currency}'`,
    };
  }

  const snap = await input.tracker.inspect(input.openMandateDigest);
  const projectedTotalMinor = snap.totalSpentMinor + input.amountMinor;
  const budgetMaxMinor = Math.round(input.budget.max * input.divisor);
  if (projectedTotalMinor > budgetMaxMinor) {
    return {
      ok: false,
      code: "invalid_mandate",
      reason: `Budget exceeded: previous spend ${snap.totalSpentMinor} + this charge ${input.amountMinor} = ${projectedTotalMinor} > max ${budgetMaxMinor} (${input.currency})`,
      details: {
        previous_spent_minor: snap.totalSpentMinor,
        this_charge_minor: input.amountMinor,
        projected_total_minor: projectedTotalMinor,
        max_minor: budgetMaxMinor,
        currency: input.currency,
      },
    };
  }

  if (input.recurrence) {
    if (snap.occurrences + 1 > input.recurrence.max_occurrences) {
      return {
        ok: false,
        code: "invalid_mandate",
        reason: `Recurrence exhausted: ${snap.occurrences + 1} > max_occurrences ${input.recurrence.max_occurrences}`,
        details: {
          occurrences: snap.occurrences,
          max_occurrences: input.recurrence.max_occurrences,
        },
      };
    }
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (
      !isWithinRecurrenceWindow(
        input.recurrence.frequency,
        snap.lastExecutedAt,
        now,
      )
    ) {
      return {
        ok: false,
        code: "invalid_mandate",
        reason: `Recurrence window not yet elapsed (frequency=${input.recurrence.frequency}, last_executed_at=${snap.lastExecutedAt}, now=${now})`,
        details: {
          frequency: input.recurrence.frequency,
          last_executed_at: snap.lastExecutedAt,
          now,
        },
      };
    }
  }

  return { ok: true };
}
