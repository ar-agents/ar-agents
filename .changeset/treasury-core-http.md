---
"@ar-agents/treasury": minor
---

Migrate the three real-network off-ramp adapters (Manteca, Bitso, Ripio) off their hand-rolled `fetch` + `Promise.race` timeout onto the shared, schema-validating `HttpClient` from `@ar-agents/core`. Every provider now gets a real per-request timeout, 429/`Retry-After` backoff, idempotency-aware retry, and typed `ArAgents*` errors mapped back into each provider's existing `*ApiError`/`*AuthError`/`*RateLimitError` taxonomy (all asserted error codes preserved).

The point of the migration on this MONEY path: quote / balance / order / status responses are now validated (a new zero-dependency structural `ResponseSchema` in `http.ts`, since the package's main entry must stay zod-free), so a malformed or wrong-shape body fails LOUD (`ArAgentsResponseValidationError` surfaced as the provider's 502 ApiError) instead of being blind-cast into a fabricated zero balance, false-success order, or bogus quote. Bitso's `{success:false}`-on-HTTP-200 envelope and its exact HMAC-signed request-path are preserved via `requestRaw`.

Idempotency is unchanged and money-safe: every irreversible call — Manteca `ramp-off`, Bitso market-sell + ARS `withdrawal`, Ripio `offrampSession` — is a non-idempotent POST that the client NEVER auto-retries (a timeout-after-submit cannot fire a second sale/withdrawal); only GET reads (quote/balance/status/lookup) retry a transient 5xx. Bitso's server-side `origin_id` dedupe still guards an explicit `convert()` retry. New tests assert: a malformed 200 body fails loud, a money POST is fired exactly once on a transient 5xx, and an idempotent GET retries then succeeds. A per-adapter `timeoutMs` option was added.
