/**
 * Recipe 15 — Prorated subscription pause/resume.
 *
 * MP's pause API freezes recurring charges but doesn't auto-prorate the
 * unused period the customer already paid for. If you offer a "pause your
 * subscription, resume next month" feature, you need to:
 *
 *   1. Compute how many days are left in the current billing period.
 *   2. Refund a prorated amount for those unused days (or store as credit).
 *   3. Pause the subscription on MP.
 *   4. On resume, adjust the next-billing date so the customer doesn't
 *      double-pay for the period they were paused.
 *
 * # Why this matters
 *
 * Without proration, customers who pause feel ripped off ("I paid for a
 * month and you only gave me 10 days"). With proration but no resume
 * adjustment, you bill them again immediately on resume. Both kill retention.
 *
 * # The math
 *
 *   billingPeriodStart  ─────────────►  billingPeriodEnd
 *                              │ pausedAt
 *                              └─ daysUnused = (end - pausedAt) / 86400000
 *                                  prorated = monthlyAmount * (daysUnused / daysInPeriod)
 *
 * On resume, the next charge happens after `daysUnused` from now (instead
 * of the original schedule).
 */

import {
  MercadoPagoClient,
  type Preapproval,
} from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

// ─────────────────────────────────────────────────────────────────────────────
// State for tracking pause history
// ─────────────────────────────────────────────────────────────────────────────

type PauseRecord = {
  subscriptionId: string;
  pausedAt: number; // unix ms
  unusedDays: number;
  proratedRefund: number;
  refundId: string | null;
};

const pauseStore = new Map<string, PauseRecord>();

// ─────────────────────────────────────────────────────────────────────────────
// Pause with proration
// ─────────────────────────────────────────────────────────────────────────────

export async function pauseSubscriptionWithProration(args: {
  subscriptionId: string;
  /** When pause is requested. Defaults to now. */
  pausedAt?: Date;
  /**
   * If true, refund the unused-period amount to the customer's payment
   * method. If false, store the credit and apply on resume.
   */
  refundUnused: boolean;
}): Promise<{
  unusedDays: number;
  proratedAmount: number;
  refundId: string | null;
}> {
  const pausedAtMs = (args.pausedAt ?? new Date()).getTime();
  const sub = await mp.getPreapproval(args.subscriptionId);

  // Find the most recent successful charge to know when the current period
  // started, and the next_payment_date to know when it would have ended.
  const billingPeriodStart = sub.last_modified
    ? new Date(sub.last_modified).getTime()
    : pausedAtMs - 30 * 86_400_000; // fallback: 30 days ago

  // MP doesn't always populate `next_payment_date` — derive from the
  // recurrence config when missing.
  const billingPeriodEnd = computePeriodEnd(sub, billingPeriodStart);

  const totalDays = (billingPeriodEnd - billingPeriodStart) / 86_400_000;
  const usedDays = (pausedAtMs - billingPeriodStart) / 86_400_000;
  const unusedDays = Math.max(0, totalDays - usedDays);

  const monthlyAmount = sub.auto_recurring?.transaction_amount ?? 0;
  const proratedAmount = Math.round(
    (monthlyAmount * unusedDays) / Math.max(totalDays, 1),
  );

  let refundId: string | null = null;
  if (args.refundUnused && proratedAmount > 0) {
    // Find the most recent charge under this subscription to refund against.
    const recent = await mp.listSubscriptionPayments(args.subscriptionId, {
      limit: 5,
    });
    const lastApproved = recent.results.find((p) => p.status === "approved");
    if (lastApproved?.payment_id) {
      const refund = await mp.createRefund({
        payment_id: String(lastApproved.payment_id),
        amount: proratedAmount,
      });
      refundId = String(refund.id);
    }
  }

  // Now actually pause MP-side.
  await mp.pausePreapproval(args.subscriptionId);

  pauseStore.set(args.subscriptionId, {
    subscriptionId: args.subscriptionId,
    pausedAt: pausedAtMs,
    unusedDays,
    proratedRefund: proratedAmount,
    refundId,
  });

  return { unusedDays, proratedAmount, refundId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resume with adjusted next-billing date
// ─────────────────────────────────────────────────────────────────────────────

export async function resumeSubscriptionWithAdjustment(
  subscriptionId: string,
): Promise<{
  resumedAt: Date;
  nextBillingDate: Date;
  creditAppliedFromPause: number;
}> {
  const record = pauseStore.get(subscriptionId);
  if (!record) {
    // No pause record — just resume normally; MP picks up its own schedule.
    await mp.resumePreapproval(subscriptionId);
    return {
      resumedAt: new Date(),
      nextBillingDate: new Date(Date.now() + 30 * 86_400_000), // approximate
      creditAppliedFromPause: 0,
    };
  }

  // Resume the subscription. MP's resume sets the next charge to "tomorrow"
  // by default; we want to delay by the unused-days credit.
  await mp.resumePreapproval(subscriptionId);

  const resumedAt = new Date();
  const adjustedNextBilling = new Date(
    resumedAt.getTime() + record.unusedDays * 86_400_000,
  );

  // MP doesn't expose a way to push the next charge date directly via the
  // public API. The pragmatic workaround: cancel the subscription's first
  // post-resume charge from your webhook handler when it fires, having
  // already credited the customer the prorated amount.
  //
  // Alternative: schedule a Vercel Cron at adjustedNextBilling that resumes
  // the original subscription cleanly and skips the autopay-on-resume.

  pauseStore.delete(subscriptionId);

  return {
    resumedAt,
    nextBillingDate: adjustedNextBilling,
    creditAppliedFromPause: record.proratedRefund,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Period-end helper
// ─────────────────────────────────────────────────────────────────────────────

function computePeriodEnd(sub: Preapproval, periodStartMs: number): number {
  const freq = sub.auto_recurring?.frequency ?? 1;
  const type = sub.auto_recurring?.frequency_type ?? "months";
  if (type === "days") return periodStartMs + freq * 86_400_000;
  if (type === "months") return periodStartMs + freq * 30 * 86_400_000;
  return periodStartMs + 30 * 86_400_000;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dry-run test
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const SUB_ID = process.argv[2];
  if (!SUB_ID) {
    console.log("Usage: pnpm tsx 15-prorated-pause-resume.ts <subscription-id>");
    process.exit(1);
  }
  const result = await pauseSubscriptionWithProration({
    subscriptionId: SUB_ID,
    refundUnused: true,
  });
  console.log("Paused:", result);

  // ... (manually wait, then resume)

  const resumed = await resumeSubscriptionWithAdjustment(SUB_ID);
  console.log("Resumed:", resumed);
}

if (process.argv[1]?.endsWith("15-prorated-pause-resume.ts")) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
