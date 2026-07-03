---
"@ar-agents/bind": minor
---

Migrate `HttpBindAdapter` onto `@ar-agents/core`'s `HttpClient` (SDK-audit P1 #14).

Every BIND APIBANK call now runs through the shared client: timeout, backoff retry, `429`/`Retry-After`, and typed errors. The JWT auth flow (literal `JWT <token>` scheme, lazy login, 60s-early refresh, retry-once-on-401) is preserved, now expressed against the client's typed errors. Responses are **schema-validated** against the package's own zod schemas (accounts, movements, ownership, transfer/DEBIN results, echeqs): a malformed body on the irreversible-transfer surface now resolves to a structured `{ ok: false, code: "api_error" }` instead of being blind-cast into a fabricated `{ ok: true }` success.

Idempotency is safe by construction: the money `POST`s (TRANSFER / DEBIN) and login are non-idempotent and are **never auto-retried**; only idempotent GET reads retry a transient 5xx. HTTP errors map to `api_error` (with the upstream status); network/timeout failures map to `network_error` — same structured `BindResult` envelope as before. The `fetchImpl`/`baseUrl`/`timeoutMs`/`bankId`/`viewId` options are unchanged.
