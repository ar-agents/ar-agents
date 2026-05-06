/**
 * Recipe 07 — Auth-only Order with manual capture (ride-share / hotel pattern).
 *
 * # Use case
 *
 * You want to ESTIMATE the final amount upfront (e.g., taxi ride: max
 * possible cost) but only CAPTURE the actual amount once the service
 * completes. This is the "preauthorization + capture" pattern used by:
 *
 * - Ride-share: authorize at trip start, capture exact amount at end
 * - Hotels: authorize for full stay at check-in, capture nightly
 * - Marketplaces with delivery: authorize at order, capture at delivery
 *
 * # Flow
 *
 * 1. Buyer pays via your app — but it's an Order with `capture_mode: "manual"`
 * 2. The funds are HELD on the buyer's card (auth-only) — they see it as
 *    a pending charge
 * 3. When the service completes, you call `capture_order(order_id, amount)`
 *    with the FINAL amount (≤ the originally authorized amount)
 * 4. If you don't capture within 7 days, the auth expires automatically
 *    (funds released to the buyer)
 * 5. To cancel before capture: `cancel_order(order_id)` releases the auth
 *
 * # Why Order instead of Payment?
 *
 * - Order has explicit lifecycle (created → action_required → processed/canceled)
 * - Order can aggregate multiple Payments (partial captures, retries)
 * - Order is MP's modern API for new flows
 *
 * Use Preference (Checkout Pro) when you just need a hosted pay-link.
 * Use Order when you need this auth-only or multi-payment-per-order semantics.
 */

import {
  explainPaymentStatus,
  MercadoPagoClient,
} from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Create the auth-only Order at "service start"
// ─────────────────────────────────────────────────────────────────────────────

export async function authorizeRideStart(input: {
  rideId: string;
  buyerEmail: string;
  estimatedMaxArs: number; // upper bound — what you can capture up to
}) {
  const order = await mp.createOrder({
    type: "online",
    currency_id: "ARS",
    total_amount: input.estimatedMaxArs,
    external_reference: input.rideId,
    capture_mode: "manual", // <-- THE KEY FIELD
    payer: { email: input.buyerEmail },
    notification_url: "https://yourapp.com/api/mp/webhook",
  });

  return {
    orderId: order.id,
    status: order.status, // "action_required"
    note: "Funds authorized but not captured. Capture within 7 days or auth expires.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Capture the exact final amount when service completes
// ─────────────────────────────────────────────────────────────────────────────

export async function captureRideOnComplete(input: {
  orderId: string;
  finalAmountArs: number; // must be ≤ originally authorized amount
}) {
  const captured = await mp.captureOrder(input.orderId, input.finalAmountArs);

  if (captured.status !== "processed") {
    // Capture didn't succeed — surface the reason
    throw new Error(
      `Capture failed: status=${captured.status}, status_detail=${captured.status_detail}`,
    );
  }

  return {
    orderId: captured.id,
    capturedAmount: input.finalAmountArs,
    status: "captured",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Cancel before capture (e.g., buyer cancels the trip)
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelRide(input: { orderId: string }) {
  const canceled = await mp.cancelOrder(input.orderId);
  return {
    orderId: canceled.id,
    status: canceled.status, // "canceled"
    note: "Auth released. Buyer's card is no longer hold.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Recovery: handle a stuck Order (rare but real)
// ─────────────────────────────────────────────────────────────────────────────

export async function checkOrderHealth(orderId: string) {
  const order = await mp.getOrder(orderId);

  // If the underlying payment was rejected, surface why
  const transactions = (order as { transactions?: { payments?: Array<{ id: string }> } }).transactions;
  if (transactions?.payments && transactions.payments.length > 0) {
    const lastPayment = await mp.getPayment(String(transactions.payments[0]!.id));
    const explanation = explainPaymentStatus(lastPayment);
    return {
      orderStatus: order.status,
      paymentStatus: lastPayment.status,
      explanation,
    };
  }

  return { orderStatus: order.status };
}
