# @ar-agents/treasury

## 0.3.0

### Minor Changes

- [#98](https://github.com/ar-agents/ar-agents/pull/98) [`82e5afa`](https://github.com/ar-agents/ar-agents/commit/82e5afa5ff4b0a4802f5d4576275fe32cfc775d7) Thanks [@naza00000](https://github.com/naza00000)! - Add `BitsoOffRampAdapter` — a self-serve USDT→ARS off-ramp via Bitso.

  Bitso is Argentina's largest exchange with a public HMAC-signed Trading API and self-serve API keys (no sales gate like Manteca, no invite wall like Mural). The adapter implements `OffRampAdapter` over the exchange model: market-sell USDT on `usdt_ars`, then withdraw the realized ARS to the society's CBU/CVU over the BIND/Coelsa rail (`POST /v3/withdrawals`). The payout leg is natively idempotent via a deterministic `origin_id` derived from `externalId`, and `convert()` looks the withdrawal up by `origin_id` first, so a retry neither double-sells nor double-pays.

  Note: the off-ramp stablecoin is **USDT** — Bitso has no USDC book and does not custody USDC. New exports: `BitsoOffRampAdapter`, `BitsoConfig`, `BitsoApiError`/`BitsoAuthError`/`BitsoRateLimitError`, `normalizeBitsoStatus`, `deriveOriginId`, `BITSO_PROD`, `BITSO_SANDBOX`. Also adds a coverage gate to `@ar-agents/treasury` (was previously untested in CI).
