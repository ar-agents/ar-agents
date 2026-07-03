---
"@ar-agents/core": minor
"@ar-agents/banking-bcra": minor
---

Add a shared, schema-validating HTTP client to `@ar-agents/core` and migrate `@ar-agents/banking-bcra` onto it (the SDK-audit P1 architectural fix).

**`@ar-agents/core`** now exports `HttpClient` — the one transport every adapter should build on: a real per-request timeout (AbortController, composed with the caller's signal), bounded jittered backoff, `429`/`Retry-After` handling, **idempotency-aware retry** (POST/PATCH are not retried unless explicitly marked safe, so a timeout-after-write can't duplicate a payment/invoice/shipment), SSRF-safe URL building, and typed `ArAgentsError` mapping. Crucially it validates the response body against a schema at the boundary via `parseOrThrow(schema, body)`, throwing the new `ArAgentsResponseValidationError` — so a malformed, partial, or silently-changed upstream body **fails loud instead of being blind-cast into a clean-looking result**. `ResponseSchema` is structural (any Zod schema satisfies it), so core stays zero-runtime-dependency. Also exported: `parseOrThrow`, `fetchWithRetry`, `defaultRetryClassifier`, `parseRetryAfter`, and the retry types.

**`@ar-agents/banking-bcra`** now runs on `HttpClient`: transient `5xx`/timeouts on the (idempotent) GET reads are retried with backoff, and an envelope schema rejects any 200 body that isn't a real Central de Deudores response — closing the credit-check fabrication risk where an error page or truncated body could parse as debt-free/clean. `404` still maps to `BcraNotFoundError` and the rest of the public error taxonomy is unchanged. The `HttpBcraAdapterOptions.fetch` option now takes a standard `fetch` (the `FetchLike` type is retained but deprecated), and a `retry` option was added.
