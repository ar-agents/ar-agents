# @ar-agents/mercadopago

> Mercado Pago Subscriptions as drop-in tools for the [Vercel AI SDK](https://ai-sdk.dev/). Argentine-focused, agent-ready.

[![npm version](https://img.shields.io/npm/v/@ar-agents/mercadopago.svg)](https://www.npmjs.com/package/@ar-agents/mercadopago)
[![license](https://img.shields.io/npm/l/@ar-agents/mercadopago.svg)](./LICENSE)

Exposes Mercado Pago's recurring-billing API to AI agents through a typed,
opinionated tool collection. Built for the Vercel AI SDK 6 `Experimental_Agent`.
Compatible with any caller that uses `tool()`.

## Why this exists

Building an agent that operates a real Argentine business means integrating
Mercado Pago. MP's API has a surface area of dozens of endpoints, a docs site
that is partially translated to Spanish-from-the-90s, and at least 11
non-obvious landmines that take days each to discover. This package encapsulates
the subset of MP that an agent typically needs (recurring subscriptions: create,
check status, pause/resume, cancel) and turns the documented gotchas into typed
errors with actionable messages.

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

Returns a `ToolSet` (the Vercel AI SDK type) with five entries:

| Tool name                 | What it does                                                      |
| ------------------------- | ----------------------------------------------------------------- |
| `create_subscription`     | Create a new subscription, return `init_point_url` for the buyer  |
| `get_subscription_status` | Read the latest status from MP, merged with cached webhook info   |
| `cancel_subscription`     | Cancel the subscription (triggers safety guardrail, see #9)       |
| `pause_subscription`      | Pause an authorized subscription                                  |
| `resume_subscription`     | Resume a paused subscription                                      |

Options:

```ts
mercadoPagoTools(client, {
  state: SubscriptionStateAdapter;       // required
  backUrl: string;                        // required, must be HTTPS
  descriptions?: Partial<Record<ToolName, string>>; // optional override
});
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

## Compatibility

- Node.js 20+
- Vercel AI SDK 6+
- Zod 3+
- Pairs cleanly with [Vercel AI Gateway](https://vercel.com/ai-gateway) for model routing.

## License

MIT — see [LICENSE](./LICENSE).
