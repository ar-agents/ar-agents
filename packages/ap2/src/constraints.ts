// Constraint evaluators for AP2 v0.2.
//
// Verifiers MUST evaluate every constraint of every open mandate in the
// chain against the closed mandate. Per spec §C, **unknown constraint types
// MUST FAIL evaluation** (returning `unresolved_constraint`).
//
// We implement evaluators for all 8 known constraint types:
//   - checkout.allowed_merchants
//   - checkout.line_items (max-flow)
//   - payment.amount_range
//   - payment.allowed_payees
//   - payment.allowed_payment_instruments
//   - payment.allowed_pisps
//   - payment.budget (+ payment.agent_recurrence; stateful, requires tracker)
//   - payment.execution_date
//   - payment.reference

import type { Constraint } from "./schemas/constraints";
import { KNOWN_CONSTRAINT_TYPES } from "./schemas/constraints";
import type { ClosedCheckoutMandate, CheckoutJwtPayload } from "./schemas/checkout-mandate";
import type { ClosedPaymentMandate } from "./schemas/payment-mandate";
import type { Frequency } from "./schemas/common";
import { divisorFor } from "./schemas/common";
import {
  evaluateBudgetWithRecurrence,
  type BudgetTracker,
} from "./budget-tracker";

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

export type EvaluationResult =
  | { ok: true }
  | { ok: false; reason: string; code: "invalid_mandate" | "unresolved_constraint" };

export interface CheckoutConstraintContext {
  /** Inner checkout payload (already verified + parsed). */
  checkoutPayload: CheckoutJwtPayload;
  /** The closed mandate object. */
  closedMandate: ClosedCheckoutMandate;
}

export interface PaymentConstraintContext {
  closedMandate: ClosedPaymentMandate;
  /**
   * sd_hash digest of the linked Open Checkout Mandate. Required when
   * evaluating `payment.reference`. `undefined` if the verifier cannot
   * resolve it (verifier MUST then fail with `unresolved_constraint`).
   */
  linkedCheckoutMandateDigest?: string;
  /**
   * Stateful tracker for budget + agent_recurrence constraints. When present,
   * `payment.budget` (and its paired `payment.agent_recurrence`) are evaluated
   * against the tracker snapshot via `evaluateBudgetWithRecurrence`. When
   * absent, those constraints pass as a documented no-op (caller is
   * responsible for supplying a tracker in production).
   */
  tracker?: BudgetTracker;
  /**
   * Stable digest keying tracker state for this Open Payment Mandate
   * (typically its sd_hash). Required when `tracker` is supplied — without it
   * budget/recurrence cannot be evaluated and fail with
   * `unresolved_constraint`.
   */
  openMandateDigest?: string;
  /**
   * The paired `payment.agent_recurrence` bound from the same Open Payment
   * Mandate, if any. `payment.budget` and `payment.agent_recurrence` are
   * evaluated together (the recurrence cap is meaningless without the budget),
   * so the caller resolves the recurrence constraint alongside the budget one.
   */
  budgetRecurrence?: { frequency: Frequency; max_occurrences: number };
  /** Override "now" (Unix seconds) for deterministic recurrence tests. */
  nowSeconds?: number;
}

export type { BudgetTracker };

// ---------------------------------------------------------------------------
// Top-level dispatcher
// ---------------------------------------------------------------------------

/**
 * Evaluate a single constraint against a Closed Checkout Mandate context.
 * Throws `EvaluationError` on unknown constraint types per spec.
 */
export function evaluateCheckoutConstraint(
  constraint: Constraint,
  context: CheckoutConstraintContext,
): EvaluationResult {
  switch (constraint.type) {
    case "checkout.allowed_merchants":
      return evalAllowedMerchants(
        constraint.allowed,
        context.checkoutPayload.merchant.id,
      );
    case "checkout.line_items":
      return evalLineItemsMaxFlow(constraint.items, context.checkoutPayload);
    // Payment-side constraints are illegal in Open Checkout Mandates per spec.
    default:
      if (KNOWN_CONSTRAINT_TYPES.includes(constraint.type)) {
        return {
          ok: false,
          code: "invalid_mandate",
          reason: `Constraint type '${constraint.type}' belongs to the payment family and cannot appear in an Open Checkout Mandate.`,
        };
      }
      return {
        ok: false,
        code: "unresolved_constraint",
        reason: `Unknown constraint type '${(constraint as { type: string }).type}'`,
      };
  }
}

