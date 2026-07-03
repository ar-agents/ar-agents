---
"@ar-agents/inpi": minor
---

Migrate `HttpInpiAdapter` onto `@ar-agents/core`'s `HttpClient` (SDK-audit P1 #14, following banking-bcra).

The trademark searches now run through the shared transport: a real per-request timeout (default 10s — a slow/flaky INPI mirror previously hung the agent forever), idempotent-GET retry with jittered backoff (the public mirror is flaky, so a transient 5xx/timeout is retried), and typed errors mapped back to `InpiApiError`.

Most importantly, responses are now **schema-validated**: a search body that isn't a `{ records: TrademarkRecord[] }` envelope — an error page, an empty `{}`, or a record with an unknown `status` — now throws `ArAgentsResponseValidationError` instead of being blind-cast into `records: []` and read downstream as **"no conflicting trademarks."** That fabrication could have greenlit registering an infringing mark. `getByActa` still returns `null` on 404.

New `HttpInpiAdapterOptions`: `timeoutMs`, `retry`, `userAgent`. The `fetch` option is unchanged (already a standard `fetch`).
