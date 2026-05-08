# 03 — Budget tracking (stateful constraint evaluation)

`payment.budget` and `payment.agent_recurrence` are stateful constraints —
the verifier MUST track running spend + occurrence counts across multiple
presentations of mandates rooted in the same Open Payment Mandate. This
recipe shows how to wire `InMemoryBudgetTracker` and the
`evaluateBudgetWithRecurrence` evaluator.

```ts
import {
  InMemoryBudgetTracker,
  evaluateBudgetWithRecurrence,
  divisorFor,
  computeSdHash,
  parseSdJwt,
} from "@ar-agents/ap2";

// 1. Single tracker per process (or back with Redis/Postgres in prod).
const tracker = new InMemoryBudgetTracker();

// 2. After verifying a Closed Payment Mandate, but BEFORE authorizing the
// payment, evaluate budget constraints from the linked Open Payment Mandate.
const openPaymentParts = parseSdJwt(openPaymentPresentation);
const openPaymentDigest = await computeSdHash({
  issuerJwt: openPaymentParts.issuerJwt,
  disclosures: openPaymentParts.disclosures,
});

const budgetEval = await evaluateBudgetWithRecurrence({
  tracker,
  openMandateDigest: openPaymentDigest,
  amountMinor: closedPaymentMandate.payment_amount.amount,
  currency: closedPaymentMandate.payment_amount.currency,
  budget: { max: 5000, currency: "USD" }, // from open mandate's payment.budget
  recurrence: { frequency: "WEEKLY", max_occurrences: 10 },
  divisor: divisorFor(closedPaymentMandate.payment_amount.currency),
});

if (!budgetEval.ok) {
  // Reject the payment with budgetEval.reason.
  throw new Error(budgetEval.reason);
}

// 3. Authorize the payment downstream (Stripe, MP, x402, etc.)
const paymentResult = await chargeViaMP({ ... });

// 4. After successful authorization, record the presentation.
await tracker.recordPresentation({
  openMandateDigest: openPaymentDigest,
  amountMinor: closedPaymentMandate.payment_amount.amount,
  currency: closedPaymentMandate.payment_amount.currency,
});
```

## Production tracker patterns

`InMemoryBudgetTracker` is fine for dev + tests + single-process demos but
loses state on restart. For production, implement `BudgetTracker` against:

```ts
// Redis-backed tracker (Vercel KV / Upstash / ioredis)
import type { BudgetTrackerInterface, TrackerSnapshot, RecordPresentationArgs } from "@ar-agents/ap2";

class RedisBudgetTracker implements BudgetTrackerInterface {
  constructor(private kv: { get; set }) {}

  async inspect(digest: string): Promise<TrackerSnapshot> {
    const stored = await this.kv.get<TrackerSnapshot>(`ap2:budget:${digest}`);
    return stored ?? { totalSpentMinor: 0, occurrences: 0 };
  }

  async recordPresentation(args: RecordPresentationArgs): Promise<void> {
    // Use a Lua script for atomicity on Redis, OR a SERIALIZABLE Postgres tx.
    const prev = await this.inspect(args.openMandateDigest);
    const next: TrackerSnapshot = {
      totalSpentMinor: prev.totalSpentMinor + args.amountMinor,
      occurrences: prev.occurrences + 1,
      lastExecutedAt: args.executedAt ?? Math.floor(Date.now() / 1000),
    };
    await this.kv.set(`ap2:budget:${args.openMandateDigest}`, next);
  }
}
```

## Recurrence semantics

`isWithinRecurrenceWindow(frequency, lastExecutedAt, nowSeconds)` tells you
whether enough time has elapsed for the next presentation to be allowed:

| Frequency | Minimum interval |
|---|---|
| `ON_DEMAND` | 0 (always passes) |
| `DAILY` | 24h |
| `WEEKLY` | 7 days |
| `BIWEEKLY` | 14 days |
| `MONTHLY` | 30 days (approximation per AP2 examples) |
| `QUARTERLY` | 91 days |
| `ANNUALLY` | 365 days |

Combine with `max_occurrences` to enforce e.g. "max 12 monthly charges of
USD 50 each on this open mandate".

## Handling budget exceeded

`evaluateBudgetWithRecurrence` returns an `invalid_mandate` failure with
`details.previous_spent_minor`, `this_charge_minor`, etc., so you can
surface a clear error to the agent + log the attempt for audit.
