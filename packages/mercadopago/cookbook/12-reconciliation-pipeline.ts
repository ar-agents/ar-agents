/**
 * Recipe 12 — Reconciliation pipeline.
 *
 * Daily batch job that compares MP's settlement records against your internal
 * billing DB and surfaces discrepancies. This is what every finance team
 * eventually asks the dev team to build, and there's no good off-the-shelf
 * tool for AR.
 *
 * # The four discrepancy classes
 *
 *   1. **In MP, not in our DB**: an MP payment exists with no matching
 *      internal invoice. Usually means a webhook was missed.
 *      → Action: backfill from MP into our DB.
 *
 *   2. **In our DB, not in MP**: we have an invoice marked paid, but no
 *      matching MP payment. Usually means we marked something paid
 *      manually or had a bug.
 *      → Action: flag for human review.
 *
 *   3. **Amount mismatch**: amounts differ between MP and our DB. Could be
 *      partial refund, dispute, currency conversion.
 *      → Action: classify (refund? dispute?) and update DB.
 *
 *   4. **Fee mismatch**: MP's reported `marketplace_fee` differs from what
 *      we calculated. Means our pricing logic is out of sync with the
 *      actual MP-side `application_fee`.
 *      → Action: recompute and surface for billing audit.
 *
 * # What this recipe shows
 *
 *   - Pagination via `paginatePayments` AsyncIterable (Edge-Runtime safe).
 *   - Settlement-level reconciliation via `paginateSettlements`.
 *   - Composition with the marketplace fee calculator (`computeMarketplaceFee`).
 *   - A human-readable "discrepancy report" the agent can email the finance
 *     team via @ar-agents/whatsapp or Resend.
 */

import {
  MercadoPagoClient,
  paginatePayments,
  paginateSettlements,
  computeMarketplaceFee,
  type Payment,
  type Settlement,
} from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

// ─────────────────────────────────────────────────────────────────────────────
// Types — what your internal DB looks like (replace with your schema)
// ─────────────────────────────────────────────────────────────────────────────

type InternalInvoice = {
  externalReference: string; // matches MP's external_reference
  amount: number; // in ARS
  status: "pending" | "paid" | "refunded";
  mpPaymentId?: string;
  expectedFee?: number; // what we expect MP to charge us
};

