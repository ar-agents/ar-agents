/**
 * Recipe 16 — ACP checkout with auto-issued AR factura electrónica.
 *
 * The headline pattern that no other implementation in LATAM ships out of the
 * box: a **Stripe-style hosted checkout where the buyer is an LLM agent**
 * (ChatGPT Instant Checkout / Claude tool calls / Gemini extensions), and your
 * server auto-emits AFIP/ARCA factura electrónica when the payment confirms.
 *
 * # The flow
 *
 *   1. Agent POSTs `/checkout/sessions` with cart + buyer info (ACP spec).
 *   2. Bridge validates the cart, computes totals, generates a session id.
 *   3. Bridge creates a Mercado Pago `preference` and stores the mapping
 *      `acp_session → mp_preference` in your KV.
 *   4. Bridge returns the ACP session with the `init_point_url` for the buyer.
 *   5. Buyer pays. MP fires `payment.created` webhook.
 *   6. Bridge's MP webhook handler dispatches to your `facturacionHook`,
 *      which calls `@ar-agents/facturacion` to emit Factura A/B/C/E based on
 *      the buyer's IVA condition (looked up via @ar-agents/identity).
 *   7. ACP `complete_session` returns the factura PDF URL inside the receipt.
 *
 * # Why this is unique
 *
 *   - Stripe's ACP doesn't ship AR factura (Stripe doesn't operate in AR).
 *   - Satsuma.ai's "make-my-site-agent-compatible" SaaS handles the agent
 *     surface but defers tax to the merchant.
 *   - MercadoPago's official MCP exposes payments but no ACP layer.
 *   - This recipe is the only OSS path from "agent buys" to "factura emitted"
 *     without the merchant writing tax-emission code themselves.
 */

import { createDispatcher } from "@ar-agents/agentic-commerce-bridge";
import {
  createMercadoPagoPaymentProvider,
  mercadoPagoPaymentHandler,
} from "@ar-agents/agentic-commerce-bridge/mp";
import {
  createFacturacionHook,
  selectFacturaType,
} from "@ar-agents/agentic-commerce-bridge/facturacion";
import { InMemoryStateAdapter } from "@ar-agents/agentic-commerce-bridge";

import { MercadoPagoClient } from "@ar-agents/mercadopago";
import { WsfeClient } from "@ar-agents/facturacion";

// ─────────────────────────────────────────────────────────────────────────────
// Wire the bridge — payment provider + factura emission hook
// ─────────────────────────────────────────────────────────────────────────────

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

const wsfe = new WsfeClient({
  certPem: process.env.AFIP_CERT_PEM!,
  keyPem: process.env.AFIP_KEY_PEM!,
  cuit: Number(process.env.AFIP_CUIT!),
  env: "prod",
});

// Payment provider: knows how to mint MP preferences from ACP cart payloads.
const mpProvider = createMercadoPagoPaymentProvider({
  client: mp,
  notificationUrl: "https://yourdomain.com/api/mp/webhook",
});

// Facturacion hook: fires after `payment.approved` from MP webhook.
const facturacionHook = createFacturacionHook({
  wsfe,
  defaultPtoVta: 1, // your AFIP point-of-sale
  // Agent decides what to bill against — typically a CUIT lookup result
  // for B2B sales, or "consumidor final" for B2C (Factura B).
  selectType: ({ buyer }) =>
    selectFacturaType({
      sellerCondition: "responsable_inscripto", // your IVA condition
      buyerCondition: buyer.taxStatus ?? "consumidor_final",
    }),
});

// Dispatcher: routes the ACP HTTP surface (checkout-session CRUD).
const dispatcher = createDispatcher({
  state: new InMemoryStateAdapter(), // VercelKVStateAdapter in prod
  payment: mpProvider,
  hooks: { onPaymentApproved: facturacionHook },
});

// ─────────────────────────────────────────────────────────────────────────────
// Next.js Route Handler — the ACP HTTP surface
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request, ctx: { params: { route: string[] } }) {
  // Spec endpoints:
  //   POST   /checkout_sessions               → handleCreateSession
  //   POST   /checkout_sessions/{id}          → handleUpdateSession
  //   POST   /checkout_sessions/{id}/complete → handleCompleteSession
  //   POST   /checkout_sessions/{id}/cancel   → handleCancelSession
  return dispatcher.handle(req);
}

export async function GET(req: Request) {
  // Spec endpoints:
  //   GET    /checkout_sessions/{id}          → handleGetSession
  //   GET    /.well-known/acp.json            → discovery payload
  return dispatcher.handle(req);
}

// ─────────────────────────────────────────────────────────────────────────────
// Companion MP webhook route — fires the facturacion hook
// ─────────────────────────────────────────────────────────────────────────────

export async function MP_WEBHOOK(req: Request) {
  // The bridge's MP integration verifies HMAC signatures and dispatches
  // to your `onPaymentApproved` hook. The hook receives the ACP session
  // (looked up via the external_reference round-trip) + the MP payment.
  return mercadoPagoPaymentHandler({
    state: dispatcher.state,
    hooks: dispatcher.hooks,
    webhookSecret: process.env.MP_WEBHOOK_SECRET!,
  })(req);
}

// ─────────────────────────────────────────────────────────────────────────────
// What an agent sees
// ─────────────────────────────────────────────────────────────────────────────

/*
A ChatGPT Instant Checkout flow (excerpt):

1. Agent calls `POST /checkout_sessions` with:
   {
     "buyer": { "email": "buyer@example.com" },
     "items": [{ "id": "sku-123", "quantity": 1, "amount": 100000 }],
     "totals": { "amount": 100000, "currency": "ars", ... },
     "fulfillment_address": { ... }
   }

2. Bridge returns:
   {
     "id": "cs_abc123",
     "status": "ready_for_payment",
     "payment_method": {
       "type": "redirect",
       "redirect_url": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=…"
     }
   }

3. Buyer pays. MP fires webhook → facturacionHook fires → AFIP returns CAE.

4. Agent calls `POST /checkout_sessions/cs_abc123/complete`:
   {
     "id": "cs_abc123",
     "status": "complete",
     "receipt": {
       "payment_id": "mp-payment-id",
       "factura": {
         "type": "B",
         "cae": "75123456789012",
         "cae_due": "2026-05-18",
         "pdf_url": "https://yourdomain.com/facturas/cs_abc123.pdf",
         "amount": 100000,
         "issued_at": "2026-05-08T19:00:00Z"
       }
     }
   }

The agent surfaces the factura URL to the buyer in its receipt rendering.
The merchant did zero tax-emission code — the bridge handled it.
*/
