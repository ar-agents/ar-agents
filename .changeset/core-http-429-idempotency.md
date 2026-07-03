---
"@ar-agents/core": patch
---

Fix a money-safety hole in the `HttpClient` retry classifier: a `429` was retried **unconditionally, ignoring idempotency**. A non-idempotent money `POST` (an off-ramp order, a payout, a transfer) that came back `429` — which can happen when the server rate-limits *after* partially processing, or where the retry itself re-submits — was auto-retried, risking a double-spend.

`429` now respects idempotency exactly like `5xx` and network errors: it is retried only when the request is idempotent (GET/PUT/DELETE/HEAD, or a POST/PATCH the caller explicitly marks `idempotent: true`). Idempotent GET reads still retry `429` and honor `Retry-After`. This was caught by an adversarial review of the treasury off-ramp adapters, where all three providers' order/withdraw/session POSTs were verified firing 3× on a `429`.
