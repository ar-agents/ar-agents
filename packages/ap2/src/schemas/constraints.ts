import { z } from "zod";
import { Amount, Frequency, Item, Merchant, PaymentInstrument, Pisp } from "./common";

// AP2 constraint types — appear in `Open*Mandate.constraints[]`. Verifiers
// MUST evaluate every constraint when validating a closed mandate against
// a chain, and per spec **unknown constraint types MUST FAIL evaluation**.
//
// Closed mandates MUST satisfy every constraint of every open mandate in
// the chain. The catalog below covers all 8 types declared in the v0.2
// schemas (`code/sdk/schemas/ap2/constraints/*.json`).

// ---- Checkout-side constraints --------------------------------------------

/** `checkout.allowed_merchants` — Open Checkout Mandate may restrict which
 *  merchants the closed checkout can name as `payee`. The `allowed` list is
 *  selectively-disclosable (the verifier sees only the revealed entries). */
export const ConstraintAllowedMerchants = z.object({
  type: z.literal("checkout.allowed_merchants"),
  allowed: z.array(Merchant),
});
export type ConstraintAllowedMerchants = z.infer<
  typeof ConstraintAllowedMerchants
>;

/** `checkout.line_items` — bounds the closed checkout's line items. Each
 *  constraint item names `acceptable_items` (selectively-disclosable) and
 *  a `quantity` cap. The closed checkout must satisfy a max-flow match. */
export const LineItemConstraintEntry = z.object({
  /** Constraint-side line id (NOT a checkout line id). */
  id: z.string().min(1),
  acceptable_items: z.array(Item),
  /** Cap; closed checkout's matching items can sum up to this. */
  quantity: z.number().positive(),
});
export type LineItemConstraintEntry = z.infer<typeof LineItemConstraintEntry>;

export const ConstraintLineItems = z.object({
  type: z.literal("checkout.line_items"),
  items: z.array(LineItemConstraintEntry),
});
export type ConstraintLineItems = z.infer<typeof ConstraintLineItems>;

// ---- Payment-side constraints ---------------------------------------------

/** `payment.amount_range` — caps the closed payment's `payment_amount`.
 *  `min` is optional. Currency must match. */
export const ConstraintAmountRange = z.object({
  type: z.literal("payment.amount_range"),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  /** Maximum amount in minor units. */
  max: z.number().int().nonnegative(),
  /** Minimum amount in minor units. Default 0. */
  min: z.number().int().nonnegative().optional(),
});
export type ConstraintAmountRange = z.infer<typeof ConstraintAmountRange>;

/** `payment.allowed_payees` — restricts which merchants can be paid. */
export const ConstraintAllowedPayees = z.object({
  type: z.literal("payment.allowed_payees"),
  allowed: z.array(Merchant),
});
export type ConstraintAllowedPayees = z.infer<typeof ConstraintAllowedPayees>;

/** `payment.allowed_payment_instruments` — restricts which instruments. */
export const ConstraintAllowedPaymentInstruments = z.object({
  type: z.literal("payment.allowed_payment_instruments"),
  allowed: z.array(PaymentInstrument),
});
export type ConstraintAllowedPaymentInstruments = z.infer<
  typeof ConstraintAllowedPaymentInstruments
>;

/** `payment.allowed_pisps` — restricts which Payment Initiation Service
 *  Providers can route the payment (EU PSD2 / LATAM Open Finance). */
export const ConstraintAllowedPisps = z.object({
  type: z.literal("payment.allowed_pisps"),
  allowed: z.array(Pisp),
});
export type ConstraintAllowedPisps = z.infer<typeof ConstraintAllowedPisps>;

/** `payment.budget` — paired with `payment.agent_recurrence`. The verifier
 *  is responsible for tracking past presentations and rejecting if the
 *  running sum + this charge would exceed `max`. (Stateful evaluator;
 *  Phase 2.2 ships a tracker.) */
export const ConstraintBudget = z.object({
  type: z.literal("payment.budget"),
  /** Major-units (per spec example) — host must convert via `divisorFor`. */
  max: z.number().nonnegative(),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
});
export type ConstraintBudget = z.infer<typeof ConstraintBudget>;

/** `payment.agent_recurrence` — paired with `payment.budget`. Caps total
 *  occurrences and frequency window. */
export const ConstraintAgentRecurrence = z.object({
  type: z.literal("payment.agent_recurrence"),
  frequency: Frequency,
  max_occurrences: z.number().int().positive(),
});
export type ConstraintAgentRecurrence = z.infer<
  typeof ConstraintAgentRecurrence
>;

/** `payment.execution_date` — caps when the payment can execute. */
export const ConstraintExecutionDate = z.object({
  type: z.literal("payment.execution_date"),
  not_before: z.string().optional(),
  not_after: z.string().optional(),
});
export type ConstraintExecutionDate = z.infer<typeof ConstraintExecutionDate>;

/** `payment.reference` — REQUIRED on every Open Payment Mandate. Carries
 *  the digest of the linked Open Checkout Mandate (binds the payment to a
 *  checkout family). */
export const ConstraintPaymentReference = z.object({
  type: z.literal("payment.reference"),
  /** Digest of the matching Open Checkout Mandate. */
  conditional_transaction_id: z.string().min(1),
});
export type ConstraintPaymentReference = z.infer<
  typeof ConstraintPaymentReference
>;

// ---- Discriminated union --------------------------------------------------

export const Constraint = z.discriminatedUnion("type", [
  ConstraintAllowedMerchants,
  ConstraintLineItems,
  ConstraintAmountRange,
  ConstraintAllowedPayees,
  ConstraintAllowedPaymentInstruments,
  ConstraintAllowedPisps,
  ConstraintBudget,
  ConstraintAgentRecurrence,
  ConstraintExecutionDate,
  ConstraintPaymentReference,
]);
export type Constraint = z.infer<typeof Constraint>;

// AP2-known constraint types (closed set per v0.2). Used by the verifier to
// distinguish "unknown constraint" failures from "known constraint failed
// evaluation".
export const KNOWN_CONSTRAINT_TYPES: ReadonlyArray<Constraint["type"]> = [
  "checkout.allowed_merchants",
  "checkout.line_items",
  "payment.amount_range",
  "payment.allowed_payees",
  "payment.allowed_payment_instruments",
  "payment.allowed_pisps",
  "payment.budget",
  "payment.agent_recurrence",
  "payment.execution_date",
  "payment.reference",
];
