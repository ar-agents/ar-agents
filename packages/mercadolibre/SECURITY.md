# SECURITY.md — `@ar-agents/mercadolibre`

> Threat model + audit results for the production-grade Mercado Libre Agent Toolkit.
>
> **Last reviewed:** 2026-05-09 (v0.1.0).

## Executive summary

| Concern | Status |
| --- | --- |
| Hard-coded secrets in source | None ✓ |
| `eval()` / `Function()` use | None ✓ |
| `http://` URL fetches | None — only `https://` ✓ |
| Production-bundle vulnerabilities | None ✓ |
| Webhook input bounds | Zod-validated, no recursion ✓ |
| OAuth refresh-token races | Mitigated (in-process mutex + CAS pattern docs) ✓ |
| Rate-limit per-tenant isolation | Yes — bucket scope keyed by `seller:<userId>` ✓ |
| Telemetry headers leak `Authorization` | No — hooks see URL + method + status, never headers ✓ |
| Token-bucket memory bound | Bounded — one bucket entry per scope, GC'd by reference ✓ |

## Threat model

### Trust boundaries

```
[ Agent runtime / your app ]   ←── trusts ──→   [ @ar-agents/mercadolibre ]
                                                     │
                                                     │  HTTPS only
                                                     ▼
                                           [ api.mercadolibre.com ]
```

The package treats the **agent runtime as fully trusted** (it controls the OAuth tokens, COGS table, evidence files). The package treats **MELI's API** as **partially trusted** — we always validate response shapes via Zod and we don't `eval` or `import()` anything from MELI's responses.

### Webhooks (the only direct ingress from the public internet)

`parseWebhook(body)` is the function callers run on inbound webhook deliveries. Risks:

- **Malformed JSON / non-object payload** → `MeliWebhookError`. Tested with property-based fuzzing (100 random samples per property).
- **Unbounded recursion** → not possible. The Zod schema is flat (no recursive references).
- **Memory bomb** → mitigated by your HTTP framework's body-size limit (Next.js defaults to 1 MB; Vercel Edge to 4 MB). The package itself doesn't allocate beyond the parsed object.
- **Replay attacks** → the package recommends idempotency dedup keyed by the event's `_id` (see [Cookbook 05](./cookbook/05-webhooks-with-replay.md)). Without a dedup table, MELI's natural retry-on-non-200 will cause double-processing. **This is the host's responsibility**, not the package's.
- **Origin authentication** → MELI does not sign webhook deliveries. Mitigations available to hosts:
  - Whitelist source IPs (MELI publishes a CIDR list; varies by region).
  - Use `expectedApplicationId` in `parseWebhook` to reject deliveries claiming to be from another application.

### OAuth flow

`exchangeAuthorizationCode` and `refreshTokens` are POST-form-urlencoded calls to `https://api.mercadolibre.com/oauth/token`. Risks:

- **Authorization-code interception** → callers MUST use HTTPS for `redirect_uri` (the package doesn't enforce this — MELI does).
- **Refresh-token reuse** → MELI uses single-use refresh tokens. Two parallel refreshes = both tokens dead. The package coalesces concurrent refreshes per-`userId` via an in-process `AsyncLock`. For cross-process safety, callers implement `OAuthTokenStore.saveTokens` with a database-level CAS (see [Cookbook 01](./cookbook/01-oauth-setup.md)).

### Rate limiting

`TokenBucketRateLimiter` is keyed by an arbitrary `scope` string. The client derives `seller:<userId>` for OAuth and `bearer:<token-suffix>` for direct-bearer auth. Risks:

- **Cross-tenant exhaustion** — calling tenant A doesn't consume tokens from tenant B's bucket because the scopes differ.
- **Memory growth** — buckets are kept in a `Map` keyed by scope. For a host with 100k sellers, this caps at ~10 MB. If you process millions of sellers per process, swap in your own `RateLimiter` implementation that GCs idle buckets.

### Telemetry

`onRequest` / `onResponse` / `onRetry` / `onRateLimitWait` hooks receive **method, URL, path, status, duration** — never headers (no Authorization leak) and never bodies (no PII leak). Hosts wiring these to OpenTelemetry, Sentry, Datadog can do so without redaction concerns.

### Code-injection surfaces

Audited and clean:

- No `eval()`.
- No `new Function()`.
- No `vm.runInNewContext`.
- No `child_process.exec` with user input.
- No dynamic `import()` based on data.

## Dependencies

Runtime dependencies (production bundle):

```
zod        (peer)  — schema validation
ai         (peer)  — Vercel AI SDK 6, only when /ai-sdk subpath is imported
```

There are **no other runtime dependencies**. The published bundle is:

- ESM `dist/index.js` — 67.8 KB
- CJS `dist/index.cjs` — 73.7 KB

Dev-time dependencies (NOT in the published bundle):

- `vitest`, `tsup`, `typescript`, `msw` — none reach production.

`pnpm audit --prod` is the source of truth for production-bundle CVEs. The 3 vulnerabilities reported by `pnpm audit` (without `--prod`) are all in dev tooling (`vite` / `esbuild` transitive) and don't affect end users.

## Reporting a vulnerability

Email `naza@helloastro.co` with subject prefix `[security]`. We aim to triage within 72 hours.

For coordinated disclosure with MELI's security team, file via [hackerone.com/mercadolibre](https://hackerone.com/mercadolibre) — this package is not affiliated with Mercado Libre S.R.L.