type Discrepancy =
  | { type: "missing_in_db"; mpPayment: Payment }
  | { type: "missing_in_mp"; invoice: InternalInvoice }
  | { type: "amount_mismatch"; mpPayment: Payment; invoice: InternalInvoice }
  | { type: "fee_mismatch"; mpPayment: Payment; expectedFee: number };

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function reconcileDay(args: {
  date: Date;
  fetchInternalInvoices: (
    rangeStart: Date,
    rangeEnd: Date,
  ) => Promise<InternalInvoice[]>;
  marketplaceFeePct?: number; // e.g. 5 for a 5% platform fee
}): Promise<{
  matched: number;
  discrepancies: Discrepancy[];
  totals: { mpGross: number; mpNet: number; mpFees: number };
}> {
  const dayStart = new Date(args.date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // 1. Pull all approved payments from MP for the day. paginatePayments is
  //    an AsyncIterable<Payment> wrapped over MP's search endpoint, with
  //    bounded memory regardless of window size.
  const mpPayments: Payment[] = [];
  for await (const p of paginatePayments(mp, {
    status: "approved",
    beginDate: dayStart.toISOString(),
    endDate: dayEnd.toISOString(),
  })) {
    mpPayments.push(p);
  }

  // 2. Pull internal invoices for the same window.
  const invoices = await args.fetchInternalInvoices(dayStart, dayEnd);

  // 3. Index by external_reference.
  const byRef = new Map<string, InternalInvoice>();
  for (const inv of invoices) byRef.set(inv.externalReference, inv);

  const discrepancies: Discrepancy[] = [];
  let matched = 0;

  // 4. Walk MP payments, match against internal.
  for (const p of mpPayments) {
    const ref = p.external_reference;
    if (!ref) continue; // payments without external_reference can't be matched
    const inv = byRef.get(ref);

    if (!inv) {
      discrepancies.push({ type: "missing_in_db", mpPayment: p });
      continue;
    }

    // Check 4a: amount.
    if (Math.abs(p.transaction_amount - inv.amount) > 0.01) {
      discrepancies.push({
        type: "amount_mismatch",
        mpPayment: p,
        invoice: inv,
      });
      continue;
    }

    // Check 4b: fee, if marketplace.
    const actualFee = (p as Payment & { marketplace_fee?: number }).marketplace_fee;
    if (args.marketplaceFeePct != null && actualFee != null) {
      const expected = computeMarketplaceFee(p.transaction_amount, {
        percent: args.marketplaceFeePct,
      });
      if (Math.abs(actualFee - expected) > 0.01) {
        discrepancies.push({
          type: "fee_mismatch",
          mpPayment: p,
          expectedFee: expected,
        });
        continue;
      }
    }

    matched += 1;
    byRef.delete(ref); // remove so we can detect leftover (4c) below
  }

  // 4c: any invoice left in byRef has no matching MP payment.
  for (const inv of byRef.values()) {
    if (inv.status !== "paid") continue; // unpaid invoices wouldn't have an MP payment yet
    discrepancies.push({ type: "missing_in_mp", invoice: inv });
  }

  // 5. Aggregate totals from MP-side settlements (the truth source for
  //    what was actually credited to your account today). The Settlement
  //    schema only exposes `amount` (the credited net total per settlement);
  //    gross/fee breakdowns live on individual payments. We sum payments
  //    above for gross + fees, and settlements here for the credited-net
  //    cross-check.
  let mpGross = 0;
  let mpFees = 0;
  for (const p of mpPayments) {
    mpGross += p.transaction_amount ?? 0;
    const fee = (p as Payment & { marketplace_fee?: number }).marketplace_fee;
    if (fee) mpFees += fee;
  }
  let mpNet = 0;
  for await (const s of paginateSettlements(mp, {
    date_from: dayStart.toISOString(),
    date_to: dayEnd.toISOString(),
  } as Parameters<typeof paginateSettlements>[1])) {
    mpNet += (s as Settlement).amount ?? 0;
  }

  return {
    matched,
    discrepancies,
    totals: { mpGross, mpNet, mpFees },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Discrepancy report formatter
// ─────────────────────────────────────────────────────────────────────────────

export function formatDiscrepancyReport(input: {
  date: Date;
  matched: number;
  discrepancies: Discrepancy[];
  totals: { mpGross: number; mpNet: number; mpFees: number };
}): string {
  const lines: string[] = [];
  lines.push(`# Reconciliation report — ${input.date.toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(`**Matched payments:** ${input.matched}`);
  lines.push(`**Discrepancies:** ${input.discrepancies.length}`);
  lines.push("");
  lines.push(`**MP totals:**`);
  lines.push(`  - Gross: $${input.totals.mpGross.toLocaleString("es-AR")}`);
  lines.push(`  - Fees:  $${input.totals.mpFees.toLocaleString("es-AR")}`);
  lines.push(`  - Net:   $${input.totals.mpNet.toLocaleString("es-AR")}`);
  lines.push("");

  if (input.discrepancies.length === 0) {
    lines.push("✓ All clean.");
    return lines.join("\n");
  }

  lines.push("## Discrepancies");
  lines.push("");
  for (const d of input.discrepancies) {
    switch (d.type) {
      case "missing_in_db":
        lines.push(
          `- **Missing in DB**: MP payment ${d.mpPayment.id} (ref=${d.mpPayment.external_reference}, $${d.mpPayment.transaction_amount}). Action: backfill.`,
        );
        break;
      case "missing_in_mp":
        lines.push(
          `- **Missing in MP**: internal invoice ${d.invoice.externalReference} marked paid but no MP record. Action: human review.`,
        );
        break;
      case "amount_mismatch":
        lines.push(
          `- **Amount mismatch**: ref=${d.invoice.externalReference}: DB says $${d.invoice.amount}, MP says $${d.mpPayment.transaction_amount}. Action: classify (partial refund? dispute?).`,
        );
        break;
      case "fee_mismatch":
        lines.push(
          `- **Fee mismatch**: payment ${d.mpPayment.id}: expected $${d.expectedFee}, MP charged $${d.mpPayment.marketplace_fee}. Action: audit pricing logic.`,
        );
        break;
    }
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add to vercel.json:
 *
 *   {
 *     "crons": [
 *       { "path": "/api/cron/reconcile", "schedule": "0 6 * * *" }
 *     ]
 *   }
 *
 * Runs at 06:00 every day, reconciles the previous day.
 */
export async function GET() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await reconcileDay({
    date: yesterday,
    fetchInternalInvoices: async (start, end) => {
      // Replace with your DB query.
      return [];
    },
    marketplaceFeePct: 0.05,
  });

  const report = formatDiscrepancyReport({ date: yesterday, ...result });
  // Send via Resend, Slack, Email, or your channel of choice.
  console.log(report);

  return new Response(report, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}
