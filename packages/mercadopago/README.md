# @ar-agents/mercadopago

> Mercado Pago Agent Toolkit. Built on Vercel.
>
> 87 typed tools across the agent-relevant Mercado Pago API surface, for the
> [Vercel AI SDK](https://ai-sdk.dev/) 6 `Experimental_Agent`.
>
> _Payments · Subscriptions · Checkout Pro · Marketplace OAuth · Order Management ·
> Customers · Cards · Cuotas · QR · 3DS · Point devices · Stores+POS ·
> Account/Balance/Settlements · Webhooks · Disputes · Lookups · Bank Accounts_

[![npm version](https://img.shields.io/npm/v/@ar-agents/mercadopago.svg)](https://www.npmjs.com/package/@ar-agents/mercadopago)
[![npm downloads](https://img.shields.io/npm/dm/@ar-agents/mercadopago.svg)](https://www.npmjs.com/package/@ar-agents/mercadopago)
[![license](https://img.shields.io/npm/l/@ar-agents/mercadopago.svg)](./LICENSE)
[![CI](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@ar-agents/mercadopago.svg)](https://bundlephobia.com/package/@ar-agents/mercadopago)

Wraps the Mercado Pago API as a typed tool collection for AI agents. Built for
the Vercel AI SDK 6 `Experimental_Agent`. Compatible with any caller that uses
`tool()`.

> **Reading this as an agent?** Skip to [AGENTS.md](./AGENTS.md) — it's targeted at LLM consumption with explicit tool-selection rules and error-recovery patterns.

## At a glance

| What | Value |
| --- | --- |
| Tools shipped | **87 tools** — covers the agent-relevant MP API surface. Subscriptions, Payments, Refunds, Checkout Pro, Order Management, Customers, Saved Cards, Cuotas, QR in-store, Subscription Plans, Stores+POS, Point Devices físicos, Merchant Orders, Bank Accounts, Disputes, Lookups, Webhooks management, `handle_webhook` combo, OAuth Marketplace flow, Account/Balance/Settlements, 3DS analyzer, Test cards, `mp_health_check`, plus pure helpers `compute_marketplace_fee` + `explain_payment_status`. |
| Production hardening | Circuit breaker with state machine + rolling window, deadline propagation via parent AbortSignal, W3C Trace Context propagation (OpenTelemetry-compatible without peer dep), replay-attack protection on webhook signatures (5-min default tolerance), `mp_health_check` endpoint. |
| Test coverage | **303 tests** — unit + property-based (~1400 random scenarios via fast-check) + failure injection (network errors, timeouts, races, malformed responses) + integration vs MP sandbox (gated by env var) + benchmarks (`pnpm bench`). |
| External dependencies | Mercado Pago access token (TEST or APP_USR), state adapter (Upstash, Redis, Postgres, in-memory, etc.) |
| Latency | 200–600ms per MP call; <1ms for state ops |
| Cost | $0 — MP API is free; merchant pays per-transaction fees on auto-charges |
| Side effects | `create_subscription` creates a preapproval. `cancel`/`pause`/`resume` mutate state. `get_status` is read-only. |
| Agent safety | `cancel_subscription` description triggers confirm-before-call in Claude Sonnet 4.6+ |
| Sites supported | MLA (Argentina) verified end-to-end. Other LATAM sites should work but aren't exercised by tests. |
| Runtime | **Edge Runtime + Node 18+** — Web Crypto under the hood, no `node:crypto`. Drops into Vercel Edge Functions, Cloudflare Workers, Deno deploy, or any modern Node. |
| Vercel KV adapters | Subpath `@ar-agents/mercadopago/vercel-kv` ships adapters for subscription state, OAuth tokens, idempotency cache, audit log, and rate limiter. |
| Cookbook | 9 recipes shipped in `cookbook/` — checkout, subscriptions, webhook handler, marketplace OAuth, QR in-store, 3DS challenge, auth-only Order, recovery patterns, full OpenTelemetry wiring. |

## Why this exists

Building an agent that operates an Argentine business means integrating Mercado
Pago. The API surface is dozens of endpoints, the docs are partially translated,
and there are 11+ non-obvious landmines that take days each to discover the
first time around. This package wraps the agent-relevant surface (subscriptions,
payments, marketplace OAuth, cuotas, QR, 3DS, point devices, webhooks) and turns
the documented gotchas into typed errors with actionable messages.

## Deploy a runnable example

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Far-agents%2Far-agents&root-directory=apps%2Fmp-hello&env=MP_ACCESS_TOKEN%2CANTHROPIC_API_KEY%2CUPSTASH_REDIS_REST_URL%2CUPSTASH_REDIS_REST_TOKEN&envDescription=Mercado%20Pago%20access%20token%2C%20Anthropic%20API%20key%2C%20and%20Upstash%20Redis%20credentials%20for%20subscription%20state.&envLink=https%3A%2F%2Fgithub.com%2Far-agents%2Far-agents%2Ftree%2Fmain%2Fapps%2Fmp-hello%23setup&project-name=mp-hello&repository-name=mp-hello)

`apps/mp-hello` ships as a clonable Vercel template — Edge Runtime API routes,
MP webhook handler with HMAC verify, Upstash-backed subscription state.

## Install

```bash
pnpm add @ar-agents/mercadopago
# peer deps
pnpm add ai zod
```

## Quick start

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import {
  MercadoPagoClient,
  mercadoPagoTools,
  InMemoryStateAdapter,
} from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!, // TEST- for sandbox, APP_USR- for prod
});

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6", // routed via Vercel AI Gateway
  tools: mercadoPagoTools(mp, {
    state: new InMemoryStateAdapter(), // swap for Upstash/Redis/Postgres in prod
    backUrl: "https://yoursite.com/subscription/done", // MUST be HTTPS
  }),
  stopWhen: stepCountIs(8),
});

const result = await agent.generate({
  prompt: "Creá una subscription mensual de $1000 ARS para customer@example.com.",
});

console.log(result.text);
// → "Listo, subscription creada. Mandale este link al cliente para que pague:
//    https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=..."
```

## Webhooks

MP notifies your endpoint whenever a subscription's status changes. The
`parseWebhookEvent()` helper normalizes both query-string and body payload
shapes that MP sends. `verifyWebhookSignature()` validates the `x-signature`
header.

```ts
// Next.js / Vercel App Router example
import { parseWebhookEvent, verifyWebhookSignature, MercadoPagoClient } from "@ar-agents/mercadopago";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const event = parseWebhookEvent(body, new URL(req.url).searchParams);
  if (!event) return Response.json({ ignored: true });

  // Optional but recommended in production
  const ok = verifyWebhookSignature({
    requestId: req.headers.get("x-request-id"),
    dataId: event.dataId,
    signatureHeader: req.headers.get("x-signature"),
    secret: process.env.MP_WEBHOOK_SECRET!,
  });
  if (!ok) return Response.json({ error: "bad signature" }, { status: 401 });

  if (event.topic === "preapproval") {
    const mp = new MercadoPagoClient({ accessToken: process.env.MP_ACCESS_TOKEN! });
    const fresh = await mp.getPreapproval(event.dataId);
    // Update your store...
  }
  return Response.json({ received: true });
}
```

## Custom state adapter

Use any KV-shaped backing store. Implement three methods:

```ts
import type { SubscriptionStateAdapter, SubscriptionStateRecord } from "@ar-agents/mercadopago";
import { Redis } from "@upstash/redis";

export class UpstashStateAdapter implements SubscriptionStateAdapter {
  constructor(private redis: Redis) {}

  async set(id: string, state: Partial<SubscriptionStateRecord>): Promise<void> {
    const existing = (await this.get(id)) ?? {};
    await this.redis.set(`mp:sub:${id}`, { ...existing, ...state });
  }
  async get(id: string): Promise<SubscriptionStateRecord | null> {
    return await this.redis.get<SubscriptionStateRecord>(`mp:sub:${id}`);
  }
  async list(): Promise<string[]> {
    const keys = await this.redis.keys("mp:sub:*");
    return keys.map((k) => k.replace("mp:sub:", ""));
  }
}
```

## Known gotchas (read this BEFORE you debug)

These are the MP behaviors that took the most time to figure out the first
time. The library now surfaces them as typed errors with actionable messages,
but the constraints themselves are MP-side and unavoidable.

### 1. `back_url` must be HTTPS

`POST /preapproval` rejects `http://` and `localhost` URLs with a 400. For
local development, pass a placeholder valid HTTPS URL like
`https://example.com/done`. Throws `MercadoPagoBackUrlInvalidError`.

### 2. "Cannot operate between different countries" usually means account-type mismatch

The error message is misleading. The actual cause: the seller account
(whose access token authenticates the request) and the buyer email (`payerEmail`)
must be the same MP account "type" — both real accounts, or both test users
created via `POST /users/test_user`. Mixing them rejects with this error.
Throws `MercadoPagoAccountTypeMismatchError`.

### 3. Buyer email cannot equal seller account email

If the `payerEmail` matches the email of the MP account whose token is being
used, MP keeps the Confirmar button disabled at checkout with no API error.
Pass a different real email. Throws `MercadoPagoSelfPaymentError` when the
library can detect the match.

### 4. Saved cards require CVV re-capture

`POST /payments` against a saved card token still requires the CVV to be
re-supplied. Pure agent-driven recurring is impossible via that path. The ONLY
agent-friendly recurring rail is `POST /preapproval` (Subscriptions API),
where the first payment requires human CVV at the init_point UI, and
subsequent recurring charges happen automatically without CVV.

### 5. The init_point UI requires reCAPTCHA v3

The Confirmar button at `/checkout/v1/subscription/redirect/.../review/` starts
disabled and only enables when Google reCAPTCHA v3 returns a sufficient score.
If the reCAPTCHA script can't load (ad-blockers, DNS-level filters like
Pi-hole/NextDNS, certain Chrome enterprise policies, or privacy-focused
browsers like Dia or Brave with strict shields) the button stays disabled
permanently with no error message. Workaround: pay from a clean browser, or
whitelist `google.com/recaptcha` and `www.gstatic.com`.

### 6. PUT /preapproval cannot force `status: authorized`

Even in sandbox, you cannot shortcut the human-payment leg by API-PUTing
`{ status: 'authorized' }`. MP responds: "You cannot authorize a preapproval,
only the payer can". Cancel via PUT works (`{ status: 'cancelled' }`),
authorize does not. Throws `MercadoPagoAuthorizeForbiddenError`.

### 7. The subscription init_point URL pattern

After `POST /preapproval` returns, the `init_point` field always contains:

```
https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id={id}
```

Visiting that URL takes the customer through MP's checkout flow (payment
selector → card form → review → Confirmar). The customer's logged-in MP
account at that moment determines the effective payer. If they're logged in
as the seller account, they hit gotcha #3.

