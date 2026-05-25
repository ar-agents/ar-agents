# @ar-agents/iva-percepciones

## 0.2.0

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

## 0.1.0

### Minor Changes

- [`d202bbe`](https://github.com/ar-agents/ar-agents/commit/d202bbeef67b62e98e762a4567e30a8f3082d6b9) Thanks [@naza00000](https://github.com/naza00000)! - Initial release — IVA perceptions per RG 2408/08 and family.

  - `calculatePerception(input)` — per-invoice IVA perception math with mínimo + waiver checks. Returns 0 with `waiverReason` (`below_minimum` | `non_perception_certificate` | `exempt_buyer` | `consumidor_final`) when not perceiving, so callers can distinguish a 0-rate result from "this case never qualified."
  - `buildPerceptionDdjj({period, agentCuit, entries})` — assembles the monthly SIRE DDJJ with per-regime + per-buyer breakdowns.
  - 3 buyer conditions wired with default rates (RG 2408/08 régimen general 2024-Q4 snapshot): `responsable_inscripto` (1.5%), `no_categorizado` (3% agravada), `monotributista` / `exento` / `consumidor_final` (0%).
  - Two sub-regime codes reserved (`rg_3337_combustibles`, `rg_2126_servicios`) but no default tables — callers pass their own `rateTable` since these have their own (and frequently-updated) minimums.
  - Non-perception certificate flag short-circuits to 0 regardless of buyer category.
  - 3 Vercel AI SDK tools: `iva_perception_calculate`, `iva_perception_build_ddjj`, `iva_perception_submit_ddjj`.
  - `IvaPerceptionAdapter` contract for SIRE submission; v0.1 ships only `UnconfiguredIvaPerceptionAdapter`.
  - 17 offline tests covering rates, waivers, mínimo, certificate flag, DDJJ aggregation, validation.
