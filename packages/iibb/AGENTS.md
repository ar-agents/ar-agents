# `@ar-agents/iibb` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools + pure math for **Ingresos Brutos** (Argentine gross income tax) across 24 provinces + CABA. Drops into Vercel AI SDK 6+ as a tool collection. Adapter pattern for per-jurisdiction operations; pure-math primitives for retention / perception / DDJJ assembly.

## When to use which tool

| Goal                                              | Tool                          | Notes                                                  |
| ------------------------------------------------- | ----------------------------- | ------------------------------------------------------ |
| Compute a withholding on an invoice               | `iibb_calculate_retention`    | Pure math. Pass `overrideRate` explicitly.             |
| Compute a perception on a sale                    | `iibb_calculate_perception`   | Symmetrical to retention in v0.1.                      |
| Assemble a full monthly DDJJ (local OR CM)        | `iibb_compute_ddjj`           | Returns per-jurisdiction breakdown.                    |
| Check if a CUIT is registered in a jurisdiction   | `iibb_lookup_padron`          | Requires adapter; defaults throw IibbUnconfiguredError.|

## Constraints

- **All amounts in ARS centavos.** ARS 1.000 is `100000`. Never floats.
- **Rates are fractions** (3.5% → `0.035`). NEVER percentages.
- **Period is YYYY-MM.** Always 4-2 zero-padded.
- **CM coefficients sum to 1.0** (±0.001 tolerance). The "coeficiente unificado" comes from the taxpayer's prior-year activity; the agent doesn't compute it, the host supplies it.
- **Local regime**: every line's jurisdiction MUST match `filerCode`. Mixed-jurisdiction lines in local mode throw `IibbValidationError`.
- **CM regime**: the filer is registered with Comisión Arbitral; `filerCode` is `"CM"`, not a specific province.

## Decision tree

- Single jurisdiction? → `regime: "local"`, `filerCode: <that jurisdiction>`.
- Two or more jurisdictions? → `regime: "cm"`, `filerCode: "CM"`, supply `cmCoefficients`.
- Specialized industry (construction, transport, etc.)? → CM Article 6-13 not yet supported in v0.1. Surface this to the operator; do NOT try to fake it with art_2_general.

## Error model

- `IibbValidationError` — agent passed bad input (bad period, threshold violation, CM coefficient mismatch). Do NOT retry.
- `IibbRateNotFoundError` — the rate-book is missing an (jurisdiction, activityCode) entry. Surface to operator; agent cannot guess rates.
- `IibbUnconfiguredError` — the adapter for that jurisdiction is not wired. Surface to operator.

## AR context (for non-AR agents)

- **IIBB ≠ IVA**. IIBB is a turnover tax on gross sales, not on value-added. It's per-jurisdiction (not federal). You pay it on the SALE, regardless of profitability.
- **Activity codes** are NAES (Nomenclador de Actividades Económicas del Sistema Federal de Recaudación). Five or six digits. The package treats them as opaque strings.
- **Convenio Multilateral** is a 1977 federal-provincial agreement that prevents double taxation when a business operates in multiple jurisdictions. Filing is monthly via Comisión Arbitral.

## What this package does NOT cover (v0.1)

- CM Articles 6-13 (industry-specific).
- Anual readjustments (Convenio Multilateral CM-03).
- Régimen Simplificado (the "monotributo" of IIBB for small taxpayers in some jurisdictions).
- Automatic rate-book loading (the host loads rates).
- Real DDJJ submission (the adapters are stubs).
