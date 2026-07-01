# @ar-agents/uala

## 0.3.2

### Patch Changes

- Updated dependencies [[`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1), [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c), [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b)]:
  - @ar-agents/core@0.3.0

## 0.3.1

### Patch Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

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

- [`b8c176f`](https://github.com/ar-agents/ar-agents/commit/b8c176f6d701ecc7426c0de5e472f307ded2f94a) Thanks [@naza00000](https://github.com/naza00000)! - InMemoryUalaAdapter and OAuth `refreshAccessToken`.

  - `InMemoryUalaAdapter` — promised in v0.1 docs, now actually shipped. Full in-process implementation of `UalaAdapter`: payment links (open / paid / cancelled / expired states), transactions (with paginated cursor), balance (decreases on payout, credits on simulated payment), payouts (insufficient-balance check, available→pending move). Supports idempotency keys and `simulatePayment(linkId)` test helper. Optional `clock` and `idGenerator` hooks for deterministic snapshots. Designed for integration tests and dogfood — not a load test surface, no persistence, single-threaded.
  - `refreshAccessToken(args, fetchImpl?)` — OAuth refresh_token grant for long-lived marketplace integrations. Maps 401 to `UalaAuthError` so callers know to re-authorize the user. Preserves the input `refresh_token` when the server omits a new one (some OAuth servers don't rotate refresh tokens on refresh).
  - New `OAuthRefreshArgs` type exported.

  No breaking changes. All v0.1 imports keep working.

## 0.1.0

### Minor Changes

- [`c5f33f5`](https://github.com/ar-agents/ar-agents/commit/c5f33f56d10e15ace1f3d219604bae97cd85d658) - Two new packages in the ar-agents toolkit:

  - `@ar-agents/uala` v0.1.0 — Ualá Bis agent toolkit. 8 typed tools for payment links, QR cobros, transaction history, payouts, balance, and marketplace OAuth. Adapter pattern (UnconfiguredUalaAdapter + UalaApiAdapter), full error model, 12 unit tests.
  - `@ar-agents/iibb` v0.1.0 — Ingresos Brutos agent toolkit. Pure-math primitives (RateBook, computeDdjj, calculateRetention, calculatePerception) covering LOCAL + Convenio Multilateral Article 2 (general regime) across CABA + 23 provinces + CM umbrella. 4 typed tools, adapter contract with stub adapters for AGIP / ARBA / Comisión Arbitral, 16 unit tests.

  Both packages follow the agents.md convention (AGENTS.md per package, tools.manifest.json) and use the same shape as the established `@ar-agents/banking` and `@ar-agents/mercadopago` packages: Vercel AI SDK 6+ tool collections, adapter pattern with throwing default for safe unit-testing, MIT licensed, SLSA provenance via the existing release workflow.
