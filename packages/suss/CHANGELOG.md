# @ar-agents/suss

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
