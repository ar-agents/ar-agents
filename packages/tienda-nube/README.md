# @ar-agents/tienda-nube

Tienda Nube / Nuvemshop agent toolkit for the Vercel AI SDK 6+. Typed tools for products, orders, customers, fulfillment + webhook subscriptions + OAuth. The #2 e-commerce platform in Argentina (100k+ merchants).

```sh
pnpm add @ar-agents/tienda-nube
```

## What's inside

- **`HttpTiendaNubeAdapter`** — real REST adapter against `https://api.tiendanube.com/v1/{storeId}`. Sets the required UA (`{appName} ({contactEmail})`) and `Authentication: bearer {token}` headers (note: Tienda Nube uses `Authentication`, not `Authorization`). Maps 401/403 → `TiendaNubeAuthError`, 5xx/429 → retryable `TiendaNubeApiError`.
- **`InMemoryTiendaNubeAdapter`** — deterministic seeded adapter for tests + cockpit demos. Realistic substring search, status + payment-status filters, paginated `hasMore`.
- **`UnconfiguredTiendaNubeAdapter`** — explicit `throws on every call` default.
- **OAuth helpers** — `buildAuthorizeUrl({ appId, state })` + `exchangeCodeForToken({ appId, clientSecret, code })`. Tienda Nube tokens don't expire; uninstall invalidates them (subscribe to `app/uninstalled`).
- **10 Vercel AI SDK tools** — store, list/get products, list/get orders, list/get customers, webhook CRUD.

## Quick start

```ts
import {
  HttpTiendaNubeAdapter,
  tiendaNubeTools,
  exchangeCodeForToken,
} from "@ar-agents/tienda-nube";

// 1) After OAuth callback:
const token = await exchangeCodeForToken({
  appId: process.env.TN_APP_ID!,
  clientSecret: process.env.TN_CLIENT_SECRET!,
  code: req.query.code as string,
});
// Persist `token.accessToken` + `token.storeId`.

// 2) Build the adapter:
const tn = new HttpTiendaNubeAdapter({
  storeId: token.storeId,
  accessToken: token.accessToken,
  appName: "Vultur",
  contactEmail: "naza@naza.ar",
});

// 3) Use directly OR wire as agent tools:
const orders = await tn.listOrders({
  paymentStatus: "paid",
  sinceIso: "2026-01-01",
  perPage: 50,
});

import { Experimental_Agent as Agent } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new Agent({
  model: anthropic("claude-sonnet-4-7"),
  tools: tiendaNubeTools({ adapter: tn }),
  system: "Sos un agente que reconcilia órdenes de Tienda Nube contra MercadoPago.",
});
```

## OAuth flow

```ts
import { buildAuthorizeUrl, exchangeCodeForToken } from "@ar-agents/tienda-nube";

// Step 1: redirect the merchant
const url = buildAuthorizeUrl({
  appId: process.env.TN_APP_ID!,
  state: crypto.randomUUID(), // store + verify on callback
});
res.redirect(url);

// Step 2: callback handler
const token = await exchangeCodeForToken({
  appId: process.env.TN_APP_ID!,
  clientSecret: process.env.TN_CLIENT_SECRET!,
  code: req.query.code as string,
});
// token = { accessToken, storeId, scope, receivedAt }
```

## Errors

```ts
import {
  TiendaNubeError,
  TiendaNubeAuthError,
  TiendaNubeApiError,
  TiendaNubeValidationError,
  TiendaNubeUnconfiguredError,
} from "@ar-agents/tienda-nube";
```

Every error carries `code`, `retryable`, and `context`. The 5xx and 429 paths are flagged `retryable: true` so a retry middleware can pick them up.

## Constraints

- **Prices are decimal strings**, not numbers. Tienda Nube returns `"100.00"` to avoid float rounding. Convert with `Number(...)` only at display time.
- **Localized fields** (`name`, `description`, `handle`) are `{ es: string; pt?: string; en?: string }`. Pull whichever locale matches the store's `main_language`.
- **Pagination is page-based** (`page` + `perPage`), capped at 200 items/page. The Link `rel="next"` header drives `hasMore`.
- **Webhook URLs must be https://**. The adapter rejects http:// at the local validation step.

## Testing

```ts
import { InMemoryTiendaNubeAdapter, tiendaNubeTools } from "@ar-agents/tienda-nube";

const adapter = new InMemoryTiendaNubeAdapter({
  orders: [
    {
      id: 1, number: 1, token: "t",
      status: "open", payment_status: "paid", shipping_status: "unfulfilled",
      subtotal: "100.00", total: "100.00", currency: "ARS",
      contact_email: "demo@example.com", products: [],
      created_at: "2026-01-15T00:00:00.000Z",
      updated_at: "2026-01-15T00:00:00.000Z",
    },
  ],
});

const tools = tiendaNubeTools({ adapter });
// Integration-test your agent against realistic-but-deterministic Tienda Nube semantics.
```

## License

MIT — Nazareno Clemente <naza@naza.ar>
