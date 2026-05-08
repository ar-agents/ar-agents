# @ar-agents/mercadolibre

## 0.1.0 — Unreleased

First public release. Production-grade TypeScript SDK for MercadoLibre's
agent-relevant API surface. Faithful to the docs at
[developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar/).

The previous official `mercadolibre/nodejs-sdk` was archived in February
2022. This package fills that gap with a modern, agent-ergonomic, edge-
runtime-compatible client.

### What ships in 0.1

- **`MeliClient`** — typed HTTP client with OAuth 2.0 (offline_access),
  mutex-protected refresh-token rotation (defends against the
  `refresh_token_reused` race), exponential-backoff retry on 5xx + 429,
  per-seller rate limiting (1500 req/min default).
- **Items** — create/update/get/pause/close/relist, variations, pictures,
  descriptions; multiget; seller-side search with `scroll_id` pagination.
- **Categories** — `category_predictor.predict`, `domain_discovery.search`,
  `domains/{id}/technical_specs/input`. The triple that lets agents
  auto-categorize listings AND auto-fill required attributes.
- **Questions** — list (paginated), answer, blacklist, spam-vs-real
  classifier helper.
- **Orders + Packs** — search, get with billing_info, `marketplace/orders/pack/{pack_id}`
  for cart orders (the 30%-of-volume case naive iterators miss).
- **Claims / Mediation** — list, get, evidence upload (one-shot, immutable),
  message thread, return-review accept/reject. The 2-day SLA defender
  pattern.
- **Shipments** — get, history, labels (PDF/ZPL), shipping_options leadtime,
  `shipping_modes` (Flex / Cross-docking / Drop-off / Full).
- **Reputation** — `seller_reputation` snapshot, plus a `monitor()` helper
  that polls and fires alerts before the thermometer drops.
- **Promotions** — `seller-promotions/candidates` listener (the buried-but-
  money-printing endpoint), opt-in with margin guards.
- **Webhooks** — typed parser for all 20+ topics, `replayMissedFeeds()`
  helper that polls `/myfeeds?app_id&topic` to recover events ML dropped
  within the 2-day retention window.
- **Vercel AI SDK 6 tools** at `/ai-sdk` — drop-in tools for
  `Experimental_Agent` covering every domain.
- **`MockMeliClient`** at `/testing` — ready-made fakes for unit tests.