### 8. Test cards (AR/MLA sandbox)

| Card type        | Number                | CVV | Exp     | Cardholder name (magic word)   |
| ---------------- | --------------------- | --- | ------- | ------------------------------ |
| Mastercard credit | `5031 7557 3453 0604` | 123 | any future | `APRO` (forces approved)    |
| Visa credit       | `4509 9535 6623 3704` | 123 | any future | `APRO` (forces approved)    |
| Amex credit       | `3711 803032 57522`   | 1234 | any future | `APRO`                     |

Other magic cardholder names: `OTHE` (other error), `CONT` (pending), `CALL`
(rejected call-for-auth), `FUND` (insufficient funds), `SECU` (invalid CVV),
`EXPI` (expired), `FORM` (form error). Use any 8-digit document.

### 9. Agent safety guardrail (the lib's design choice)

The `cancel_subscription` tool's description explicitly tells the LLM that
the action is irreversible. In Claude Sonnet 4.6+ this reliably triggers a
"are you sure?" turn before the cancel actually executes. If you don't want
this guardrail, override the description via the `descriptions` option.

### 10. MP risk engine can reject sandbox payments without warning

The MP risk engine sometimes rejects sandbox test card payments with "Por
motivos de seguridad, tu pago fue rechazado", with no actionable detail. The
strongest correlation observed: brand-new MP apps (no payment history) plus
intensive automation activity (rapid create/cancel via API + browser-CDP
automation signals + multiple payer attempts) trigger the engine within ~1
hour of the app's creation.

