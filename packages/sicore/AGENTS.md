# `@ar-agents/sicore` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools + pure math for **SICORE / Ganancias retentions** (Argentine federal income tax withholding per RG 830/00). Drops into Vercel AI SDK 6+ as a tool collection. Adapter pattern for SICORE upload (currently throws; wire your own AFIP-cert credentialed adapter to actually file).

## When to use which tool

| Goal                                                  | Tool                              | Notes                                          |
| ----------------------------------------------------- | --------------------------------- | ---------------------------------------------- |
| Retain on a single supplier payment                   | `sicore_calculate_retention`      | Pure math. Pass accumulator + already-retained.|
| Walk a supplier's monthly payment history             | `sicore_calculate_retention_stream` | Bookkeeps the running totals so you don't.   |
| Assemble the monthly DDJJ                             | `sicore_build_ddjj`               | Aggregates by category + supplier.             |
| File the monthly DDJJ to AFIP/ARCA                    | `sicore_submit_ddjj`              | Requires custom adapter. Confirmation gate.    |

## Constraints

- **All amounts in ARS centavos.** ARS 1.000 is `100000`. Never floats.
- **Rates are fractions** (6% → `0.06`). NEVER percentages.
- **CUIT is 11 digits** (with or without hyphens — they're stripped).
- **`paymentDate` is YYYY-MM-DD**; `period` is YYYY-MM.
- **Accumulator semantics**: pass `accumulatedMonthCentavos` = sum of all prior payments to the SAME supplier in the current month, and `alreadyRetainedThisMonthCentavos` = sum of all retentions already practiced this month to the same supplier. The retention today nets out the already-retained, so the cumulative never double-counts.
- **`status: "exento"`** requires a valid certificado de no-retención on file (RG 830 art 38). The agent does NOT verify this — surface the requirement to the operator.

## RG 830/00 mental model (for non-tax agents)

- Retention is on the **monthly accumulated amount paid to the same supplier**, not on each invoice in isolation.
- Each (category, status) pair has a **mínimo no imponible** mensual: accumulated below → retain 0.
- Above the mínimo, retain on the **excedente** (accumulated − mínimo) at the table rate, then **subtract** what you already retained earlier this month.

This is why a $50.000 payment retains 0 the first time but the THIRD identical payment that month suddenly retains $656.

## Decision tree

- Supplier paid today is **exento**? → retain 0; surface the cert requirement.
- Supplier is **no_inscripto**? → retain on the WHOLE payment (no mínimo).
- Supplier is **inscripto**? → check accumulated vs mínimo; retain on the excedente; subtract already-retained.

## Confirmation gates (HITL)

- `sicore_submit_ddjj` — **always confirm**. Files a tax return; not idempotent in the meaningful sense (refiling is a manual undo operation at AFIP).

Read-only tools (`calculate_*`, `build_ddjj`) do not need a confirmation gate.

## Error model

- `SicoreValidationError` — agent passed bad input. Do NOT retry the same call.
- `SicoreRateNotFoundError` — the rate-table is missing the (category, status) pair. Surface to operator; agent cannot fabricate rates.
- `SicoreUnconfiguredError` — submission adapter not wired. Surface to operator.

## AR context (for non-AR agents)

- **Ganancias ≠ IVA ≠ IIBB.** Ganancias is the federal income tax on profit. AFIP requires "agentes de retención" (i.e. larger taxpayers) to withhold a portion at payment time and remit it monthly via SICORE. This is what `sicore` calculates.
- **CUIT** is the 11-digit Argentine tax id. Equivalent to a US EIN.
- **AFIP** rebranded to **ARCA** (Agencia de Recaudación y Control Aduanero) in 2025. The system name "SICORE" did not change.

## What this package does NOT cover (v0.1)

- The ~80 other Anexo II tipos de operación (intereses, honorarios de directorio, locaciones rurales, etc.). Use a custom `rateTable` to extend.
- IVA / IIBB / SUSS retentions — out of scope; use `@ar-agents/iibb` or its siblings for those.
- Real AFIP submission — adapter contract only; the actual XML upload is in the host's territory.
