# @ar-agents/boletin-oficial

## 0.1.0

### Minor Changes

- Initial release. Argentine Boletín Oficial as a structured firehose for AI agents on the Vercel AI SDK 6.
  - 4 secciones (primera/segunda/tercera/cuarta) catalog + heading-based tipo classifier.
  - `LiveBoFetcher` (web-scraping with retry + timeout), `MockBoFetcher` (in-memory for tests), `UnconfiguredBoFetcher` (safe-by-default).
  - `boletinOficialTools()` — 6 tools: bo_search, bo_get_norma, bo_today, bo_subscribe, bo_list_subscriptions, bo_unsubscribe.
  - Subscription matcher (keyword + CUIT + organismo + sección + tipo, AND semantics) + `InMemoryBoSubscriptionAdapter` + pluggable `BoSubscriptionAdapter` interface.
  - Heuristic CUIT extractor + canonical URL builder.
  - Pure-function helpers (classifyTipo, extractCuits, buildNormaUrl) safe to call in any environment.