Workaround: when bootstrapping a new MP app, do the first few subscription
end-to-end tests by hand, with cooldown gaps between attempts. Once the app
has history of normal usage, the engine relaxes.

### 11. Failed first payment auto-cancels the entire preapproval

When MP's risk engine rejects the first payment of a preapproval, MP
automatically marks the WHOLE preapproval as `status: cancelled` — you cannot
retry with another card on the same subscription. Create a fresh preapproval
to retry. Throws `MercadoPagoPaymentRejectedError`, which carries the parent
`preapprovalId` so the caller knows the parent is dead too.

## API reference

### `MercadoPagoClient`

```ts
new MercadoPagoClient({
  accessToken: string;        // required
  baseUrl?: string;           // default: 'https://api.mercadopago.com'
  fetch?: typeof fetch;       // default: globalThis.fetch
});
```

Methods:

| Method                    | Returns                    |
| ------------------------- | -------------------------- |
| `createPreapproval(p)`    | `Promise<Preapproval>`     |
| `getPreapproval(id)`      | `Promise<Preapproval>`     |
| `cancelPreapproval(id)`   | `Promise<Preapproval>`     |
| `pausePreapproval(id)`    | `Promise<Preapproval>`     |
| `resumePreapproval(id)`   | `Promise<Preapproval>`     |

