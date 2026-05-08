# 01 — ChatGPT → MercadoLibre via the bridge

Wire your bridge instance to a real MercadoLibre seller account so ACP
clients (ChatGPT Instant Checkout, Claude, Gemini, Walmart Sparky) can
discover products and check out.

## 1. Set up ACP discovery

Mount the catch-all under `/api/acp/[...slug]/route.ts` (Next.js App
Router). Add a `/.well-known/acp.json` route that returns
`facilitator.discoveryPayload()`. ChatGPT and friends fetch this first.

The payload publicly advertises:

- `protocol.version`: `2026-04-17`
- `protocol.supported_versions`: the rolling window your bridge accepts
- `transports: ["rest"]`
- `capabilities.services: ["checkout"]` (add `"orders"` if you implement
  the optional orders surface)
- `capabilities.intervention_types`: `3ds`, `address_verification`, etc.
- `capabilities.supported_currencies`: `["ars", "brl", "usd", ...]`
- `capabilities.supported_locales`: `["es-AR", "pt-BR", ...]`

## 2. Replace the demo catalog with `createMeliCatalogProvider`

```ts
import { createMeliCatalogProvider } from "@ar-agents/agentic-commerce-bridge";

const meliCatalog = createMeliCatalogProvider({
  // The simplest implementation — public MELI item lookup, no OAuth required
  // for read.
  getItem: async (id) => {
    const r = await fetch(`https://api.mercadolibre.com/items/${id}`);
    if (!r.ok) return null;
    return r.json();
  },
  acceptedCurrencies: ["ars"], // restrict to AR sellers
});
```

For private items or higher rate limits, swap the bare `fetch` for an
authenticated MELI client (per-seller OAuth).

## 3. Wire MP as the payment provider

```ts
const mp = createMercadoPagoPaymentProvider({
  createPreference: (payload) => mpFetch("/checkout/preferences", { body: payload }),
  lookupPayment: (id) => mpFetch(`/v1/payments/${id}`),
});
```

`mpFetch` is your thin auth wrapper using `process.env.MP_ACCESS_TOKEN`.

## 4. Build the agent-facing capability list

```ts
import { mercadoPagoPaymentHandler } from "@ar-agents/agentic-commerce-bridge";

const facilitator = createFacilitator({
  state, catalog: meliCatalog,
  paymentProviders: { [mp.handlerId]: mp },
  paymentHandlers: [mercadoPagoPaymentHandler({ environment: "production" })],
  webhookSecret: process.env.ACP_WEBHOOK_SECRET!,
  defaultLinks: [
    { type: "terms_of_use", url: "https://yoursite.example/terms" },
    { type: "privacy_policy", url: "https://yoursite.example/privacy" },
    { type: "shipping_policy", url: "https://yoursite.example/shipping" },
  ],
});
```

## 5. Subscribe to MP webhooks

In MP dev panel, set webhook URL to `https://yoursite.example/api/webhook/mercadopago`.

Implement that route to:

1. Verify MP HMAC-SHA256 signature (use `@ar-agents/mercadopago`'s
   `verifyWebhookSignature`).
2. Call `buildAcpEventFromMpWebhook(payload, { lookupPayment, loadOrder })`
   from `@ar-agents/agentic-commerce-bridge` to translate to an ACP
   `order_update` event.
3. Sign the resulting event with `signWebhook({ secret: ACP_WEBHOOK_SECRET, ... })`.
4. POST to the agent's registered webhook URL.

This relays MP payment status changes (`approved`, `refunded`,
`charged_back`) to the agent so it can update the buyer.

## 6. Test discovery from a real agent

```bash
curl https://yoursite.example/.well-known/acp.json
```

The agent should see `protocol: { name: "acp", version: "2026-04-17" }`,
your supported currencies, and the registered MercadoPago payment handler.
That's enough for the agent to construct a valid `POST /checkout_sessions`
request.

## 7. End-to-end

The full flow ChatGPT will exercise:

```
GET  /.well-known/acp.json
POST /api/acp/checkout_sessions             { line_items, currency, buyer }
  ← 201 with ACP CheckoutSession + capabilities + checkout url
[user pays via MP redirect or via SPT-style direct flow]
POST /api/acp/checkout_sessions/{id}/complete  { payment_data }
  ← 200 with CheckoutSessionWithOrder
[merchant emits webhook order_create signed with ACP_WEBHOOK_SECRET]
[agent receives webhook, displays receipt to user]
```

Pair with [02 — ARCA factura](./02-arca-factura.md) to add automatic
electronic invoicing on every order.
