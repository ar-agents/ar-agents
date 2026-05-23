# `@ar-agents/iva-percepciones` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools + pure math for **IVA perceptions** (Argentine federal value-added tax surcharges added on top of IVA per RG 2408/08). Drops into Vercel AI SDK 6+ as a tool collection. Adapter pattern for SIRE submission (currently throws; wire your own credentialed adapter to file).

## When to use which tool

| Goal                                       | Tool                              | Notes                                           |
| ------------------------------------------ | --------------------------------- | ----------------------------------------------- |
| Perceive on a single sale invoice          | `iva_perception_calculate`        | Pure math. Returns 0 with waiverReason if waived.|
| Roll up perceptions into the monthly DDJJ  | `iva_perception_build_ddjj`       | Per-regime + per-buyer breakdown.               |
| File the monthly SIRE DDJJ                 | `iva_perception_submit_ddjj`      | Requires custom adapter. Confirmation gate.     |

## Constraints

- **All amounts in ARS centavos.** ARS 1.000 is `100000`. Never floats.
- **Rates are fractions** (1.5% → `0.015`). NEVER percentages.
- **CUIT is 11 digits** (with or without hyphens).
- **`operationDate` is YYYY-MM-DD**; `period` is YYYY-MM.
- **A perception is added to the invoice total.** The math returns the perception amount; the caller is responsible for summing `neto + iva + perception` on the comprobante.

## RG 2408 mental model (for non-tax agents)

- Designated agentes de percepción collect a perception on top of every sale to certain buyer categories.
- Default rates (régimen general): **1.5%** to RI, **3%** to no_categorizado, **0%** to monotributista / exento / consumidor final.
- Mínimo no imponible suele ser 0 en el régimen general; otros sub-regímenes (RG 3337 combustibles, RG 2126 servicios) tienen mínimo y tablas propias — pasalas en `rateTable`.
- Buyer with a vigent **certificado de no-percepción** trumps all the above → 0.

## Confirmation gates (HITL)

- `iva_perception_submit_ddjj` — **always confirm.** Files a SIRE DDJJ.

Read-only tools don't need a gate.

## Error model

- `IvaPerceptionValidationError` — bad input.
- `IvaPerceptionRateNotFoundError` — table missing the (regime, buyerCondition) pair.
- `IvaPerceptionUnconfiguredError` — submission adapter not wired.

## AR context (for non-AR agents)

- **Percepción ≠ retención.** A perception is **added on top** of the invoice — buyer pays MORE. A retention is **deducted** from the payment — seller takes home LESS. This package is for perceptions.
- **IVA ≠ Ganancias ≠ IIBB.** IVA is federal value-added tax. Perceptions on IVA are at the federal level (here). Perceptions on IIBB are provincial — use `@ar-agents/iibb`.
- **AFIP** rebranded to **ARCA** in 2025; SIRE didn't rename.

## What this package does NOT cover (v0.1)

- Sub-regime tables baked-in (RG 3337 combustibles, RG 2126 servicios). Pass `rateTable`.
- Provincial IIBB perceptions — out of scope.
- Customs-stage IVA payments.
