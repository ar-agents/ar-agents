---
"@ar-agents/shipping": patch
---

Rebuild `shippingFetch` on `@ar-agents/core`'s retry engine (`runWithRetry` +
the idempotency-aware classifier), replacing the hand-rolled
AbortController/setTimeout loop. This fixes a real bug: a per-attempt timeout
now gets retried for idempotent requests (GET tariff/tracking lookups), as the
docstring always promised, instead of aborting the whole call on the first
timeout. Non-idempotent writes (crear/cancelar) are still never retried, and
the helper still returns the raw `Response` for every status, so the adapter
error contract is unchanged.
