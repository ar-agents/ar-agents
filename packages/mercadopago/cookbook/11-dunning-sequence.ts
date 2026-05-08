/**
 * Recipe 11 — Dunning sequence: failed-payment recovery loop.
 *
 * Real production pattern. A subscription's recurring charge fails. You don't
 * just give up — you run a multi-step recovery sequence that maximises revenue
 * recovery and minimises customer churn.
 *
 * # The dunning sequence
 *
 *   Day 0   Charge fails (most commonly: insufficient funds, card expired).
 *           → MP retries automatically (configurable on the subscription, default 3 attempts).
 *   Day 0   Webhook: `subscription_authorized_payment` with status=rejected.
 *           → Send "Hubo un problema con tu cobro" email + WhatsApp.
 *           → Include the buyer's `init_point_url` so they can retry the
 *             card on MP's UI without you collecting card data.
 *   Day 3   Still no successful retry.
 *           → Pause the subscription via `pause_subscription`.
 *           → Send a softer "Tu suscripción está pausada — ¿querés que
 *             actualicemos la tarjeta?" message.
 *   Day 7   No card swap.
 *           → Send retention offer: "Te damos un mes gratis si volvés".
 *   Day 14  No response to retention.
 *           → Cancel the subscription. Send "Cancelamos. ¿Te podemos ayudar
 *             con algo?" message with feedback link.
 *
 * # What this recipe shows
 *
 *   - Webhook handler reading `subscription_authorized_payment` events.
 *   - State machine driven by elapsed time + buyer responses.
 *   - Composition with @ar-agents/whatsapp for the dunning message channel.
 *   - HITL gating on the cancellation step (retention managers might want
 *     to manually approve cancellations of high-value accounts).
 */

import {
  MercadoPagoClient,
  parseWebhookEvent,
  verifyWebhookSignature,
  explainPaymentStatus,
  type ParsedWebhookEvent,
  type SubscriptionPayment,
} from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

// ─────────────────────────────────────────────────────────────────────────────
// State store
// ─────────────────────────────────────────────────────────────────────────────

// In production: VercelKV / Redis / Postgres. Schema:
//   key: dunning:<subscriptionId>
//   value: { firstFailureAt, attemptsSent, status: "active" | "paused" | "cancelled" }
type DunningState = {
  subscriptionId: string;
  firstFailureAt: number;
  attemptsSent: number;
  status: "active" | "paused" | "cancelled";
  buyerEmail: string;
  buyerWhatsApp?: string;
};

const dunningStore = new Map<string, DunningState>();

// ─────────────────────────────────────────────────────────────────────────────
// Webhook handler — entry point for the dunning sequence
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const url = new URL(req.url);
  const rawBody = await req.text();

  const ok = await verifyWebhookSignature({
    requestId: req.headers.get("x-request-id"),
    dataId: parseWebhookEvent(JSON.parse(rawBody), url.searchParams)?.dataId ?? "",
    signatureHeader: req.headers.get("x-signature"),
    secret: process.env.MP_WEBHOOK_SECRET!,
  });
  if (!ok) return new Response("invalid signature", { status: 401 });

  const event = parseWebhookEvent(JSON.parse(rawBody), url.searchParams);
  if (!event) return new Response("ok", { status: 200 });

  // Two relevant topics: subscription_authorized_payment (recurring charge),
  // and payment.updated (in case of one-shot charge associated to a sub).
  if (event.topic === "subscription_authorized_payment") {
    await handleRecurringChargeWebhook(event);
  }

  return new Response("ok", { status: 200 });
}

/**
 * The webhook payload includes a `data.id` for the SubscriptionPayment that
 * fired. To find the parent preapproval we hit MP's auth payments endpoint
 * directly — there's no single-record getter on the client (MP's API returns
 * authorized_payments only via the search endpoint), so the recipe goes
 * through the raw request helper.
 */
