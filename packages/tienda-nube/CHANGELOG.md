# @ar-agents/tienda-nube

## 0.3.0

### Minor Changes

- [#152](https://github.com/ar-agents/ar-agents/pull/152) [`2d9985d`](https://github.com/ar-agents/ar-agents/commit/2d9985d17894ec7dd731434a3fcbd11391b703ab) Thanks [@naza00000](https://github.com/naza00000)! - Migrate the real-network `HttpTiendaNubeAdapter` off its hand-rolled fetch + `Promise.race` timeout onto the shared `HttpClient` from `@ar-agents/core`. The old transport blind-cast every JSON body with `parsed as T`, so a malformed, partial, or HTML error-page 200 would silently become a clean-looking `Store` / `Order` / `Product` / `Customer` / `Webhook`. Response bodies are now validated against minimal zod schemas (`.loose()` so upstream additions survive) and a bad body fails loud as a `TiendaNubeApiError(502)` instead of fabricating a record. Single-object GETs route through `client.request({ schema })`; list reads use `client.requestRaw` so the `Link: rel="next"` pagination header is still read, then validate the array body via `parseOrThrow`. The non-standard `authentication: bearer <token>` header and the required User-Agent are preserved, 401/403 still map to `TiendaNubeAuthError`, and a genuine 404 still surfaces as `TiendaNubeApiError(404)`. Idempotency is correct by construction: GET reads and the idempotent webhook DELETE retry once on a transient 5xx/429/network fault, while the non-idempotent webhook-create POST is never auto-retried. The deprecated `FetchLike` type alias is retained (now `= typeof fetch`) so external type imports keep compiling.

### Patch Changes

- Updated dependencies [[`2d9985d`](https://github.com/ar-agents/ar-agents/commit/2d9985d17894ec7dd731434a3fcbd11391b703ab)]:
  - @ar-agents/core@0.4.1

## 0.2.3

### Patch Changes

- Updated dependencies [[`21e5c38`](https://github.com/ar-agents/ar-agents/commit/21e5c389ca5355567c89c125a53749e3e22a50bf)]:
  - @ar-agents/core@0.4.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1), [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c), [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b)]:
  - @ar-agents/core@0.3.0

## 0.2.1

### Patch Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

## 0.2.0

### Minor Changes

- [`ae82cc9`](https://github.com/ar-agents/ar-agents/commit/ae82cc9c3c3d7ac744d5653ada169505c029c7f5) Thanks [@naza00000](https://github.com/naza00000)! - Second lift wave: the 4 swarm-wave packages now extend `ArAgentsError`
  from `@ar-agents/core`.

  This brings the family-coherence count to **10 / 26 packages** all
  emitting the uniform `{ code, retryable, context }` shape that
  `@ar-agents/core` middleware (`withRetry`, `withMetrics`, …)
  expects without parsing messages.

  `banking-bcra`, `suss`, and `tienda-nube` already exposed the same
  field surface; the change is purely the base class. `wscdc` previously
  used standalone fields (`field`, `status`, `faultCode`); they're kept
  on the instances and now ALSO mirrored into `context` for cross-package
  middleware.

  All 106 tests across the 4 packages pass; no public-API changes.

## 0.1.0

### Minor Changes

- [`5092a96`](https://github.com/ar-agents/ar-agents/commit/5092a96c98b11b21815562aa3ce36460f96381ea) Thanks [@naza00000](https://github.com/naza00000)! - Two new packages: shared middleware primitives + Tienda Nube.

  ## `@ar-agents/core` (initial release)

  Lifts the shared primitives the family was reinventing per-package into one zero-runtime-dep library. Every other `@ar-agents/*` package can build on top.

  - **Typed error base** — `ArAgentsError` with `code` + `retryable` + `context`. Subclasses: `ArAgentsValidationError`, `ArAgentsAuthError`, `ArAgentsRateLimitError` (carries `retryAfterMs`), `ArAgentsProtocolError`, `ArAgentsUnconfiguredError`. `isArAgentsError()` type guard lets callers write retry logic that's portable across tools.
  - **Telemetry hook contract** — `TelemetryHook` interface; OTel / Datadog / Honeycomb / console all plug in behind the same shape. `combineHooks()` multiplexes; a throwing hook never crashes the request.
  - **Tool middleware** — `compose`, `applyToAllTools`, `withMetrics` (emits one ToolEvent per invocation), `withTimeout` (retryable timeout error), `withRetry` (exponential backoff honoring `ArAgentsRateLimitError.retryAfterMs`), `withApproval` (HITL gate enforced at runtime, not just hinted in manifests).
  - 23 offline tests, zero deps, ESM+CJS+DTS.

  ## `@ar-agents/tienda-nube` (initial release)

  The [#2](https://github.com/ar-agents/ar-agents/issues/2) e-commerce platform in Argentina (100k+ merchants). No competitor SDK ships agent-native ergonomics, so this is uncontested.

  - **`HttpTiendaNubeAdapter`** — real REST adapter against `https://api.tiendanube.com/v1/{storeId}`. Handles the platform-required UA shape (`{appName} ({contactEmail})`) + the `Authentication: bearer` header quirk (Tienda Nube uses `Authentication`, not `Authorization`). 5xx/429 → retryable; 401/403 → `TiendaNubeAuthError` (token typically invalidated by merchant uninstall).
  - **`InMemoryTiendaNubeAdapter`** — deterministic seeded adapter. Realistic substring search, status + payment-status filters, page-based pagination with `hasMore`.
  - **`UnconfiguredTiendaNubeAdapter`** — explicit throwing default.
  - **OAuth helpers** — `buildAuthorizeUrl({ appId, state })` + `exchangeCodeForToken({ appId, clientSecret, code })`. Tienda Nube tokens don't expire; uninstall invalidates them (subscribe to `app/uninstalled`).
  - **10 Vercel AI SDK tools** — get_store, list/get products, list/get orders (with status + payment_status + email + date-range filters), list/get customers, webhook list/create/delete.
  - 25 offline tests.