/**
 * Evaluate a single constraint against a Closed Payment Mandate context.
 * Returns `unresolved_constraint` for unknown types. For `payment.budget` +
 * `payment.agent_recurrence` requires `context.tracker` if present.
 */
export async function evaluatePaymentConstraint(
  constraint: Constraint,
  context: PaymentConstraintContext,
): Promise<EvaluationResult> {
  switch (constraint.type) {
    case "payment.amount_range":
      return evalAmountRange(
        constraint,
        context.closedMandate.payment_amount,
      );
    case "payment.allowed_payees":
      return evalAllowedPayees(
        constraint.allowed.map((m) => m.id),
        context.closedMandate.payee.id,
      );
    case "payment.allowed_payment_instruments":
      return evalAllowedInstruments(
        constraint.allowed.map((p) => ({ id: p.id, type: p.type })),
        context.closedMandate.payment_instrument,
      );
    case "payment.allowed_pisps": {
      const pispId = context.closedMandate.pisp?.id;
      return evalAllowedPisps(
        constraint.allowed.map((p) => p.id),
        pispId,
      );
    }
    case "payment.execution_date":
      return evalExecutionDate(constraint, context.closedMandate.execution_date);
    case "payment.reference":
      return evalReference(
        constraint.conditional_transaction_id,
        context.linkedCheckoutMandateDigest,
      );
    case "payment.budget":
      return evalBudget(constraint, context);
    case "payment.agent_recurrence":
      // Recurrence is evaluated jointly with its paired `payment.budget`
      // (see `evalBudget`, which reads `context.budgetRecurrence`). Evaluating
      // it a second time here would double-count occurrences, so this arm is a
      // no-op — the budget arm owns the stateful check. With no tracker wired,
      // it is a documented pass (caller responsibility, matching budget).
      return { ok: true };
    // Checkout-side constraints are illegal in Open Payment Mandates.
    default:
      if (KNOWN_CONSTRAINT_TYPES.includes(constraint.type)) {
        return {
          ok: false,
          code: "invalid_mandate",
          reason: `Constraint type '${constraint.type}' belongs to the checkout family and cannot appear in an Open Payment Mandate.`,
        };
      }
      return {
        ok: false,
        code: "unresolved_constraint",
        reason: `Unknown constraint type '${(constraint as { type: string }).type}'`,
      };
  }
}

// ---------------------------------------------------------------------------
// Individual evaluators
// ---------------------------------------------------------------------------

function evalAllowedMerchants(
  allowed: ReadonlyArray<{ id: string }>,
  merchantId: string,
): EvaluationResult {
  if (allowed.some((m) => m.id === merchantId)) {
    return { ok: true };
  }
  return {
    ok: false,
    code: "invalid_mandate",
    reason: `Merchant '${merchantId}' not in allowed_merchants list (${allowed.map((m) => m.id).join(", ") || "<empty>"})`,
  };
}

function evalAllowedPayees(
  allowedIds: readonly string[],
  payeeId: string,
): EvaluationResult {
  if (allowedIds.includes(payeeId)) return { ok: true };
  return {
    ok: false,
    code: "invalid_mandate",
    reason: `Payee '${payeeId}' not in allowed_payees`,
  };
}

function evalAllowedInstruments(
  allowed: ReadonlyArray<{ id: string; type: string }>,
  instrument: { id: string; type: string },
): EvaluationResult {
  // Match by id first, then fall back to type-only match.
  if (
    allowed.some(
      (a) => a.id === instrument.id || (a.type === instrument.type && !a.id),
    )
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    code: "invalid_mandate",
    reason: `PaymentInstrument id='${instrument.id}' type='${instrument.type}' not in allowed list`,
  };
}

function evalAllowedPisps(
  allowedIds: readonly string[],
  pispId: string | undefined,
): EvaluationResult {
  if (!pispId) {
    return {
      ok: false,
      code: "invalid_mandate",
      reason: "Closed Payment Mandate has no pisp but constraint requires one",
    };
  }
  if (allowedIds.includes(pispId)) return { ok: true };
  return {
    ok: false,
    code: "invalid_mandate",
    reason: `Pisp '${pispId}' not in allowed_pisps`,
  };
}

