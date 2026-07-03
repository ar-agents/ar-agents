# @ar-agents/treasury

## 0.5.0

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

## 0.4.0

### Minor Changes

- [#130](https://github.com/ar-agents/ar-agents/pull/130) [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b) Thanks [@naza00000](https://github.com/naza00000)! - **OUSD → ARS route** (`createOusdArsRoute`). The on-thesis way ar-agents handles Open USD off-ramping: it does NOT become the ramp (that is a regulated PSAV/VASP — CNV registration, AML, banking). It ORCHESTRATES on top of a licensed `OffRampAdapter` (Bitso/Ripio/Manteca/Mural) and adds the parts that are ours — the AFIP-correct `accounting_payload` (mark-to-market ARS valuation at execution time, reported separately from the provider's realized ARS so the off-ramp spread is a visible cost) and the registry/guardrail posture. `convert` is irreversible: gate it behind art.102 + spending guardrails.

  **MOCK-until-live.** OUSD is not issued yet and no AR PSAV has listed it, so by default both legs are mocked (`InMemoryOffRampAdapter` + `mockFxOracle`). `route.live` is `false` until `OPEN_USD.status === "live"`. Pass a real `provider` + `fx` once OUSD is live, a provider lists it, and the AR legal/FX (cepo) treatment is cleared.

  - `@ar-agents/treasury` now depends on `@ar-agents/core` for the accounting bridge.
  - `@ar-agents/core`: `OPEN_USD.status` is now typed `OpenUsdStatus` (`"pre-launch" | "live"`) so downstream code can gate on `=== "live"`.

### Patch Changes

- Updated dependencies [[`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1), [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c), [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b)]:
  - @ar-agents/core@0.3.0

## 0.3.0

### Minor Changes

- [#98](https://github.com/ar-agents/ar-agents/pull/98) [`82e5afa`](https://github.com/ar-agents/ar-agents/commit/82e5afa5ff4b0a4802f5d4576275fe32cfc775d7) Thanks [@naza00000](https://github.com/naza00000)! - Add `BitsoOffRampAdapter` — a self-serve USDT→ARS off-ramp via Bitso.

  Bitso is Argentina's largest exchange with a public HMAC-signed Trading API and self-serve API keys (no sales gate like Manteca, no invite wall like Mural). The adapter implements `OffRampAdapter` over the exchange model: market-sell USDT on `usdt_ars`, then withdraw the realized ARS to the society's CBU/CVU over the BIND/Coelsa rail (`POST /v3/withdrawals`). The payout leg is natively idempotent via a deterministic `origin_id` derived from `externalId`, and `convert()` looks the withdrawal up by `origin_id` first, so a retry neither double-sells nor double-pays.

  Note: the off-ramp stablecoin is **USDT** — Bitso has no USDC book and does not custody USDC. New exports: `BitsoOffRampAdapter`, `BitsoConfig`, `BitsoApiError`/`BitsoAuthError`/`BitsoRateLimitError`, `normalizeBitsoStatus`, `deriveOriginId`, `BITSO_PROD`, `BITSO_SANDBOX`. Also adds a coverage gate to `@ar-agents/treasury` (was previously untested in CI).
