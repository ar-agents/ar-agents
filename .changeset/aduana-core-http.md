---
"@ar-agents/aduana": minor
---

Migrate `HttpAduanaAdapter` onto `@ar-agents/core`'s `HttpClient` (SDK-audit P1 #14, following banking-bcra and inpi).

The ARCA Aduana lookups now run through the shared transport: a real per-request timeout (default 10s — the reads had none, so a slow ARCA endpoint hung the agent forever), idempotent-GET retry with jittered backoff, and typed errors mapped back to `AduanaApiError`.

Responses are now **schema-validated**, fixing the audit's `found: true`-on-any-200 bug: `lookupDespacho` used to stamp `found: true` onto whatever came back with HTTP 200, so an error page or an empty `{}` became a "found" customs declaration. It now requires a valid despacho `status` and throws `ArAgentsResponseValidationError` on anything else — a non-despacho body can no longer masquerade as a real, found declaration. `lookupNcm` is likewise validated. Both still return the not-found sentinel (`{found:false}` / `null`) on a genuine 404.

New `HttpAduanaAdapterOptions`: `timeoutMs`, `retry`, `userAgent`. The `fetch` option is unchanged.