### `mercadoPagoTools(client, options)`

Returns a `ToolSet` with **50 tools** spanning the full MP API surface an
agent typically needs. See [AGENTS.md](./AGENTS.md) for the full list with
selection guidance. Highlights:

- **Subscriptions + Plans** (10 tools): create_subscription, create_subscription_plan, subscribe_to_plan, list_subscription_payments, pause/resume/cancel
- **Payments + Refunds** (7 tools): create_payment, search_payments, capture_payment, refund_payment, list_refunds…
- **Checkout Pro** (2 tools): create_payment_preference, get_payment_preference
- **Customers + Saved Cards** (4 tools): create_customer, find_customer_by_email, list_customer_cards, charge_saved_card (CVV-required)
- **In-store QR + POS** (4 tools): create_qr_payment, cancel_qr_payment, create_store, create_pos
- **Cuotas + lookups** (3 tools): calculate_installments, list_payment_methods, list_issuers
- **Disputes + Webhooks management** (6 tools): list_payment_disputes, create_webhook, list_webhooks…
- **v0.5 — Webhook handler combo** (1 tool): `handle_webhook` — verify HMAC + parse + auto-fetch in ONE call
- **v0.5 — OAuth Marketplace** (3 tools): `oauth_authorize_url`, `oauth_exchange_code`, `oauth_refresh_token` — wire third-party MP accounts to your platform
- **v0.5 — Order Management API** (5 tools): `create_order`, `get_order`, `update_order`, `capture_order`, `cancel_order` — modern API with auth-only support and marketplace splits

Options:

```ts
mercadoPagoTools(client, {
  state: SubscriptionStateAdapter;       // required
  backUrl: string;                        // required, must be HTTPS
  descriptions?: Partial<Record<ToolName, string>>; // optional override
  webhookSecret?: string;                 // for handle_webhook (HMAC verify)
  oauth?: { clientId, clientSecret };     // for OAuth marketplace flow
});
```

### v0.5 — Webhook handler combo

```ts
// In your /api/mercadopago/webhook handler
const result = await tools.handle_webhook.execute({
  raw_body: await req.text(),
  signature_header: req.headers.get("x-signature"),
  request_id_header: req.headers.get("x-request-id"),
  auto_fetch: true, // also fetches the Payment / Subscription
}, ctx);

if (!result.verified) return new Response("unauthorized", { status: 401 });
// Use result.event.topic, result.event.dataId, result.resource (Payment | Preapproval | …)
```

### v0.5 — OAuth Marketplace flow (3 legs)