function evalAmountRange(
  constraint: { currency: string; max: number; min?: number | undefined },
  amount: { amount: number; currency: string },
): EvaluationResult {
  if (constraint.currency.toUpperCase() !== amount.currency.toUpperCase()) {
    return {
      ok: false,
      code: "invalid_mandate",
      reason: `Currency mismatch: constraint='${constraint.currency}', amount='${amount.currency}'`,
    };
  }
  if (amount.amount > constraint.max) {
    return {
      ok: false,
      code: "invalid_mandate",
      reason: `Amount ${amount.amount} exceeds max ${constraint.max} ${constraint.currency}`,
    };
  }
  const min = constraint.min ?? 0;
  if (amount.amount < min) {
    return {
      ok: false,
      code: "invalid_mandate",
      reason: `Amount ${amount.amount} below min ${min} ${constraint.currency}`,
    };
  }
  return { ok: true };
}

function evalExecutionDate(
  constraint: { not_before?: string | undefined; not_after?: string | undefined },
  executionDate: string | undefined,
): EvaluationResult {
  if (!executionDate) {
    // Absent = immediate. We treat as "now" for window check.
    const nowIso = new Date().toISOString();
    return checkWindow(constraint, nowIso);
  }
  return checkWindow(constraint, executionDate);
}

function checkWindow(
  constraint: { not_before?: string | undefined; not_after?: string | undefined },
  iso: string,
): EvaluationResult {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return {
      ok: false,
      code: "invalid_mandate",
      reason: `Invalid execution_date: ${iso}`,
    };
  }
  if (constraint.not_before) {
    const lo = Date.parse(constraint.not_before);
    if (!Number.isNaN(lo) && t < lo) {
      return {
        ok: false,
        code: "invalid_mandate",
        reason: `execution_date ${iso} before not_before ${constraint.not_before}`,
      };
    }
  }
  if (constraint.not_after) {
    const hi = Date.parse(constraint.not_after);
    if (!Number.isNaN(hi) && t > hi) {
      return {
        ok: false,
        code: "invalid_mandate",
        reason: `execution_date ${iso} after not_after ${constraint.not_after}`,
      };
    }
  }
  return { ok: true };
}

async function evalBudget(
  constraint: { max: number; currency: string },
  context: PaymentConstraintContext,
): Promise<EvaluationResult> {
  // No tracker: documented pass — the caller is responsible for supplying a
  // stateful tracker in production. (Matches the pre-existing project posture
  // for stateful constraints when the host opts out of tracking.)
  if (!context.tracker) {
    return { ok: true };
  }
  // Tracker present but we can't key it — fail closed rather than silently
  // skipping the budget check.
  if (!context.openMandateDigest) {
    return {
      ok: false,
      code: "unresolved_constraint",
      reason:
        "payment.budget requires an openMandateDigest to key tracker state; caller supplied a tracker without one.",
    };
  }
  const amount = context.closedMandate.payment_amount;
  const result = await evaluateBudgetWithRecurrence({
    tracker: context.tracker,
    openMandateDigest: context.openMandateDigest,
    amountMinor: amount.amount,
    currency: amount.currency,
    budget: { max: constraint.max, currency: constraint.currency },
    divisor: divisorFor(amount.currency),
    ...(context.budgetRecurrence !== undefined
      ? { recurrence: context.budgetRecurrence }
      : {}),
    ...(context.nowSeconds !== undefined ? { nowSeconds: context.nowSeconds } : {}),
  });
  return result;
}

