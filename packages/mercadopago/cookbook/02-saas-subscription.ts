/**
 * Recipe 02 — SaaS subscription with reusable plan + first payment + card swap.
 *
 * # Pattern
 *
 * **One-time setup**: create a `Plan` (price + frequency) — re-use across customers.
 *
 * **Per-customer**:
 * 1. `subscribe_to_plan` → returns init_point for first-payment authorization
 * 2. Buyer pays first installment with card+CVV (MP requirement, can't bypass)
 * 3. `subscription_preapproval` webhook fires → status flips to `authorized`
 * 4. MP auto-charges at the configured frequency thereafter
 *
 * **Card swap on failure** (when buyer's card expires):
 * - You receive a `subscription_authorized_payment` webhook with rejection
 * - Generate a fresh card token via MP frontend SDK on the buyer's side
 * - Call `update_subscription({ card_token_id })` to swap without recreating
 *
 * # When to use
 *
 * - Monthly/quarterly SaaS billing (Básico/Pro/Enterprise tiers)
 * - You want one Plan definition shared across all subscribers
 * - You need the option to update price for new subscribers without
 *   touching existing ones
 */

import {
  InMemoryStateAdapter,
  MercadoPagoClient,
} from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

const state = new InMemoryStateAdapter();
// In production, swap for VercelKVSubscriptionStateAdapter:
// import { VercelKVSubscriptionStateAdapter } from "@ar-agents/mercadopago/vercel-kv";
// const state = new VercelKVSubscriptionStateAdapter();

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — One-time setup: create the plan
// ─────────────────────────────────────────────────────────────────────────────

export async function createPlanProMonthly() {
  const plan = await mp.createSubscriptionPlan({
    reason: "Plan Pro mensual",
    backUrl: "https://yourapp.com/subscription-result",
    frequency: 1,
    frequencyType: "months",
    amount: 25_000,
    currency: "ARS",
  });
  return plan; // persist plan.id in your DB
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Per-customer: subscribe to the plan
// ─────────────────────────────────────────────────────────────────────────────

export async function subscribeUserToProPlan(input: {
  planId: string;
  customerEmail: string;
  externalReference: string; // your-system user id
}) {
  const sub = await mp.subscribeToPlan({
    planId: input.planId,
    payerEmail: input.customerEmail,
    externalReference: input.externalReference,
  });

  // Persist locally for fast lookups + webhook routing
  await state.set(sub.id, {
    payerEmail: input.customerEmail,
    initPoint: sub.init_point,
    externalReference: input.externalReference,
    createdAt: new Date().toISOString(),
    status: sub.status,
  });

  return {
    subscriptionId: sub.id,
    initPoint: sub.init_point,
    nextStep:
      "Send init_point to the customer. They must complete the first payment with card+CVV. Listen for subscription_preapproval webhook to confirm activation.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Webhook: subscription_preapproval activation
// ─────────────────────────────────────────────────────────────────────────────

export async function handlePreapprovalWebhook(subscriptionId: string) {
  const sub = await mp.getPreapproval(subscriptionId);
  await state.set(sub.id, {
    status: sub.status,
    lastWebhookStatus: sub.status,
    lastWebhookAt: new Date().toISOString(),
  });
  if (sub.status === "authorized") {
    // First payment cleared — provision the user's plan in your DB
    // await db.users.update({ where: { externalReference: sub.external_reference }, data: { plan: "pro", status: "active" } });
  }
  return sub;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Card swap (when buyer's card is rejected on a recurring charge)
// ─────────────────────────────────────────────────────────────────────────────

export async function swapCardOnSubscription(input: {
  subscriptionId: string;
  newCardToken: string; // from MP frontend SDK / Cardform on buyer's side
}) {
  const sub = await mp.updatePreapproval(input.subscriptionId, {
    card_token_id: input.newCardToken,
  });
  await state.set(sub.id, {
    status: sub.status,
    lastWebhookStatus: "card_swapped",
    lastWebhookAt: new Date().toISOString(),
  });
  return sub;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Cancel
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelSubscription(subscriptionId: string) {
  const sub = await mp.cancelPreapproval(subscriptionId);
  await state.set(sub.id, {
    status: sub.status,
    cancelledAt: new Date().toISOString(),
  });
  return sub;
}
