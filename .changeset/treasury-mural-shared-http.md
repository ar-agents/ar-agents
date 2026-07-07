---
"@ar-agents/treasury": patch
---

Migrate `MuralOffRampAdapter` onto the shared `HttpClient` from
`@ar-agents/core`, matching the Bitso/Manteca/Ripio adapters: per-request
timeout (new `MuralConfig.timeoutMs`, default 30s), idempotent-only retry
(GET status reads retry transient 5xx; the money POSTs are never
auto-retried), and schema-validated response bodies so a malformed fees,
payout, or status body fails loud as a typed `MuralApiError` instead of being
blind-cast into a fabricated result. Public API and the Mural error taxonomy
(`MuralApiError` / `MuralAuthError` / `MuralRateLimitError`) are unchanged.