```ts
// 1. Build authorize URL — redirect the seller here
const { url } = await tools.oauth_authorize_url.execute({
  redirect_uri: "https://app.test/oauth/callback",
  state: cryptoRandomToken(), // bind to user's session, verify on redirect
}, ctx);

// 2. On redirect, exchange the code (server-side, secret required)
const { token } = await tools.oauth_exchange_code.execute({
  code: req.query.code,
  redirect_uri: "https://app.test/oauth/callback",
}, ctx);
// Persist { token.user_id, token.access_token, token.refresh_token, token.expires_in }

// 3. Refresh proactively (or reactively on 401)
const { token } = await tools.oauth_refresh_token.execute({
  refresh_token: savedRefreshToken,
}, ctx);

// Then operate AS the seller:
const sellerClient = new MercadoPagoClient({ accessToken: token.access_token });
```

### v0.5 — Marketplace split payments

For two-sided platforms (Rappi-style) where you collect on a seller's behalf
and take a fee, pass `marketplace`, `marketplace_fee`, `collector_id` to
`create_order` (or `create_payment_preference`). Funds route to the seller's
MP account; `marketplace_fee` (in ARS) goes to your marketplace account.

```ts
await tools.create_order.execute({
  type: "online",
  total_amount: 10_000,
  marketplace: "MyApp",
  marketplace_fee: 500,            // ARS (NOT %)
  collector_id: token.user_id,     // seller MP user_id from OAuth
}, ctx);
```

### Errors

All errors extend `MercadoPagoError` which carries `status`, `endpoint`,
and `mpResponse` for inspection. Specific subclasses:

- `MercadoPagoAuthError` — 401 from MP
- `MercadoPagoBackUrlInvalidError` — see gotcha #1
- `MercadoPagoSelfPaymentError` — see gotcha #3
- `MercadoPagoAccountTypeMismatchError` — see gotcha #2
- `MercadoPagoPaymentRejectedError` — see gotchas #10–11; carries `preapprovalId` and `statusDetail`
- `MercadoPagoAuthorizeForbiddenError` — see gotcha #6
- `MercadoPagoRateLimitError` — 429 from MP

## Production hardening (v0.9+)

### Circuit breaker

Protect your app from cascading failures when MP is degraded. The breaker
observes failures over a rolling window — after enough, it OPENS and fails
fast (no network round-trip) until cooldown elapses.

```ts
import { CircuitBreaker, MercadoPagoClient, CircuitOpenError } from "@ar-agents/mercadopago";

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  // Don't count 4xx user errors toward circuit opening — only upstream failures
  isFailure: (err) => err instanceof MercadoPagoError && err.status >= 500,
  onStateChange: (e) => metrics.gauge(`mp.circuit.${e.to}`, 1),
});

const client = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  circuitBreaker: breaker,
});

try {
  await client.getPayment("123");
} catch (err) {
  if (err instanceof CircuitOpenError) {
    // MP is down, breaker tripped — fast-fail without network
    return showFallbackUi(err.retryAfterMs);
  }
  throw err;
}
```

**Multi-tenant marketplace**: pass the same `CircuitBreaker` instance to all
per-seller `MercadoPagoClient`s — they share backpressure signal.

### Deadline propagation

Pass the agent's `AbortSignal` to chain deadlines through to MP — when the
agent's budget expires, MP requests cancel cleanly without retrying.

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000); // 5s agent budget

const result = await client.healthCheck(controller.signal);
// If 5s elapsed, result.ok === false and we didn't hang.
```

### W3C Trace Context (OpenTelemetry-compatible)

If you're using OpenTelemetry, plug in trace propagation without adding
`@opentelemetry/api` as a peer dep:

```ts
import { trace } from "@opentelemetry/api";

const client = new MercadoPagoClient({
  accessToken: "...",
  traceContext: () => trace.getActiveSpan()?.spanContext(),
});
```

The client automatically injects `traceparent` headers on every MP request
(MP's logs become correlatable with your distributed traces) and surfaces
the trace context in `onCall` events.

### Health check

```ts
// As an agent tool:
const health = await tools.mp_health_check.execute({ timeout_ms: 2000 }, ctx);
// → { ok: true, latencyMs: 187, userId: "12345", error: null, circuit: {...} }

