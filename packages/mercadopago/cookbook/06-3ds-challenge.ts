/**
 * Recipe 06 — 3DS challenge flow with detect → redirect → recover.
 *
 * # Background
 *
 * 3DS (Strong Customer Authentication) is the issuer-side 2FA layer for
 * card payments. MP triggers it automatically when:
 * - The card's issuer requires it (driven by MCC + amount + risk).
 * - The buyer's country mandates it.
 *
 * In Argentina, 3DS is OPTIONAL but strongly recommended for high-value
 * transactions. When triggered, the payment stays in `pending` until the
 * buyer completes the issuer's challenge.
 *
 * # Flow
 *
 * 1. `create_payment` returns `status: "pending"` + `status_detail: "pending_challenge"`
 * 2. Run `analyze_payment_3ds` (or call `analyze3DS(payment)` directly) to extract
 *    the `challengeUrl` from `payment.three_ds_info.external_resource_url`
 * 3. Redirect the buyer to `challengeUrl`
 * 4. Buyer completes the challenge on the issuer's page
 * 5. Issuer redirects buyer back to your `back_url`
 * 6. MP fires a `payment` webhook with the final status (approved/rejected)
 *
 * # Critical
 *
 * Without redirecting to the challenge URL, the payment stays in `pending`
 * INDEFINITELY. This is the most common cause of "stuck" payments.
 */

import { analyze3DS, MercadoPagoClient } from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Create payment + immediately analyze 3DS
// ─────────────────────────────────────────────────────────────────────────────

export async function createPaymentAndCheck3DS(input: {
  amountArs: number;
  cardToken: string;
  payerEmail: string;
  externalReference: string;
}) {
  const payment = await mp.createPayment({
    transactionAmount: input.amountArs,
    paymentMethodId: "visa", // get from list_payment_methods if uncertain
    payerEmail: input.payerEmail,
    token: input.cardToken,
    description: "Compra " + input.externalReference,
    externalReference: input.externalReference,
    installments: 1,
  });

  const threeDs = analyze3DS(payment);

  if (threeDs.status === "challenge_required" && threeDs.challengeUrl) {
    return {
      paymentId: payment.id,
      status: "challenge_required" as const,
      action: "redirect",
      challengeUrl: threeDs.challengeUrl,
      message:
        "Redirigir al comprador a challengeUrl. El pago queda pending hasta que complete el desafío.",
    };
  }

  if (threeDs.status === "rejected") {
    return {
      paymentId: payment.id,
      status: "rejected" as const,
      action: "show_error",
      message: threeDs.description,
    };
  }

  return {
    paymentId: payment.id,
    status: payment.status,
    action: "done",
    message:
      threeDs.status === "frictionless"
        ? "3DS aprobado sin desafiar al comprador."
        : "Pago procesado.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Render the redirect page (Next.js Server Component example)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hypothetical Next.js page that handles the challenge URL redirect:
 *
 * ```tsx
 * // app/checkout/3ds/[paymentId]/page.tsx
 * export default async function ChallengePage({
 *   params: { paymentId },
 * }: { params: { paymentId: string } }) {
 *   const payment = await mp.getPayment(paymentId);
 *   const threeDs = analyze3DS(payment);
 *
 *   if (threeDs.status === "challenge_required" && threeDs.challengeUrl) {
 *     redirect(threeDs.challengeUrl);
 *   }
 *
 *   // If we land here, the challenge is over — show final status.
 *   return <PaymentResultPage paymentId={paymentId} />;
 * }
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Webhook: payment.updated → check final 3DS state
// ─────────────────────────────────────────────────────────────────────────────

export async function on3DSPaymentWebhook(paymentId: string) {
  const payment = await mp.getPayment(paymentId);
  const threeDs = analyze3DS(payment);

  // Possible end states:
  // - approved + frictionless: 3DS was on, buyer wasn't challenged
  // - approved (no 3DS info): 3DS not required, normal payment
  // - rejected (status_detail with "3ds"): authentication failed
  // - approved (after challenge): buyer completed the challenge successfully

  if (payment.status === "approved") {
    // Provision the order
    return { ok: true, threeDs: threeDs.status };
  }
  if (payment.status === "rejected") {
    // Show the user the failure reason; offer alternative payment method
    return { ok: false, reason: threeDs.description };
  }
  // Still pending — webhook will fire again
  return { ok: false, reason: "still pending" };
}
