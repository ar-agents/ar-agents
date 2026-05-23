# @ar-agents/sicore

## 0.1.0

### Minor Changes

- [`cf5c924`](https://github.com/ar-agents/ar-agents/commit/cf5c924aaba62de2dd194010235d423968013f2b) Thanks [@naza00000](https://github.com/naza00000)! - Initial release — federal income tax (Ganancias) retentions per RG 830/00.

  - `calculateRetention(input)` — per-payment math implementing the RG 830/00 monthly-accumulator rule (the one AFIP actually checks against), with already-retained credit so cumulative monthly retentions never double-count.
  - `calculateRetentionStream(payments)` — walks a chronological per-supplier monthly stream, bookkeeping accumulator + already-retained automatically.
  - `buildSicoreDdjj({period, agentCuit, entries})` — assembles the monthly DDJJ with per-category and per-supplier breakdowns.
  - 4 operation types out of the box with current (2024-Q4) mínimos no imponibles + scales: `servicios` (Anexo II 36), `honorarios` (escala progresiva, Anexo II 28), `bienes` (Anexo II 78), `alquileres` urbanos (Anexo II 49). Override the table via `RetentionInput.rateTable` for other tipos or older periods.
  - Three supplier statuses: `inscripto` (table rates), `no_inscripto` (flat rate, no mínimo), `exento` (always 0; requires certificate on file).
  - 4 Vercel AI SDK tools: `sicore_calculate_retention`, `sicore_calculate_retention_stream`, `sicore_build_ddjj`, `sicore_submit_ddjj`.
  - Adapter contract for SICORE submission (`SicoreAdapter`); v0.1 ships only `UnconfiguredSicoreAdapter` because the upload surface is XML over WSAA and credentials live in the host.
  - 26 offline tests covering the accumulator nuance, escala progresiva, validation errors, DDJJ aggregation, and edge cases.
