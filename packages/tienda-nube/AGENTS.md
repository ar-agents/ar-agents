# `@ar-agents/tienda-nube` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools for **Tienda Nube / Nuvemshop** — the #2 e-commerce platform in Argentina (100k+ merchants, also strong in BR + MX). Drops into Vercel AI SDK 6+ as a tool collection. Real REST adapter + in-memory adapter + OAuth helpers.

## When to use which tool

| Goal                                          | Tool                              | Notes                                       |
| --------------------------------------------- | --------------------------------- | ------------------------------------------- |
| What store are we connected to?               | `tienda_nube_get_store`           | One-shot metadata.                           |
| Catalog browse / search                       | `tienda_nube_list_products`       | Substring `q`, paginated, `publishedOnly`.  |
| Inspect a product (variants + stock)          | `tienda_nube_get_product`         |                                              |
| Inbox of paid orders this month               | `tienda_nube_list_orders`         | Filter `paymentStatus: "paid"` + `sinceIso`. |
| Reconcile a specific order                    | `tienda_nube_get_order`           | Includes contact email + addresses.          |
| Customer profile / total spent                | `tienda_nube_get_customer`        |                                              |
| Subscribe to merchant events                  | `tienda_nube_create_webhook`      | https:// URL required.                       |
| Clean up webhooks on app uninstall            | `tienda_nube_delete_webhook`      | Idempotent.                                  |

## Constraints

- **Prices are decimal strings.** `"100.00"`, not `100`. Avoid floats — Tienda Nube uses strings to prevent rounding bugs. Convert via `Number(...)` only at display time.
- **Names + descriptions are localized.** `name: { es: "Remera", pt: "Camiseta", en: "T-shirt" }`. Pull whichever matches `store.main_language`.
- **Pagination is page-based**, not cursor-based. Use `page` + `perPage` (max 200). `result.hasMore` says if there's another page.
- **`Authentication` header, NOT `Authorization`.** Tienda Nube's quirk; the HTTP adapter handles it but if you're rolling your own request layer, mind the spelling.

## Confirmation gates (HITL)

- `tienda_nube_create_webhook` — registers an external subscription that will start firing immediately. Confirm if the agent is acting on a merchant's behalf without explicit prior consent.
- `tienda_nube_delete_webhook` — irreversible. Confirm if the agent isn't certain it owns the subscription.

Read-only tools (`get_*` + `list_*`) don't need a gate.

## Error model

- `TiendaNubeValidationError` — bad input. Do NOT retry.
- `TiendaNubeAuthError` — 401/403. Token was invalidated (typically by merchant app-uninstall). Do NOT retry; the host must re-OAuth.
- `TiendaNubeApiError` — non-2xx that's not auth. `retryable: true` for 5xx + 429. Caller decides.
- `TiendaNubeUnconfiguredError` — adapter not wired. Surface to operator.

## Decision tree on the `paymentStatus`

- `paid` → money received, ready to fulfill.
- `authorized` → reserved on the card but not captured. Order is committed but not paid yet.
- `pending` → waiting on the customer (e.g. cash transfer, Mercado Pago Cobro Express).
- `voided` → cancelled before capture; no money moved.
- `refunded` → fully or partially refunded.
- `abandoned` → cart never finalized; not a real order from a billing perspective.

## AR context (for non-AR agents)

- **Tienda Nube ≠ Mercado Libre.** Tienda Nube is the SaaS that gives a merchant their OWN storefront (think Shopify but AR-first). MELI is the marketplace. A merchant can sell on both; the two APIs are unrelated.
- **OAuth scope is fixed at app-registration time** (Partner Portal → Permissions). The agent can't change it at runtime; the `scope` field in `OAuthTokenSet` just echoes back what the app was configured with.
- **Tokens don't expire**, but uninstalls invalidate them. Subscribe to `app/uninstalled` so cleanup is reactive instead of waiting for the next 401.

## What this package does NOT cover (v0.1)

- **Write operations** (create_product, update_order). The Tienda Nube product schema is variant-rich enough that we want to settle the types before exposing writes. Planned for v0.2.
- **Drafts / abandoned carts**.
- **Fulfillment shipments** (separate endpoint group).
- **Multi-store apps** — the adapter is store-scoped by design. Run one adapter instance per store.
