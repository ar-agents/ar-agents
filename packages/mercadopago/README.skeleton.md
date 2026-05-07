<!--
  README skeleton: Vercel-official quality.
  Drop this in as packages/mercadopago/README.md after a final once-over.
  The structure follows the patterns Vercel themselves use on
  https://github.com/vercel/ai-sdk and https://github.com/vercel/next.js
  for their public OSS repos.

  Hard rules:
  - Lead with what it is and a 3-line install + first call.
  - Real numbers (latency, bundle size) only: no "fast", "blazing", "robust".
  - Code blocks runnable as-pasted (no `// ...` placeholders that hide work).
  - One-screen scrolling for the top: header → install → first call → core API.
  - Everything below is reference, not pitch.
-->

# `@ar-agents/mercadopago`

[![npm version](https://img.shields.io/npm/v/@ar-agents/mercadopago.svg?label=npm)](https://www.npmjs.com/package/@ar-agents/mercadopago)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@ar-agents/mercadopago.svg)](https://bundlephobia.com/package/@ar-agents/mercadopago)
[![types](https://img.shields.io/npm/types/@ar-agents/mercadopago.svg)](https://arethetypeswrong.github.io/?p=@ar-agents/mercadopago)
[![CI](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Mercado Pago Agent Toolkit. Built on Vercel. 89 typed tools across the agent-relevant Mercado Pago API surface (Subscriptions, Payments, Checkout Pro, Marketplace OAuth, Order Management, Customers, Cards, Cuotas, QR, 3DS, Point devices, Stores+POS, Account/Balance/Settlements, Webhooks, Disputes, Lookups, Bank Accounts) for the [Vercel AI SDK](https://ai-sdk.dev/) 6 `Experimental_Agent`. Edge-Runtime-safe.

> **Reading this as an agent?** Skip to [AGENTS.md](./AGENTS.md): decision tree, result schemas to memorize, error patterns, latency table.

## Quick start

```bash
pnpm add @ar-agents/mercadopago ai zod
```

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { MercadoPagoClient, mercadoPagoTools, InMemoryStateAdapter } from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({ accessToken: process.env.MP_ACCESS_TOKEN! });

export const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  instructions: "Sos un asistente de billing para una SaaS argentina.",
  tools: mercadoPagoTools(mp, { state: new InMemoryStateAdapter(), backUrl: "https://example.com/done" }),
  stopWhen: stepCountIs(8),
});
```

```ts
const { text } = await agent.generate({
  prompt: "Cobrale $25.000 mensual a juan@example.com con razón 'Plan Pro'."
});
```

That's it. The agent picks `create_subscription`, returns an `init_point_url` you send to the customer, and the rest of the flow (first payment confirmation, recurring charges, webhooks) just works.

## At a glance

| | |
| --- | --- |
| **Tools** | 30: Subscriptions, Payments, Refunds, Checkout Pro, Cuotas, QR in-store, Saved cards, Marketplace OAuth, Order Management, Point devices, 3DS, Webhooks. [Full list](./AGENTS.md#tool-selection). |
| **Bundle size** | 41 KB ESM brotli'd ([bundlephobia](https://bundlephobia.com/package/@ar-agents/mercadopago)). Tree-shakable subpath exports for `/vercel-kv` + `/otel`. |
| **Runtime** | Vercel Edge, Node 18+, Cloudflare Workers, Deno: Web Crypto under the hood. |
| **Tests** | 290 unit + property + failure-injection + benchmark. `pnpm test`, `pnpm bench`. |
| **TypeScript** | Strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. publint + arethetypeswrong all 🟢. |
| **AR-specific knowledge** | Cuotas with regulatory text (RG 5286/2023), AR issuer promo catalog, Subscription replay-protection, MLA-verified, ARS default. |

## Server-only

This package **MUST** run on the server. The constructor throws if instantiated in a browser context: the access token would be exposed in the JavaScript bundle. Use Server Components, Route Handlers, or Server Actions.

```ts
// ❌ Never. Throws at runtime AND would leak the token if it didn't.
"use client";
const mp = new MercadoPagoClient({ accessToken: ... });

// ✅ Server Component / Route Handler / Server Action.
import { MercadoPagoClient } from "@ar-agents/mercadopago";
export async function POST(req: Request) {
  const mp = new MercadoPagoClient({ accessToken: process.env.MP_ACCESS_TOKEN! });
  // ...
}
```

## API reference

### `new MercadoPagoClient(options)`

Server-side MP API client. Edge-Runtime safe.

| Option | Default | Description |
| --- | --- | --- |
| `accessToken` (required) | no | TEST- prefix for sandbox, APP_USR- for production. |
| `baseUrl` | `https://api.mercadopago.com` | Override for tests / regional hosts. |
| `fetch` | `globalThis.fetch` | Custom fetch (e.g., MSW for tests). |
| `requestTimeoutMs` | `30_000` | Per-request timeout. |
| `maxRetries` | `1` | 5xx + network retries. 4xx never retried. |
| `circuitBreaker` | no | `new CircuitBreaker({ ... })` to fail fast on cascading failures. |
| `traceContext` | no | OpenTelemetry context propagator (W3C trace headers). |
| `onCall` | no | Observability hook fired after every request. |

### `mercadoPagoTools(client, options)`

Returns the agent tool set wired to the given client.

| Option | Required | Description |
| --- | --- | --- |
| `state` | yes | `SubscriptionStateAdapter`: `InMemoryStateAdapter`, `VercelKVSubscriptionStateAdapter`, or your own. |
| `backUrl` | yes | HTTPS URL where MP redirects buyers after first payment. localhost rejected. |
| `notificationUrl` | no | Webhook URL for new payments / status changes. |
| `oauth` | no | `{ clientId, clientSecret, redirectUri, tokenStore }` for marketplace OAuth flows. |
| `webhookSecret` | no | HMAC secret for `handle_webhook` (paste from MP dev panel). |
| `descriptions` | no | Override individual tool descriptions for fine-tuning the LLM. |

### Subpath exports

| Subpath | When to use |
| --- | --- |
| `@ar-agents/mercadopago` | The 30 tools + client. Always-on. |
| `@ar-agents/mercadopago/vercel-kv` | Vercel KV–backed adapters: `VercelKVSubscriptionStateAdapter`, `VercelKVOAuthTokenStore`, `VercelKVIdempotencyCache`, `VercelKVAuditLog`, `VercelKVRateLimiter` (distributed). Pulls in `@vercel/kv` peer dep. |
| `@ar-agents/mercadopago/otel` | `instrumentMercadoPagoClient` + `instrumentMercadoPagoTools` for OpenTelemetry spans + metrics. Pulls in `@opentelemetry/api` peer dep. |

## Production patterns

### Idempotency by default

Every `POST` request gets an auto-generated UUID idempotency key: your app survives network blips without double-charging. For LLM-driven retries, `create_payment`, `create_subscription`, `create_payment_preference`, and `refund_payment` use a **deterministic** key derived from the inputs, so a tool retried with the same inputs returns the existing resource instead of creating a duplicate.

### Webhook verification

```ts
import { verifyWebhookSignature, parseWebhookEvent } from "@ar-agents/mercadopago";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const rawBody = await req.text();
  const event = parseWebhookEvent(JSON.parse(rawBody), url.searchParams);

  const ok = await verifyWebhookSignature({
    requestId: req.headers.get("x-request-id"),
    dataId: event!.dataId,
    signatureHeader: req.headers.get("x-signature"),
    secret: process.env.MP_WEBHOOK_SECRET!,
  });
  if (!ok) return new Response("Invalid signature", { status: 401 });
  // process event...
}
```

5-minute replay-tolerance window built in. Constant-time HMAC comparison.

### Distributed rate limiting

For multi-region or marketplace deploys where serverless instances would each get their own per-process bucket:

```ts
import { VercelKVRateLimiter } from "@ar-agents/mercadopago/vercel-kv";

const limiter = new VercelKVRateLimiter({
  key: "mp-account-prod",
  capacity: 50,
  refillPerSecond: 25,
});
```

### Cookbook

9 recipes in [`./cookbook`](./cookbook/): Checkout Pro, SaaS subscription, webhook handler, marketplace split, QR in-store, 3DS challenge, manual capture, recovery patterns, full OpenTelemetry wiring.

## Comparison

| | `@ar-agents/mercadopago` | `mercadopago` (official SDK) | Hand-rolled |
| --- | --- | --- | --- |
| Tools as Vercel AI SDK 6 schemas | ✓ | no | build it |
| AR-specific (cuotas, AR issuer promos, AR phone, MLA-verified) | ✓ | no | weeks |
| `AGENTS.md` per package (LLM-readable) | ✓ | no |: |
| Idempotency-by-default for state mutations | ✓ | no | build it |
| Webhook signature verify + 5-min replay window | ✓ | client only | build it |
| Edge Runtime support | ✓ | Node-only | build it |
| Vercel KV adapters via subpath | ✓ | no |: |
| OpenTelemetry instrumentation + recipe | ✓ | no | build it |
| Circuit breaker + deadline propagation | ✓ | no | build it |
| Tool middleware (compose audit/rate/metrics) | ✓ | no |: |
| Time to first cobro | 30 min | 1+ week | 6-8 weeks |

See [`MIGRATION.md`](./MIGRATION.md) for a side-by-side `mercadopago` → `@ar-agents/mercadopago` migration guide.

## Security

This package handles money. Read [SECURITY.md](../../SECURITY.md) before deploying:

- The constructor refuses to instantiate in a browser context (token leak prevention).
- Every webhook handler MUST call `verifyWebhookSignature` before trusting payload contents.
- Irreversible tools (`refund_payment`, `cancel_*`, `delete_customer_card`) include explicit confirm-with-user instructions in their descriptions; the LLM should ask before calling.
- Report vulnerabilities privately per [SECURITY.md](../../SECURITY.md).

## License

[MIT](./LICENSE) · © Nazareno Clemente

If this saves your team weeks of MP integration work, consider [sponsoring](https://github.com/sponsors/naza00000).
