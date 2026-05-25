---
"@ar-agents/mercadopago": minor
---

`MercadoPagoError` now extends `ArAgentsError` from `@ar-agents/core`.

Brings family-coherence to the flagship integration. Every MP error
(`MercadoPagoAuthError`, `MercadoPagoRateLimitError`,
`MercadoPagoOverloadedError`, `MercadoPagoTimeoutError`,
`MercadoPagoPaymentRejectedError`, …) now exposes the uniform
`{ code, retryable, context }` contract so `@ar-agents/core`'s
`withRetry` middleware (and any external middleware) can switch on
the same fields used by every other `@ar-agents/*` package.

Codes assigned:

| Subclass | code | retryable |
|---|---|---|
| `MercadoPagoError` (generic) | `mp_api_error` | `true` for 5xx / 429 / `status:0` |
| `MercadoPagoAuthError` | `mp_auth_failed` | `false` |
| `MercadoPagoRateLimitError` | `mp_rate_limited` | `true` |
| `MercadoPagoOverloadedError` | `mp_overloaded` | `true` |
| `MercadoPagoTimeoutError` | `mp_timeout` | `true` |
| all 400 subclasses (back_url / self-payment / country / authorize) | `mp_api_error` | `false` |

Backward compatible: all existing public properties (`status`,
`endpoint`, `mpResponse`, `retryAfterSeconds`, `preapprovalId`, …) are
preserved on the instance AND mirrored into `context` for new code
that reads the `ArAgentsError` contract. `instanceof MercadoPagoError`
keeps working; `isArAgentsError(e)` now additionally returns `true`.

All 328 existing mercadopago tests pass with no changes.
