# @ar-agents/banking-bcra

## 0.4.0

### Minor Changes

- [#142](https://github.com/ar-agents/ar-agents/pull/142) [`21e5c38`](https://github.com/ar-agents/ar-agents/commit/21e5c389ca5355567c89c125a53749e3e22a50bf) Thanks [@naza00000](https://github.com/naza00000)! - Add a shared, schema-validating HTTP client to `@ar-agents/core` and migrate `@ar-agents/banking-bcra` onto it (the SDK-audit P1 architectural fix).

  **`@ar-agents/core`** now exports `HttpClient` — the one transport every adapter should build on: a real per-request timeout (AbortController, composed with the caller's signal), bounded jittered backoff, `429`/`Retry-After` handling, **idempotency-aware retry** (POST/PATCH are not retried unless explicitly marked safe, so a timeout-after-write can't duplicate a payment/invoice/shipment), SSRF-safe URL building, and typed `ArAgentsError` mapping. Crucially it validates the response body against a schema at the boundary via `parseOrThrow(schema, body)`, throwing the new `ArAgentsResponseValidationError` — so a malformed, partial, or silently-changed upstream body **fails loud instead of being blind-cast into a clean-looking result**. `ResponseSchema` is structural (any Zod schema satisfies it), so core stays zero-runtime-dependency. Also exported: `parseOrThrow`, `fetchWithRetry`, `defaultRetryClassifier`, `parseRetryAfter`, and the retry types.

  **`@ar-agents/banking-bcra`** now runs on `HttpClient`: transient `5xx`/timeouts on the (idempotent) GET reads are retried with backoff, and an envelope schema rejects any 200 body that isn't a real Central de Deudores response — closing the credit-check fabrication risk where an error page or truncated body could parse as debt-free/clean. `404` still maps to `BcraNotFoundError` and the rest of the public error taxonomy is unchanged. The `HttpBcraAdapterOptions.fetch` option now takes a standard `fetch` (the `FetchLike` type is retained but deprecated), and a `retry` option was added.

### Patch Changes

- Updated dependencies [[`21e5c38`](https://github.com/ar-agents/ar-agents/commit/21e5c389ca5355567c89c125a53749e3e22a50bf)]:
  - @ar-agents/core@0.4.0

## 0.3.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [[`1024d51`](https://github.com/ar-agents/ar-agents/commit/1024d5167f7ac8aca07da94354c748df7b2868ea)]:
  - @ar-agents/core@0.3.1

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

- [`ec51916`](https://github.com/ar-agents/ar-agents/commit/ec51916e02c22616941c2c52951bf296708f84a2) Thanks [@naza00000](https://github.com/naza00000)! - Two new packages: BCRA credit-check + AR payroll (SUSS / SICOSS).

  ## `@ar-agents/banking-bcra` (initial release)

  Read-only credit-history lookup against BCRA's public Central de Deudores + ChequesRechazados endpoints. The B2B credit-check default before extending any non-trivial line of credit.

  - `HttpBcraAdapter` — public BCRA API, no auth, no token. Maps 404 → `BcraNotFoundError` (which agents should treat as the "clean" outcome, not a failure). Maps 5xx/429 → retryable `BcraApiError`.
  - `InMemoryBcraAdapter` — deterministic seeded adapter.
  - `summarizeDebt` + `riskBand` — pure helpers that turn the multi-row BCRA response into a single risk band (`clean` | `low` | `watch` | `high`) ready to gate on.
  - 4 Vercel AI SDK tools: `bcra_get_debt`, `bcra_get_debt_summary` (the one you want), `bcra_get_historical_debt`, `bcra_get_bounced_checks`.
  - 25 offline tests.

  ## `@ar-agents/suss` (initial release)

  The first AR-payroll-aware agent library. There is no `pyafipws`-style equivalent for SICOSS.

  - `calculateEmployeeMonth` — per-employee monthly aportes (employee-side 17% — 11% jubilación + 3% INSSJP + 3% obra social) + contribuciones (employer-side ~28.31% en régimen general — 10.17% jub + 1.5% INSSJP + 4.7% AAFF + 0.94% FNE + 6% obra social + 5% ART configurable).
  - `buildSicossDdjj` — monthly DDJJ assembly with vector totals (Seguridad Social / Obra Social / ART) + per-employee detail.
  - Two régimenes baked in: `general` (Decreto 814/01) and `grandes_empleadores` (Decreto 1009/01). `promocion_empleo` reserved as a regime code; caller applies external reductions.
  - ART rate configurable (it's per-employer per-ART-provider, not a fixed %).
  - 3 Vercel AI SDK tools.
  - 23 offline tests.

  Together with `@ar-agents/sicore` (Ganancias retentions) and `@ar-agents/iibb` (provincial IIBB), this closes the full federal tax + social-security surface for any AR-payroll agent.
