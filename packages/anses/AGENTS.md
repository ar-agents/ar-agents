# `@ar-agents/anses` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools for **ANSES** (Administración Nacional de la Seguridad Social)
— per-CUIL status, family-allowance entitlements, and reference tables
(haber mínimo jubilatorio).

## When to use which tool

| Goal | Tool |
|---|---|
| Is this CUIL employed / retired / unemployed? | `anses_get_cuil_status` |
| Does this person receive AUH / AUE / SUAF / etc.? | `anses_get_family_allowances` |
| Compare a pension amount to the legal minimum | `anses_get_minimo_jubilatorio` |

## CUIL normalization

11 digits. Hyphens stripped automatically. Format mirrors CUIT (same
algorithm); the package validates length but leaves checksum validation
to `@ar-agents/identity` if needed (avoids dep on identity here).

## Status enum

Stable values for branching: `activo`, `jubilado`, `pensionado`,
`desempleado_con_subsidio`, `desempleado_sin_subsidio`, `inactivo`,
`fallecido`.

## Family-allowance kinds

- **AUH** — Asignación Universal por Hijo (per child, informal worker)
- **AUE** — Asignación Universal por Embarazo
- **SUAF** — formal-worker family allowances
- **PENSION_NO_CONTRIBUTIVA** — non-contributive pension
- **TARJETA_ALIMENTAR** — food card

A CUIL can have multiple entitlements (e.g. AUH + Tarjeta Alimentar);
return is an array.

## Confirmation gates (HITL)

None — v0.1 is read-only.

## Error model

- `AnsesValidationError` — bad input (e.g. CUIL format)
- `AnsesUnconfiguredError` — adapter not wired
- `AnsesApiError` — non-2xx; `retryable: true` for 5xx + 429

## Production wiring

Mi ANSES exposes per-CUIL data via OAuth (the user authorizes a one-off
read with their Clave de la Seguridad Social). The aggregate
open-data (haber mínimo) lives on datos.anses.gob.ar and needs no auth.

The HTTP adapter is not bundled in v0.1 because the Mi ANSES auth flow
varies by client type (web app vs. backend service). Wire the
`AnsesAdapter` interface to whichever endpoint your env exposes.

## What this package does NOT cover (v0.1)

- Generating "Negativa de ANSES" certificates (legal document, requires Clave)
- Jubilación amount calculation (regulatory, see ANSES bareme tables)
- Aporte autónomos history (covered by `@ar-agents/identity` + AFIP padron)