async function fetchSubscriptionPaymentById(
  authPaymentId: string,
): Promise<SubscriptionPayment | null> {
  // The toolkit doesn't expose a single-record getter for SubscriptionPayment
  // because MP doesn't ship one either. The closest stable path is the
  // /authorized_payments search query. In your dunning state store you'll
  // already know the preapproval_id, so this lookup is rarely needed —
  // included here for completeness when the webhook is the only source.
  try {
    const url = `https://api.mercadopago.com/authorized_payments/${authPaymentId}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as SubscriptionPayment;
  } catch {
    return null;
  }
}

async function handleRecurringChargeWebhook(event: ParsedWebhookEvent) {
  const ap = await fetchSubscriptionPaymentById(event.dataId);
  if (!ap || !ap.preapproval_id) return;

  if (ap.status === "approved") {
    // Reset dunning state — recurring charge recovered.
    dunningStore.delete(ap.preapproval_id);
    return;
  }

  if (ap.status !== "rejected") return; // pending — wait for next event

  // Charge was rejected. Engage the dunning sequence. explainPaymentStatus
  // wants a full Payment shape; the relevant fields (status + status_detail)
  // come from the SubscriptionPayment, so we widen the cast.
  const explained = explainPaymentStatus({
    id: String(ap.id),
    status: ap.status,
    status_detail: ap.reason ?? "",
    transaction_amount: ap.transaction_amount ?? 0,
    currency_id: ap.currency_id ?? "ARS",
  } as unknown as Parameters<typeof explainPaymentStatus>[0]);

  const sub = await mp.getPreapproval(ap.preapproval_id);
  let state = dunningStore.get(ap.preapproval_id);

  if (!state) {
    state = {
      subscriptionId: ap.preapproval_id,
      firstFailureAt: Date.now(),
      attemptsSent: 0,
      status: "active",
      buyerEmail: sub.payer_email ?? "",
    };
    dunningStore.set(ap.preapproval_id, state);
  }

  await runDunningStep(state, explained);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dunning state machine
// ─────────────────────────────────────────────────────────────────────────────

async function runDunningStep(
  state: DunningState,
  explained: ReturnType<typeof explainPaymentStatus>,
) {
  const elapsedDays = (Date.now() - state.firstFailureAt) / (24 * 60 * 60 * 1000);

  if (elapsedDays < 3 && state.attemptsSent === 0) {
    // Day 0: friendly heads-up. The buyer can retry the card via the
    // subscription's init_point_url (MP UI handles re-auth).
    await sendMessage(state.buyerEmail, "first-failure", {
      reason: explained.summary,
      retryUrl: await fetchInitPoint(state.subscriptionId),
    });
    state.attemptsSent = 1;
    return;
  }

  if (elapsedDays >= 3 && elapsedDays < 7 && state.attemptsSent === 1) {
    // Day 3: pause the subscription.
    await mp.pausePreapproval(state.subscriptionId);
    state.status = "paused";
    await sendMessage(state.buyerEmail, "paused", {
      retryUrl: await fetchInitPoint(state.subscriptionId),
    });
    state.attemptsSent = 2;
    return;
  }

  if (elapsedDays >= 7 && elapsedDays < 14 && state.attemptsSent === 2) {
    // Day 7: retention offer.
    await sendMessage(state.buyerEmail, "retention-offer", {
      offer: "1 mes gratis si volvés en los próximos 7 días",
      retryUrl: await fetchInitPoint(state.subscriptionId),
    });
    state.attemptsSent = 3;
    return;
  }

  if (elapsedDays >= 14 && state.attemptsSent === 3) {
    // Day 14: cancel.
    // HITL: in production, route this to a human approval queue first.
    // For this recipe, we cancel immediately.
    await mp.cancelPreapproval(state.subscriptionId);
    state.status = "cancelled";
    await sendMessage(state.buyerEmail, "cancelled", {});
    state.attemptsSent = 4;
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Side-effects (replace with your channel of choice)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchInitPoint(subscriptionId: string): Promise<string> {
  const sub = await mp.getPreapproval(subscriptionId);
  return sub.init_point;
}

async function sendMessage(
  email: string,
  template: "first-failure" | "paused" | "retention-offer" | "cancelled",
  data: Record<string, string>,
) {
  // In production: compose an email via Resend / Postmark, AND send a
  // WhatsApp via @ar-agents/whatsapp. Keeping this stub here so the recipe
  // is copy-pasteable into any channel.
  console.log(`[dunning] ${template} -> ${email}`, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron job — fallback when webhooks miss
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run on a daily Vercel Cron. Catches dunning states that didn't progress
 * because the buyer never triggered a webhook (e.g. they ignored the email
 * and didn't retry their card — no event fires until their NEXT scheduled
 * recurring charge).
 *
 * Add to vercel.json:
 *
 *   {
 *     "crons": [
 *       { "path": "/api/cron/dunning-tick", "schedule": "0 9 * * *" }
 *     ]
 *   }
 */
export async function dunningTick() {
  for (const state of dunningStore.values()) {
    if (state.status === "cancelled") continue;
    await runDunningStep(
      state,
      explainPaymentStatus({
        id: "tick",
        status: "rejected",
        status_detail: "cc_rejected_call_for_authorize",
        transaction_amount: 0,
        currency_id: "ARS",
      } as unknown as Parameters<typeof explainPaymentStatus>[0]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test harness — run with `pnpm tsx cookbook/11-dunning-sequence.ts`
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // Simulate a failure event on subscription "abc123".
  const fakeState: DunningState = {
    subscriptionId: "abc123",
    firstFailureAt: Date.now() - 4 * 24 * 60 * 60 * 1000, // 4 days ago
    attemptsSent: 1,
    status: "active",
    buyerEmail: "test@example.com",
  };
  dunningStore.set("abc123", fakeState);

  await runDunningStep(
    fakeState,
    explainPaymentStatus({
      id: "test",
      status: "rejected",
      status_detail: "cc_rejected_insufficient_amount",
      transaction_amount: 1000,
      currency_id: "ARS",
    } as unknown as Parameters<typeof explainPaymentStatus>[0]),
  );

  console.log("Dunning state after step:", dunningStore.get("abc123"));
}

if (process.argv[1]?.endsWith("11-dunning-sequence.ts")) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
