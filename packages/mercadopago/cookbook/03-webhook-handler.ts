/**
 * Recipe 03 — Production-grade webhook handler.
 *
 * # The 3-line summary
 *
 * - Verify HMAC-SHA256 signature → reject with 401 if invalid (replay protection included)
 * - Parse the event (topic + dataId) from query/body (MP sends in both)
 * - Auto-fetch the underlying resource (Payment / Preapproval / Order)
 * - Dispatch by topic to your business logic
 *
 * Without HMAC verify, ANYONE can POST to your webhook URL and forge
 * payments/cancellations. The lib's `verifyWebhookSignature` rejects
 * stale signatures (>5min old) too — replay attack protection.
 *
 * # Why use the agent's `handle_webhook` tool vs calling primitives manually
 *
 * The tool consolidates verify + parse + auto-fetch + dispatch into one
 * call. Saves ~30 lines per webhook handler vs the manual chain.
 *
 * # Edge Runtime
 *
 * This recipe is fully Edge-compatible. Webhook handlers benefit from Edge
 * (lower cold-start = faster MP-acked, fewer 500s during traffic spikes).
 */

import {
  MercadoPagoClient,
  parseWebhookEvent,
  verifyWebhookSignature,
} from "@ar-agents/mercadopago";

export const runtime = "edge";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET!;

// ─────────────────────────────────────────────────────────────────────────────
// Approach A — Manual primitives (more control, more code)
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // 1. Read the RAW body — DO NOT use req.json() before HMAC verify, as
  //    JSON.stringify changes whitespace and breaks the signature.
  const rawBody = await req.text();

  const signatureHeader = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id");
  const url = new URL(req.url);

  // 2. Parse the event from body or query (MP sends in both).
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return new Response("invalid JSON", { status: 400 });
  }
  const event = parseWebhookEvent(parsedBody, url.searchParams);
  if (!event) {
    return new Response("unrecognized webhook shape", { status: 400 });
  }

  // 3. Verify HMAC + replay-tolerance window.
  const verified = await verifyWebhookSignature({
    requestId,
    dataId: event.dataId,
    signatureHeader,
    secret: WEBHOOK_SECRET,
  });
  if (!verified) {
    return new Response("unauthorized", { status: 401 });
  }

  // 4. Dispatch by topic.
  try {
    switch (event.topic) {
      case "payment":
      case "payment.created":
      case "payment.updated": {
        const payment = await mp.getPayment(event.dataId);
        await handlePayment(payment);
        break;
      }
      case "subscription_preapproval":
      case "preapproval": {
        const sub = await mp.getPreapproval(event.dataId);
        await handleSubscription(sub);
        break;
      }
      case "subscription_authorized_payment": {
        // The dataId IS the authorized_payment id — list under parent
        // preapproval to get full context.
        await handleRecurringCharge(event.dataId);
        break;
      }
      case "merchant_order": {
        const mo = await mp.getMerchantOrder(event.dataId);
        await handleMerchantOrder(mo);
        break;
      }
      case "point_integration_wh": {
        const intent = await mp.getPointPaymentIntent(event.dataId);
        await handlePointPaymentIntent(intent);
        break;
      }
      default:
        // Unknown topic — log and acknowledge so MP doesn't retry forever.
        console.warn(`Unhandled webhook topic: ${event.topic}`);
    }
  } catch (err) {
    // Return 5xx so MP retries (it has built-in exponential backoff).
    console.error("webhook handler failed:", err);
    return new Response("internal error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Approach B — Agent tool (let the agent dispatch)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Alternative: pass everything to an agent + the `handle_webhook` tool.
 * Useful when your business logic varies by webhook content and an LLM
 * makes the decision (e.g., "if this payment is for an old SKU, refund it").
 *
 * Note: this is HIGHER LATENCY than approach A and uses LLM tokens. Only
 * use when LLM reasoning is genuinely required.
 */
// export async function POST_via_agent(req: Request) {
//   const rawBody = await req.text();
//   const result = await agent.generate({
//     prompt: `Procesá este webhook de MP. Topic + body:\n${rawBody}`,
//     toolChoice: "required",
//     tools: mercadoPagoTools(mp, {
//       state, backUrl, webhookSecret: WEBHOOK_SECRET, oauth: {...}
//     }),
//   });
// }

// ─────────────────────────────────────────────────────────────────────────────
// Business logic stubs
// ─────────────────────────────────────────────────────────────────────────────

async function handlePayment(payment: unknown) {
  // Update your DB, fire shipping flow, send notification, etc.
}
async function handleSubscription(sub: unknown) {
  /* ... */
}
async function handleRecurringCharge(authorizedPaymentId: string) {
  /* ... */
}
async function handleMerchantOrder(mo: unknown) {
  /* ... */
}
async function handlePointPaymentIntent(intent: unknown) {
  /* ... */
}
