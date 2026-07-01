# @ar-agents/iibb

## 0.4.3

### Patch Changes

- Updated dependencies [[`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1), [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c), [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b)]:
  - @ar-agents/core@0.3.0

## 0.4.2

### Patch Changes

- Rebuild and republish from PII-scrubbed source. Versions published before the 2026-06-17 fixture scrub shipped a real CUIT and address in their README/AGENTS/cookbook/dist; this rebuild from the now-clean source removes them. No API changes. The earlier contaminated versions are deprecated on npm.

## 0.4.1

### Patch Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

## 0.4.0

### Minor Changes

- [`baec8f1`](https://github.com/ar-agents/ar-agents/commit/baec8f109a790c9053b5b6da510a44933414e732) Thanks [@naza00000](https://github.com/naza00000)! - CM special regimes: Articles 6, 8, 9 (construction / transport / professional services).

  `computeDdjj` now accepts `cmArticle` (defaults to `art_2_general`) and
  `seatJurisdiction`. The three highest-volume CM special regimes are
  implemented:

  - **Article 6 — Construction**: 10% to the corporate seat, 90% prorated
    to the jurisdiction where the work was performed (new optional
    `IngresoLine.workJurisdiction`).
  - **Article 8 — Transport**: 100% to the trip's origin jurisdiction (new
    optional `IngresoLine.originJurisdiction`). No seat component.
  - **Article 9 — Professional services**: 20% to the corporate seat, 80%
    prorated to the jurisdictions where services were realized.

  Articles 7, 10, 11, 12, 13 are recognized but raise an actionable
  `IibbValidationError` explaining what per-article inputs they need
  (premium amounts, origin/destination, storage volumes). They can be
  handled off-package by feeding synthetic local DDJJs per jurisdiction.

  13 new tests cover apportionment + fall-back rules + the stub-article
  error path. All 54 existing tests pass.

## 0.3.0

### Minor Changes

- [`82ab4dd`](https://github.com/ar-agents/ar-agents/commit/82ab4ddbca1d186c43df61382cb90daf61d166e4) Thanks [@naza00000](https://github.com/naza00000)! - Lift sweep: all 5 packages now extend `ArAgentsError` from `@ar-agents/core`.

  The family error contract is now uniform across `uala`, `iibb`, `sicore`,
  `iva-percepciones`, `iva-retenciones` (and `identity` from the previous
  release). Every package's error base exposes:

  - `code: string` — machine-readable
  - `retryable: boolean` — for `@ar-agents/core` `withRetry` middleware
  - `context: Record<string, unknown>` — structured ctx, never secrets

  Backward-compatible:

  - All existing public constructors are preserved (signature + behaviour).
  - Existing extra fields (e.g. `UalaError.status`, `IibbError.details`,
    `SicoreRateNotFoundError.category`, etc.) are kept on the instance and
    also mirrored into `context` for new code that reads the
    `ArAgentsError` contract.
  - `instanceof <PackageError>` continues to work; `isArAgentsError(e)`
    now additionally returns `true`.

  `retryable` is currently `true` for `UalaError` codes `"api_error"` and
  HTTP 5xx, and `false` everywhere else. Future refinements per package
  are tracked in `internal/swarm-2026-05-26/01-progress.md`.

## 0.2.0

### Minor Changes

- [`b8c176f`](https://github.com/ar-agents/ar-agents/commit/b8c176f6d701ecc7426c0de5e472f307ded2f94a) Thanks [@naza00000](https://github.com/naza00000)! - Real padrón adapters for CABA + BSAS, plus an extensible HTTP base.

  - `HttpPadronAdapter` — abstract base class accepting an injected `fetch` function, with built-in timeout, error normalisation, and User-Agent. Subclass by implementing `buildLookupRequest` + `parseLookupResponse`.
  - `AgipPublicAdapter` (CABA) — concrete implementation hitting AGIP's public consulta endpoint. No CIT credentials needed for read-only padrón status. Recognises both the JSON and HTML response shapes that AGIP serves across its UI variants.
  - `ArbaCitAdapter` (BSAS) — concrete implementation hitting ARBA's dfe service. Type-level requires a host-supplied authenticated `fetch` wrapper carrying the CIT session cookie (the package never stores credentials). Parses both the JSON and XML response surfaces.
  - `FetchLike`, `HttpPadronAdapterOptions`, `AgipPublicAdapterOptions`, `ArbaCitAdapterOptions` are exported for typed extension.
  - Legacy `AgipAdapter` and `ArbaAdapter` stubs are kept exported but marked `@deprecated`. Migration is one-line: swap the import.
  - 25 new adapter tests, fully offline (no real network calls in CI).

## 0.1.0

### Minor Changes

- [`c5f33f5`](https://github.com/ar-agents/ar-agents/commit/c5f33f56d10e15ace1f3d219604bae97cd85d658) - Two new packages in the ar-agents toolkit:

  - `@ar-agents/uala` v0.1.0 — Ualá Bis agent toolkit. 8 typed tools for payment links, QR cobros, transaction history, payouts, balance, and marketplace OAuth. Adapter pattern (UnconfiguredUalaAdapter + UalaApiAdapter), full error model, 12 unit tests.
  - `@ar-agents/iibb` v0.1.0 — Ingresos Brutos agent toolkit. Pure-math primitives (RateBook, computeDdjj, calculateRetention, calculatePerception) covering LOCAL + Convenio Multilateral Article 2 (general regime) across CABA + 23 provinces + CM umbrella. 4 typed tools, adapter contract with stub adapters for AGIP / ARBA / Comisión Arbitral, 16 unit tests.

  Both packages follow the agents.md convention (AGENTS.md per package, tools.manifest.json) and use the same shape as the established `@ar-agents/banking` and `@ar-agents/mercadopago` packages: Vercel AI SDK 6+ tool collections, adapter pattern with throwing default for safe unit-testing, MIT licensed, SLSA provenance via the existing release workflow.