// As a direct method:
const health = await client.healthCheck(controller.signal);
```

Use as a `/api/health/mp` endpoint for status-page polling, k8s probes, or
Vercel Cron monitoring loops.

### Benchmarks (Web Crypto on Node 22, MacBook Air M2)

| Operation | Throughput |
|---|---|
| `hmacSha256Hex` (typical webhook manifest) | 45,932 ops/sec |
| `sha256Hex` (40-byte input — idempotency key) | 92,218 ops/sec |
| `timingSafeEqualHex` (64 chars) | 3,099,551 ops/sec |
| `computeMarketplaceFee` | 20,662,947 ops/sec |
| `explainPaymentStatus` | 21,289,436 ops/sec |
| `InMemoryStateAdapter.set` | 5,752,416 ops/sec |

Run `pnpm bench` to reproduce.

## Vercel-native (v0.8+)

The toolkit ships first-class adapters for Vercel infrastructure via the
`@ar-agents/mercadopago/vercel-kv` subpath. `@vercel/kv` is an **optional**
peer dep — only install it if you use the subpath.

```ts
import { mercadoPagoTools, MercadoPagoClient } from "@ar-agents/mercadopago";
import {
  VercelKVSubscriptionStateAdapter,
  VercelKVOAuthTokenStore,
  VercelKVIdempotencyCache,
} from "@ar-agents/mercadopago/vercel-kv";

const tools = mercadoPagoTools(
  new MercadoPagoClient({ accessToken: process.env.MP_ACCESS_TOKEN! }),
  {
    state: new VercelKVSubscriptionStateAdapter(),
    backUrl: "https://yourapp.com/done",
    webhookSecret: process.env.MP_WEBHOOK_SECRET,
    oauth: {
      clientId: process.env.MP_CLIENT_ID!,
      clientSecret: process.env.MP_CLIENT_SECRET!,
    },
  },
);
```

### Edge Runtime

The toolkit (including HMAC webhook verification) is fully Edge-Runtime
compatible. Add `export const runtime = "edge"` to any Vercel route handler
that uses MP tools — sub-100ms global cold starts.

### Vercel Cron + Blob + Functions

See `cookbook/08-recovery-patterns.ts` for a Vercel Cron Job example that
monitors stuck-pending payments. For label/invoice PDF storage, the
`crear_envio` tool (in `@ar-agents/shipping`) returns label URLs you can
mirror to [Vercel Blob](https://vercel.com/docs/storage/vercel-blob).

## Cookbook

Production-grade recipes shipped in [`cookbook/`](./cookbook):

| Recipe | What it shows |
|---|---|
| `01-checkout-pro-basic.ts` | First-time hosted checkout sale via the agent |
| `02-saas-subscription.ts` | Reusable plan + first payment + card swap on rejection |
| `03-webhook-handler.ts` | Edge Runtime webhook handler with HMAC verify + dispatch |
| `04-marketplace-split.ts` | OAuth seller link + preference with `marketplace_fee` + reconciliation |
| `05-qr-in-store.ts` | QR generation → buyer scan → cashier WhatsApp notify |
| `06-3ds-challenge.ts` | Detect → redirect to challenge → recover via webhook |
| `07-auth-only-order.ts` | Order with `capture_mode: "manual"` (ride-share / hotel pattern) |
| `08-recovery-patterns.ts` | Card swap on subscription, stuck-pending recovery, idempotent upsert via search, Vercel Cron monitoring |

Each recipe is copy-pasteable into a Next.js route handler.

## Compatibility

- **Node.js 18+** (Web Crypto required) or **Vercel Edge Runtime** / **Cloudflare Workers** / **Deno**
- Vercel AI SDK 6+
- Zod 3+
- Optional: `@vercel/kv >=2` for the `vercel-kv` subpath
- Pairs cleanly with [Vercel AI Gateway](https://vercel.com/ai-gateway) for model routing.

## License

MIT — see [LICENSE](./LICENSE).

## Stability

This package is **pre-1.0**. Per [npm convention](https://docs.npmjs.com/about-semantic-versioning), **0.x minor versions may include breaking changes**. We document every breaking change in `CHANGELOG.md` under the corresponding minor bump and flag it explicitly. To avoid surprises:

```bash
# Pin to exact version (recommended for production):
pnpm add @ar-agents/<package>@<exact-version>
```

We commit to **no breaking changes within a patch version**, and we publish `1.0.0` once the public API has stabilized across at least two consecutive minor releases.
