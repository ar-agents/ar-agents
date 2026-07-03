---
"@ar-agents/uala": minor
---

Migrate `UalaApiAdapter` and the OAuth token helpers onto `@ar-agents/core`'s `HttpClient` (SDK-audit P1 #14).

Every Ualá Bis call now runs through the shared client: timeout, backoff retry, `429`/`Retry-After`, and typed errors mapped back to `UalaAuthError`/`UalaApiError`. The responses (payment links, transactions, payouts, balances) are **schema-validated**, so a malformed/partial body fails loud instead of being blind-cast into a `Payout`/`PaymentLink` with an undefined id/amount/status.

Idempotency is now correct on the money paths: a `POST` (create payment link / **create payout**) is only retried when the caller supplies an idempotency key — a keyless payout is never blind-retried on a transient 5xx (no double-spend). The two OAuth token endpoints (`exchangeCodeForToken`, `refreshAccessToken`), which previously had **no timeout**, now run through a timed one-shot client (`retry: 1`).

The `fetchImpl`/`baseUrl`/`timeoutMs` options are unchanged.
