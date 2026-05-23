---
"@ar-agents/iva-percepciones": minor
---

Initial release — IVA perceptions per RG 2408/08 and family.

- `calculatePerception(input)` — per-invoice IVA perception math with mínimo + waiver checks. Returns 0 with `waiverReason` (`below_minimum` | `non_perception_certificate` | `exempt_buyer` | `consumidor_final`) when not perceiving, so callers can distinguish a 0-rate result from "this case never qualified."
- `buildPerceptionDdjj({period, agentCuit, entries})` — assembles the monthly SIRE DDJJ with per-regime + per-buyer breakdowns.
- 3 buyer conditions wired with default rates (RG 2408/08 régimen general 2024-Q4 snapshot): `responsable_inscripto` (1.5%), `no_categorizado` (3% agravada), `monotributista` / `exento` / `consumidor_final` (0%).
- Two sub-regime codes reserved (`rg_3337_combustibles`, `rg_2126_servicios`) but no default tables — callers pass their own `rateTable` since these have their own (and frequently-updated) minimums.
- Non-perception certificate flag short-circuits to 0 regardless of buyer category.
- 3 Vercel AI SDK tools: `iva_perception_calculate`, `iva_perception_build_ddjj`, `iva_perception_submit_ddjj`.
- `IvaPerceptionAdapter` contract for SIRE submission; v0.1 ships only `UnconfiguredIvaPerceptionAdapter`.
- 17 offline tests covering rates, waivers, mínimo, certificate flag, DDJJ aggregation, validation.
