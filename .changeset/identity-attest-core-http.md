---
"@ar-agents/identity-attest": minor
---

Migrate the MercadoPago identity adapter onto `@ar-agents/core`'s `HttpClient` (SDK-audit P1 #14, following banking-bcra, inpi, and aduana).

`MercadoPagoIdentityAdapter` is a trust-critical adapter — a successful MP micro-charge is used as *implicit identity proof* — and the audit flagged its network path as LOW: **zero timeout** on `api.mercadopago.com` (a hung request blocked verification forever) and a **blind `as {…}` cast with an unguarded JSON parse** on the payment body.

Now both the payment lookup (`GET /v1/payments/{id}`) and the best-effort refund (`POST …/refunds`) run through the shared client, which adds a real per-request timeout (default 10s), idempotent-GET retry with backoff, and — for the refund — `retry: false` so a non-idempotent refund is never fired twice. Most importantly the payment body is **schema-validated**: a 200 that isn't a real MP payment (missing `status`/`transaction_amount`) now throws `AttestAdapterError` (fail-closed) instead of being cast into a verification and minting an identity attestation from garbage. A non-2xx lookup still returns `{ verified: false }`; approved-payment behavior and subject binding are unchanged.

New `MercadoPagoIdentityAdapterOptions.timeoutMs`. The `fetchImpl`/`baseUrl`/`accessToken` options are unchanged.
