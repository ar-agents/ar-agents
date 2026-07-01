---
"@ar-agents/core": minor
---

**USD-rail architecture (rail-neutral), with Open USD (OUSD) as the flagship impl.**

- **The Accounting Rule** — `buildAccountingPayload` + the `FxOracle` seam. Any USD-stablecoin movement yields a secondary local-currency valuation AT execution time (`{ usd, local, localCurrency, fxRate, fxSource, at, asset }`), so a USD act is AFIP/ARCA-correct. Rail-neutral (OUSD/USDC/…) and currency-neutral (`localCurrency` defaults to ARS). Pure: the FX feed is injected; `mockFxOracle` (source `"mock"`, so production valuation can refuse it) is provided for tests.
- **`OpenUsdRail`** — the `FiatRail` implementation for Open USD (the Open Standard consortium stablecoin). It is ONE `FiatRail` impl among many (Bitso/Ripio/Manteca already exist): ar-agents stays architected around the `FiatRail` SEAM, not around OUSD. `settle` is irreversible (gate behind art.102 + guardrails), idempotent by `externalId`, and also exposes `accountingFor` to value a bare OUSD movement.
- **MOCK-ONLY.** `OPEN_USD.status === "pre-launch"` (OUSD launches later in 2026). ALL chain interaction is behind the injectable `OpenUsdSettlementBackend` (default: deterministic `mockOpenUsdBackend`, zero web3 deps). A real backend is wired only once OUSD is live AND the AR legal/FX treatment is cleared.

New exports: `buildAccountingPayload`, `mockFxOracle`, `createOpenUsdRail`, `mockOpenUsdBackend`, `OPEN_USD`, and the `FxRate` / `FxOracle` / `AccountingPayload` / `OpenUsdRail` / `OpenUsdRailOptions` / `OpenUsdSettlementBackend` types.
