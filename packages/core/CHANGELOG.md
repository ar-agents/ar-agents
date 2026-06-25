# @ar-agents/core

## 0.2.1

### Patch Changes

- [#85](https://github.com/ar-agents/ar-agents/pull/85) [`d2b62d9`](https://github.com/ar-agents/ar-agents/commit/d2b62d9d576312e0f2f2789a5a9613cfc56472ac) Thanks [@naza00000](https://github.com/naza00000)! - Security: `withTimeout` now throws a NON-retryable timeout error. Previously it
  marked the timeout `retryable: true` while NOT cancelling the underlying call,
  so composing `withApproval` + `withRetry` + `withTimeout` could re-invoke a
  still-running side-effectful tool after a timeout — turning one approved
  money/fiscal/irreversible action into several (double-execution). An uncancelled
  timeout must not be retried; retry-on-timeout is only safe once execution is
  genuinely aborted (AbortSignal) or protected by a deterministic idempotency key.
  (Found by a DeepSec audit; regression test added.)

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
