# @ar-agents/core

## 0.3.1

### Patch Changes

- [#140](https://github.com/ar-agents/ar-agents/pull/140) [`1024d51`](https://github.com/ar-agents/ar-agents/commit/1024d5167f7ac8aca07da94354c748df7b2868ea) Thanks [@naza00000](https://github.com/naza00000)! - Correctness fixes across the live-integration adapters, each with a real-shape regression test.

  - **banking-bcra**: `getDebt` now parses the real BCRA `/Deudas` response, which nests entries under `results.periodos[].entidades` (the previous parser read a root-level `entidades` the endpoint never returns, so results came back empty). `DebtEntry.entidad` is now the bank **name** string to match the API (type change).
  - **treasury**: `fundTaxBuffer`'s default idempotency key now derives from stable inputs (obligation ids + required buffer) rather than the fx-dependent conversion output, so a retried call is correctly deduplicated by the off-ramp.
  - **facturacion**: the non-idempotent `FECAESolicitar` (CAE authorization) is no longer retried on timeout/5xx; numeric fields are validated at the client boundary before the request is built.
  - **ap2**: the multi-hop chain verifier now evaluates each Open Payment Mandate's constraints (budget/allowed-payee/execution-date) against the terminal Closed Payment Mandate, and `payment.budget`/`payment.agent_recurrence` are enforced via the budget tracker when one is supplied.
  - **agentic-commerce-bridge**: order totals now subtract discount/store-credit rows (previously added); a declined (402) payment is no longer cached under the Idempotency-Key so a retry can re-attempt; MP reconciliation requires the `external_reference` session binding.
  - **mercadolibre**: `iterateFeed` no longer leaves orphaned rejected promises on a chunk failure; `monitorReputation` re-throws on a 401/403 (revoked token) instead of polling indefinitely.
  - **whatsapp**: the non-idempotent `POST /messages` send is no longer retried (prevents duplicate sends); idempotent reads still retry.
  - **shipping**: non-idempotent Andreani create/cancel are no longer retried, and the adapter fails loudly when the carrier response omits the tariff/cancellation fields instead of reporting `costArs:0`/`canceled:true`.
  - **core**: the art. 102 risk classifier no longer downgrades a Spanish money verb + read-ish noun (e.g. `pagar_saldo`) to `read`; such names gate correctly.

## 0.3.0

### Minor Changes

- [#129](https://github.com/ar-agents/ar-agents/pull/129) [`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1) Thanks [@naza00000](https://github.com/naza00000)! - **USD-rail architecture (rail-neutral), with Open USD (OUSD) as the flagship impl.**

  - **The Accounting Rule** — `buildAccountingPayload` + the `FxOracle` seam. Any USD-stablecoin movement yields a secondary local-currency valuation AT execution time (`{ usd, local, localCurrency, fxRate, fxSource, at, asset }`), so a USD act is AFIP/ARCA-correct. Rail-neutral (OUSD/USDC/…) and currency-neutral (`localCurrency` defaults to ARS). Pure: the FX feed is injected; `mockFxOracle` (source `"mock"`, so production valuation can refuse it) is provided for tests.
  - **`OpenUsdRail`** — the `FiatRail` implementation for Open USD (the Open Standard consortium stablecoin). It is ONE `FiatRail` impl among many (Bitso/Ripio/Manteca already exist): ar-agents stays architected around the `FiatRail` SEAM, not around OUSD. `settle` is irreversible (gate behind art.102 + guardrails), idempotent by `externalId`, and also exposes `accountingFor` to value a bare OUSD movement.
  - **MOCK-ONLY.** `OPEN_USD.status === "pre-launch"` (OUSD launches later in 2026). ALL chain interaction is behind the injectable `OpenUsdSettlementBackend` (default: deterministic `mockOpenUsdBackend`, zero web3 deps). A real backend is wired only once OUSD is live AND the AR legal/FX treatment is cleared.

  New exports: `buildAccountingPayload`, `mockFxOracle`, `createOpenUsdRail`, `mockOpenUsdBackend`, `OPEN_USD`, and the `FxRate` / `FxOracle` / `AccountingPayload` / `OpenUsdRail` / `OpenUsdRailOptions` / `OpenUsdSettlementBackend` types.

- [#114](https://github.com/ar-agents/ar-agents/pull/114) [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c) Thanks [@naza00000](https://github.com/naza00000)! - Add jurisdiction seam: `Jurisdiction` / `FiatRail` / `Registry` / `TaxRule` interfaces + AR first impl (`AR_CEDULAR`, `AR_MONOTRIBUTO`, `AR_TAX_RULES`, `createArJurisdiction`, `createJurisdictionRegistry`). Additive, export-only; no breaking change. AR is jurisdiction [#1](https://github.com/ar-agents/ar-agents/issues/1), not the only one — the registry and fiat rails are injected by the host so core stays dependency-free.

### Patch Changes

- [#130](https://github.com/ar-agents/ar-agents/pull/130) [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b) Thanks [@naza00000](https://github.com/naza00000)! - **OUSD → ARS route** (`createOusdArsRoute`). The on-thesis way ar-agents handles Open USD off-ramping: it does NOT become the ramp (that is a regulated PSAV/VASP — CNV registration, AML, banking). It ORCHESTRATES on top of a licensed `OffRampAdapter` (Bitso/Ripio/Manteca/Mural) and adds the parts that are ours — the AFIP-correct `accounting_payload` (mark-to-market ARS valuation at execution time, reported separately from the provider's realized ARS so the off-ramp spread is a visible cost) and the registry/guardrail posture. `convert` is irreversible: gate it behind art.102 + spending guardrails.

  **MOCK-until-live.** OUSD is not issued yet and no AR PSAV has listed it, so by default both legs are mocked (`InMemoryOffRampAdapter` + `mockFxOracle`). `route.live` is `false` until `OPEN_USD.status === "live"`. Pass a real `provider` + `fx` once OUSD is live, a provider lists it, and the AR legal/FX (cepo) treatment is cleared.

  - `@ar-agents/treasury` now depends on `@ar-agents/core` for the accounting bridge.
  - `@ar-agents/core`: `OPEN_USD.status` is now typed `OpenUsdStatus` (`"pre-launch" | "live"`) so downstream code can gate on `=== "live"`.

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