function evalReference(
  expectedDigest: string,
  resolvedDigest: string | undefined,
): EvaluationResult {
  if (!resolvedDigest) {
    return {
      ok: false,
      code: "unresolved_constraint",
      reason:
        "payment.reference requires the linked Open Checkout Mandate digest. Caller did not supply linkedCheckoutMandateDigest.",
    };
  }
  if (expectedDigest !== resolvedDigest) {
    return {
      ok: false,
      code: "invalid_mandate",
      reason: `payment.reference mismatch: expected ${expectedDigest}, got ${resolvedDigest}`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// `checkout.line_items` — bipartite max-flow per spec.
//
// A constraint passes iff a feasible flow exists where:
//   - source → constraint item (capacity = constraint.quantity)
//   - constraint item → checkout item (infinite capacity, only edges where
//                        checkout-item id ∈ constraint.acceptable_items[].id)
//   - checkout item → sink (capacity = checkout.quantity)
// and the maximum flow equals total constraint quantity (= the constraint
// is satisfied entirely).
//
// We implement a standard Ford-Fulkerson with BFS (Edmonds-Karp). For the
// tiny graphs AP2 cart constraints produce (max ~50 nodes), this is plenty.
// ---------------------------------------------------------------------------

interface LineItemConstraintEntry {
  id: string;
  acceptable_items: ReadonlyArray<{ id: string }>;
  quantity: number;
}

function evalLineItemsMaxFlow(
  constraintItems: ReadonlyArray<LineItemConstraintEntry>,
  checkoutPayload: CheckoutJwtPayload,
): EvaluationResult {
  const cartItems = checkoutPayload.line_items.map((li) => ({
    id: li.product.id,
    quantity: li.quantity,
  }));

  const totalRequired = constraintItems.reduce((s, ci) => s + ci.quantity, 0);
  if (totalRequired === 0) return { ok: true };

  // Node layout:
  //   0 = source
  //   1..C = constraint items (C = constraintItems.length)
  //   C+1..C+K = cart items (K = cartItems.length)
  //   C+K+1 = sink
  const C = constraintItems.length;
  const K = cartItems.length;
  const N = 2 + C + K;
  const SRC = 0;
  const SINK = N - 1;
  const CON = (i: number) => 1 + i;
  const CART = (i: number) => 1 + C + i;

  // Capacity matrix (numbers).
  const cap = Array.from({ length: N }, () => new Array<number>(N).fill(0));

  for (let i = 0; i < C; i++) {
    cap[SRC]![CON(i)] = constraintItems[i]!.quantity;
  }
  for (let j = 0; j < K; j++) {
    cap[CART(j)]![SINK] = cartItems[j]!.quantity;
  }
  for (let i = 0; i < C; i++) {
    const acceptableIds = new Set(
      constraintItems[i]!.acceptable_items.map((a) => a.id),
    );
    for (let j = 0; j < K; j++) {
      if (acceptableIds.has(cartItems[j]!.id)) {
        cap[CON(i)]![CART(j)] = Number.POSITIVE_INFINITY;
      }
    }
  }

  const flow = maxFlow(cap, SRC, SINK, N);
  if (flow >= totalRequired) return { ok: true };
  return {
    ok: false,
    code: "invalid_mandate",
    reason: `checkout.line_items: only ${flow}/${totalRequired} required units satisfiable from cart`,
  };
}

function maxFlow(cap: number[][], src: number, sink: number, N: number): number {
  let total = 0;
  while (true) {
    const parent = bfs(cap, src, sink, N);
    if (!parent) break;
    let pathFlow = Number.POSITIVE_INFINITY;
    for (let v = sink; v !== src; v = parent[v]!) {
      const u = parent[v]!;
      pathFlow = Math.min(pathFlow, cap[u]![v]!);
    }
    if (!Number.isFinite(pathFlow)) {
      // Defensive: an infinite-capacity edge should never bottleneck the
      // path because src and sink edges are finite.
      break;
    }
    for (let v = sink; v !== src; v = parent[v]!) {
      const u = parent[v]!;
      cap[u]![v] = cap[u]![v]! - pathFlow;
      cap[v]![u] = cap[v]![u]! + pathFlow;
    }
    total += pathFlow;
  }
  return total;
}

function bfs(
  cap: number[][],
  src: number,
  sink: number,
  N: number,
): number[] | null {
  const parent = new Array<number>(N).fill(-1);
  parent[src] = src;
  const queue: number[] = [src];
  while (queue.length) {
    const u = queue.shift()!;
    for (let v = 0; v < N; v++) {
      if (parent[v] === -1 && cap[u]![v]! > 0) {
        parent[v] = u;
        if (v === sink) return parent;
        queue.push(v);
      }
    }
  }
  return null;
}

// Re-export divisorFor for downstream consumers.
export { divisorFor };
