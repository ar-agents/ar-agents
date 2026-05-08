# @ar-agents/agentic-commerce-bridge

> The first open-source merchant facilitator for the **Agentic Commerce
> Protocol (ACP)** in LATAM. Bridges ChatGPT Instant Checkout, Claude,
> Gemini, and other agentic-commerce clients to **MercadoPago** + **MercadoLibre**,
> with **AR-fiscal compliance** (auto-issued AFIP/ARCA Factura A/B/C/E) baked in.

[![CI](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/ar-agents/ar-agents/actions)
[![npm](https://img.shields.io/npm/v/@ar-agents/agentic-commerce-bridge?label=%40ar-agents%2Fagentic-commerce-bridge)](https://www.npmjs.com/package/@ar-agents/agentic-commerce-bridge)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-160%20passing-green)](#tests)

```bash
pnpm add @ar-agents/agentic-commerce-bridge zod
```

## What it is

ACP, [maintained by OpenAI + Stripe](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol),
defines how AI agents talk to merchants on behalf of users:
discover products, build a cart, finalize a checkout, settle payment, and
confirm fulfillment — all over a small REST surface (5 endpoints +
`/.well-known/acp.json` discovery) with HMAC-signed webhooks.

Today, when ChatGPT or Claude wants to buy something from a LATAM seller,
**there is no on-ramp**: MercadoLibre and MercadoPago don't ship ACP
endpoints; the official MELI/MP MCP servers expose only documentation
search. This package fills that gap. It's a **drop-in facilitator** that:

- Implements all 5 ACP `2026-04-17` endpoints + discovery
- Signs and verifies webhooks per spec (HMAC-SHA256, `Merchant-Signature`)
- Enforces idempotency (`Idempotency-Key`, replay detection, conflict)
- Negotiates ACP versions (rejects unsupported, surfaces `supported_versions`)
- Plugs into MercadoPago checkout (preference creation + payment lookup
  + webhook bridge)
- Plugs into MercadoLibre catalog (item lookup + UCP-style feed)
- **Auto-issues AR-fiscal Factura A/B/C/E** via AFIP WSFE on order
  confirmation, embedding the CAE in the order metadata
- Runs on Edge Runtime (WebCrypto-only, no Node-only imports)
- Pluggable state adapter — `InMemoryStateAdapter` for dev, `VercelKVStateAdapter`
  for production, BYO for anything else

## Why now

| Standard | Status (2026-05) | LATAM coverage |
|---|---|---|
| **ACP** (OpenAI + Stripe) | Production at ChatGPT Instant Checkout | None |
| **UCP** (Google + Shopify + Amazon + Microsoft + Stripe) | NRF 2026 launch | None |
| **AP2** (Google → FIDO Alliance) | v0.2 + FIDO donation Apr 2026 | None |
| **Visa Trusted Agent Protocol** | Pilots in AR/BR/CL/MX/UY | MercadoPago absent |
| **Mastercard Agent Pay LATAM** | Live transactions Mar 2026 | MercadoPago absent |
| **x402** (Coinbase + Stripe + Cloudflare) | 169M txns | None |

When ChatGPT Shopping expands into LATAM (Q3-Q4 2026 per OpenAI partner
trajectory), MELI sellers without an ACP bridge will be **invisible** to
agent-driven commerce. Stripe is positioning to ship LATAM ACP in 12-18
months; this package gives you a head start, on open-source terms.

## Quickstart

```ts
import {
  createFacilitator,
  InMemoryStateAdapter,
  createMercadoPagoPaymentProvider,
  mercadoPagoPaymentHandler,
  createMeliCatalogProvider,
  createFacturacionHook,
} from "@ar-agents/agentic-commerce-bridge";
// You bring your own MELI + MP + AFIP clients (or use ar-agents siblings):
import { mlClient } from "./meli-client";
import { mpClient } from "./mp-client";
import { wsfeClient, arcaPadron } from "./afip-client";

const mp = createMercadoPagoPaymentProvider({
  createPreference: (p) => mpClient.preferences.create({ body: p }),
  lookupPayment:    (id) => mpClient.payments.get({ id }),
});

const facilitator = createFacilitator({
  state: new InMemoryStateAdapter(),
  catalog: createMeliCatalogProvider({
    getItem: (id) => mlClient.items.get(id),
  }),
  paymentProviders: { [mp.handlerId]: mp },
  paymentHandlers: [mercadoPagoPaymentHandler({})],
  webhookSecret: process.env.ACP_WEBHOOK_SECRET,
  hooks: createFacturacionHook({
    seller: {
      cuit: "20417581015",
      punto_venta: 1,
      regime: "monotributo",
      legal_name: "Naza Clemente",
    },
    wsfe: wsfeClient,
    arcaPadronLookup: arcaPadron.lookup,
  }),
});

// Next.js App Router catch-all route:
//   app/api/acp/[...slug]/route.ts
export async function POST(req: Request, ctx: { params: { slug: string[] } }) {
  const acpResponse = await facilitator.dispatch({
    method: "POST",
    path: "/" + ctx.params.slug.join("/"),
    headers: Object.fromEntries(req.headers.entries()),
    rawBody: await req.text(),
  });
  return new Response(JSON.stringify(acpResponse.body), {
    status: acpResponse.status,
    headers: acpResponse.headers,
  });
}
```

That's it. Your store is now ACP-discoverable from any agent that follows the
spec. ChatGPT, Claude, Gemini, Walmart Sparky, Microsoft Copilot, and any
Vercel AI SDK agent can transact against you.

## What ships

| Module | Purpose |
|---|---|
| `schemas/*` | Zod schemas for every ACP `2026-04-17` shape — CheckoutSession, LineItem, Buyer, Address, FulfillmentOption (4 variants), PaymentData, Order, Cart, Capabilities, Discount, Webhook, Error |
| `webhook` | `signWebhook` / `verifyWebhook` — HMAC-SHA256, `Merchant-Signature: t=<unix>,v1=<64hex>`, 300s tolerance per spec |
| `idempotency` | `Idempotency-Key` validation + body-hash + state interface |
| `state` | `InMemoryStateAdapter` (dev) + `StateAdapter` interface |
| `vercel-kv` (subpath) | `VercelKVStateAdapter` — Redis-shape adapter (Vercel KV / Upstash / ioredis duck-typed) |
| `version` | API version negotiation (`API-Version` header) |
| `handlers/*` | The 5 ACP endpoint handlers + discovery + dispatcher + facilitator factory |
| `integrations/mp` | `createMercadoPagoPaymentProvider` + `sessionToPreferencePayload` + payment-handler declaration |
| `integrations/mp-webhook` | `parseMpPaymentIdFromWebhook`, `mpStatusToAcpOrderStatus`, `buildAcpEventFromMpWebhook` — translate MP notifications → ACP webhooks |
| `integrations/meli` | `createMeliCatalogProvider` + `buildMeliFeed` (UCP-compatible) + `meliItemToFeedProduct` |
| `integrations/facturacion` | `createFacturacionHook` — auto-emit Factura A/B/C/E via AFIP WSFE on order confirmation |
| `totals` | `buildLineItemTotals`, `buildOrderTotals`, helpers for fulfillment + tax + discount rollups |
| `ids` | `generateSessionId`, `generateOrderId`, `generateCartId` (UUID-backed) |

## ACP endpoints implemented

| Method | Path | Status |
|---|---|---|
| `POST` | `/checkout_sessions` | ✅ |
| `POST` | `/checkout_sessions/{id}` | ✅ (update) |
| `GET` | `/checkout_sessions/{id}` | ✅ |
| `POST` | `/checkout_sessions/{id}/complete` | ✅ |
| `POST` | `/checkout_sessions/{id}/cancel` | ✅ |
| `GET` | `/.well-known/acp.json` | ✅ (discovery, RFC 8615) |

Per-spec features:
- `Idempotency-Key` mandatory on POSTs, replay detection (`Idempotent-Replayed: "true"`),
  in-flight (`409` + `Retry-After`), and body-hash conflict (`422 idempotency_conflict`).
- `API-Version` header negotiation; rejects unsupported with
  `supported_versions` echo.
- Cached responses for replay across restarts (when using `VercelKVStateAdapter`).
- Catalog / payment / fulfillment hooks — fully framework-agnostic.

## AR-fiscal compliance — the moat

`createFacturacionHook` is the unique-to-LATAM piece. When an ACP order
completes:

1. The buyer's IVA condition is resolved either explicitly (host-supplied
   `resolveBuyer`) or automatically via ARCA padrón lookup
   (`@ar-agents/identity`'s `ws_sr_constancia_inscripcion`).
2. The factura type is selected from a normative matrix:

   | Seller regime | Buyer condition | Factura |
   |---|---|---|
   | `monotributo` | any | **C** |
   | `responsable_inscripto` | `responsable_inscripto` / `monotributista` | **A** |
   | `responsable_inscripto` | `consumidor_final` / other | **B** |
   | any | `extranjero` (cross-border) | **E** |

3. WSFE `solicitarCAE` is invoked with the correct totals + IVA
   breakdown (21% default for RI, 0% for monotributo Factura C).
4. The CAE, vencimiento, número, and IVA breakdown are embedded in
   `Order.metadata`:

   ```json
   {
     "factura_type": "C",
     "factura_cae": "70123456789012",
     "factura_cae_vencimiento": "20260520",
     "factura_numero": 42,
     "factura_punto_venta": 1,
     "factura_cuit_emisor": "20417581015",
     "factura_importe_total": 1210,
     "factura_importe_iva": 0,
     "factura_importe_neto": 1210
   }
   ```

5. If WSFE rejects or padron lookup fails, the order **still persists**
   (payment was already authorized) — the error is captured in
   `metadata.factura_error` so the seller can re-emit out-of-band.

No competitor in the LATAM ACP/UCP/AP2 space ships this. Stripe Tax
doesn't cover Argentine fiscal nuance and won't.

## How it compares

|  | This package | Stripe ACP | Shopify Storefront ACP | MELI/MP MCP (official) |
|---|:---:|:---:|:---:|:---:|
| ACP `2026-04-17` schemas | ✅ | ✅ | partial | n/a (docs-only) |
| Hosted-agent on Edge Runtime | ✅ | ✅ | ✅ | n/a |
| Webhook HMAC + replay protection | ✅ | ✅ | ✅ | n/a |
| MercadoPago bridge | ✅ | ❌ | ❌ | partial |
| MercadoLibre catalog | ✅ | ❌ | ❌ | partial |
| AR-fiscal Factura A/B/C/E | ✅ | ❌ | ❌ | ❌ |
| Argentine padrón lookup | ✅ (via `@ar-agents/identity`) | ❌ | ❌ | ❌ |
| MIT, open source | ✅ | ✅ (since Apr 2026) | partial | ✅ (docs only) |

## Hosting

Works in:

- **Vercel** (Edge or Node runtime) — pair with `VercelKVStateAdapter` for state
- **Cloudflare Workers** — pair with KV / Upstash Redis
- **Deno Deploy / Bun**
- **Node 20+** (HTTP server, Express, Hono, Fastify, Next.js)

WebCrypto-only (no `node:crypto` imports). The bundle is < 30KB gzip.

## Phase 2 (planned)

- **AP2 mandate verifier/signer** — ES256 SD-JWT VC, mandate chains
  (`~~`-separated), constraint evaluation (`payment.amount_range`,
  `checkout.allowed_merchants`, `payment.budget`), receipts (Checkout +
  Payment) signed per FIDO Alliance Agentic Auth WG profile.
- **MELI Q&A + claims tools** as ACP extension types — agent-driven
  pre-sale answer-fetch + post-sale evidence upload.
- **PIX / Transferencias 3.0 / SPEI bridges** — AP2 mandates settling to
  LATAM bank rails when card networks aren't the right fit.

## Tests

```bash
pnpm test          # 160 tests across schemas, webhook, idempotency, state,
                   # version, handlers, MP, MELI, facturacion, vercel-kv
pnpm test:coverage # full coverage report
pnpm typecheck     # strict TS, no `any`, exactOptionalPropertyTypes
```

## Specs we follow

- ACP — [agentic-commerce-protocol/agentic-commerce-protocol](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)
  (`2026-04-17` is the targeted version; older versions are
  recognized in version negotiation but new sessions emit `2026-04-17`)
- AP2 — [ap2-protocol.org](https://ap2-protocol.org/specification/) (Phase 2)
- AFIP/ARCA WSFE — `wsfev1` SOAP spec, factura A/B/C/E

## License

MIT. Built by Naza Clemente / Hello Astro for the LATAM agent ecosystem.

## Related packages

- [`@ar-agents/mercadopago`](../mercadopago) — Mercado Pago Agent Toolkit (89 tools)
- [`@ar-agents/identity`](../identity) — CUIT/CUIL + ARCA padrón
- [`@ar-agents/facturacion`](../facturacion) — AFIP WSFE factura electrónica
- [`@ar-agents/banking`](../banking) — CBU/CVU + BCRA Central de Deudores
- [`@ar-agents/whatsapp`](../whatsapp) — WhatsApp Business Cloud
- [`@ar-agents/shipping`](../shipping) — Andreani / OCA / Correo Argentino
- [`@ar-agents/mcp`](../mcp) — MCP server bundling all the above
