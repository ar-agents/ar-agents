# @ar-agents/treasury

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
