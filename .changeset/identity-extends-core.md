---
"@ar-agents/identity": minor
---

`IdentityError` now extends `ArAgentsError` from `@ar-agents/core`.

This gives the package a uniform error shape with the rest of the
`@ar-agents/*` family so middleware (`withRetry`, `withMetrics`, etc.)
can switch on the same `code` / `retryable` / `context` fields across
every integration.

The existing public API is preserved — `new IdentityError(code, message,
details?)` still works, and `code` is still narrowed to
`IdentityErrorCode`. The legacy `details` field is kept on the instance
and is also mirrored under `context.details` for new code that reads
the `ArAgentsError` contract.

Per-code retryability defaults are now exposed via `error.retryable`:

| Code | Retryable |
|---|---|
| `afip_service_unavailable` | `true` |
| `afip_rate_limited` | `true` |
| `afip_not_configured` | `false` |
| `afip_cert_invalid` | `false` |
| `afip_cuit_not_found` | `false` |
| `afip_unknown_error` | `false` |

No breaking changes; consumers who handled `IdentityError` via
`instanceof` continue to work, and they additionally satisfy
`isArAgentsError()`.
