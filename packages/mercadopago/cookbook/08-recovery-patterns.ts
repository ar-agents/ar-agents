/**
 * Recipe 08 — Recovery patterns: retry, recover stuck payments, handle expirations.
 *
 * # Common stuck states and how to recover
 *
 * 1. **Subscription card expired → recurring charge rejected**
 *    Recover by: capture fresh card token from buyer + `update_subscription({ card_token_id })`
 *
 * 2. **Payment stuck in `pending_challenge` (3DS not completed)**
 *    Recover by: redirect buyer back to the challenge URL via
 *    `analyze_payment_3ds(payment_id).challengeUrl`
 *
 * 3. **Payment in `pending_review_manual` (MP fraud team review)**
 *    Recover by: WAIT — MP processes within 24-72h. Don't retry.
 *
 * 4. **Subscription auto-cancelled because first payment failed**
 *    Recover by: create a fresh subscription (the original is dead, MP doesn't
 *    let you "reactivate" — that's documented in `MercadoPagoPaymentRejectedError`).
 *
 * 5. **`pending_waiting_payment` for cash methods (Rapipago, Pago Fácil)**
 *    Recover by: NOTHING — the buyer must complete payment within the
 *    timeout (typically 3-5 days). Polling or push-webhooks notify when done.
 *
 * 6. **Webhook arrived but payment not in your DB**
 *    Recover by: idempotent upsert via `searchPayments({ external_reference })`
 *    instead of trusting the webhook payload alone.
 */

import {
  classifyError,
  explainPaymentStatus,
  MercadoPagoClient,
  MercadoPagoPaymentRejectedError,
  type PaymentStatusExplanation,
} from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 1 — Subscription card swap on rejection
// ─────────────────────────────────────────────────────────────────────────────

export async function recoverFromCardRejection(input: {
  subscriptionId: string;
  buyerWhatsAppNumber: string;
}) {
  const sub = await mp.getPreapproval(input.subscriptionId);
  if (sub.status !== "paused" && sub.status !== "cancelled") {
    return { ok: true, action: "none" };
  }

  // Send buyer a link to update their card via MP frontend SDK
  const updateUrl = `https://yourapp.com/billing/update-card?sub=${input.subscriptionId}`;
  // ... send via WhatsApp with the toolkit's whatsappTools ...

  return {
    ok: false,
    action: "card_swap_required",
    sentTo: input.buyerWhatsAppNumber,
    updateUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 2 — Recover stuck-pending payment with status explanation
// ─────────────────────────────────────────────────────────────────────────────

export async function inspectStuckPayment(paymentId: string): Promise<{
  paymentId: string;
  status: string;
  explanation: PaymentStatusExplanation;
  nextAction: string;
}> {
  const payment = await mp.getPayment(paymentId);
  const explanation = explainPaymentStatus(payment);

  let nextAction = explanation.recommendedAction;
  if (explanation.retryable) {
    nextAction = `Reintentar con otra tarjeta. Razón: ${explanation.summary}`;
  } else if (!explanation.final) {
    nextAction = `Esperar webhook (${explanation.summary}). Sin acción de tu parte.`;
  } else if (explanation.paid) {
    nextAction = `Acreditado. Continuar con flujo posterior.`;
  }

  return {
    paymentId,
    status: payment.status as string,
    explanation,
    nextAction,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 3 — Idempotent upsert via search (don't trust webhook payload alone)
// ─────────────────────────────────────────────────────────────────────────────

export async function reconcilePaymentByExternalRef(externalReference: string) {
  // Search MP for ALL payments under this external_reference. There may be
  // multiple if the buyer retried.
  const result = await mp.searchPayments({ external_reference: externalReference });

  // Find the latest approved one (winning attempt)
  const approved = result.results
    ?.filter((p) => p.status === "approved")
    .sort((a, b) => (b.date_created ?? "").localeCompare(a.date_created ?? ""))[0];

  if (approved) {
    return { found: true, paymentId: approved.id, amount: approved.transaction_amount };
  }

  // No approved payment — find the latest attempt (could be pending or rejected)
  const latest = result.results
    ?.sort((a, b) => (b.date_created ?? "").localeCompare(a.date_created ?? ""))[0];

  return { found: false, lastAttempt: latest };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 4 — Handle MercadoPagoPaymentRejectedError explicitly
// ─────────────────────────────────────────────────────────────────────────────

export async function chargeWithRetry(input: {
  cardId: string;
  customerId: string;
  amountArs: number;
  cvv: string;
  externalReference: string;
}): Promise<
  { ok: true; paymentId: string } | { ok: false; reason: string; recoverable: boolean }
> {
  try {
    const payment = await mp.chargeSavedCard({
      cardId: input.cardId,
      customerId: input.customerId,
      transactionAmount: input.amountArs,
      securityCode: input.cvv,
      payerEmail: "—", // populated server-side from customer
      description: "Recurring charge",
      externalReference: input.externalReference,
    });
    return { ok: true, paymentId: payment.id };
  } catch (err) {
    if (err instanceof MercadoPagoPaymentRejectedError) {
      // The lib's MercadoPagoPaymentRejectedError carries status_detail —
      // use it to drive recovery.
      const detail = (err as MercadoPagoPaymentRejectedError & { statusDetail?: string }).statusDetail;
      const recoverable =
        detail === "cc_rejected_call_for_authorize" ||
        detail === "cc_rejected_insufficient_amount" ||
        detail === "cc_rejected_bad_filled_security_code";
      return { ok: false, reason: detail ?? "rejected", recoverable };
    }
    const classified = classifyError(err);
    throw classified; // Re-throw for ops/observability
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern 5 — Cron-driven monitoring (Vercel Cron Job)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hypothetical Vercel Cron Job (`vercel.json`):
 * ```json
 * { "crons": [{ "path": "/api/cron/mp-monitor", "schedule": "0 *\/4 * * *" }] }
 * ```
 *
 * Runs every 4 hours; surfaces:
 * - Subscriptions that haven't auto-charged in >35 days (probably broken)
 * - Stuck-pending payments older than 24h (need investigation)
 * - Disputes opened in the last 24h (need response)
 */
export async function cronMonitorMpHealth() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const stuck = await mp.searchPayments({
    status: "pending",
    range: "date_created",
    begin_date: since.slice(0, 10),
  } as never);

  // Surface to ops via Slack/email/Sentry
  const stuckCount = stuck.results?.length ?? 0;
  if (stuckCount > 5) {
    // alertOps(...)
  }

  return { stuckCount };
}
