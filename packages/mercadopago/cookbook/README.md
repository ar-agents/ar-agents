# Cookbook — `@ar-agents/mercadopago`

Real, copy-pasteable recipes for the most common MP integration flows. Every
recipe is a self-contained Next.js route handler or agent loop you can
deploy on Vercel as-is.

## Recipes

| #   | File                              | Pattern                                                                 |
| --- | --------------------------------- | ----------------------------------------------------------------------- |
| 01  | `01-checkout-pro-basic.ts`        | First-time hosted-checkout sale (Checkout Pro preference + back URLs)   |
| 02  | `02-saas-subscription.ts`         | Reusable plan + subscription with first-payment + card swap on failure  |
| 03  | `03-webhook-handler.ts`           | Vercel route handler with HMAC verify + auto-fetch + dispatch by topic  |
| 04  | `04-marketplace-split.ts`         | OAuth seller link → preference with `marketplace_fee` → reconciliation  |
| 05  | `05-qr-in-store.ts`               | Create POS → generate QR → poll status → notify buyer via WhatsApp      |
| 06  | `06-3ds-challenge.ts`             | Detect challenge → redirect buyer → recover via webhook                 |
| 07  | `07-auth-only-order.ts`           | `Order` with manual capture → capture later when service completes      |
| 08  | `08-recovery-patterns.ts`         | Retry expired subscriptions, recover stuck-pending payments, etc.       |
| 09  | `09-otel-wired.ts`                | Full OpenTelemetry wiring — spans + metrics for every MP call + tool    |

## Conventions

- All recipes assume `MP_ACCESS_TOKEN` is set (TEST- prefix in sandbox).
- All recipes show the agent path AND the manual-client path side by side
  where relevant.
- Recipes that need state use `VercelKVSubscriptionStateAdapter` —
  swap for `InMemoryStateAdapter` in tests.
- Recipes that need OAuth credentials assume `MP_CLIENT_ID` + `MP_CLIENT_SECRET`.
- Recipes that need webhook secrets assume `MP_WEBHOOK_SECRET`.
- All `Edge Runtime` compatible (Web Crypto only — no `node:crypto`).

## Deploying as Vercel functions

Each recipe is a standalone TypeScript file you can drop into
`apps/your-app/src/app/api/mp/{route}.ts` (App Router) or
`apps/your-app/pages/api/mp/{route}.ts` (Pages Router). Add `export const runtime = "edge"` if
you want Edge Runtime; the toolkit is fully Edge-compatible.
