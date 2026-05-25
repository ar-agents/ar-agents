# `@ar-agents/inpi` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools for **INPI** (Instituto Nacional de la Propiedad Industrial)
— search Argentine trademarks before filing a new one, check the status
of an existing registration.

## When to use which tool

| Goal | Tool |
|---|---|
| Spot conflicts before filing a new mark | `inpi_search_trademark` |
| Look up one registration by acta | `inpi_get_trademark` |

## Nice classification

Use Nice class 1–45 to scope a search. Common classes:

- 9 — software, mobile apps, electronics
- 25 — clothing
- 30 — food (coffee, sweets)
- 35 — advertising / business services
- 41 — education / entertainment
- 42 — software development services
- 45 — legal services

A given denomination can be registered separately in multiple classes;
always filter when comparing.

## Status values

Stable enumeration: `presentada` → `publicada` → (`oposicion` →)
`concedida` → `en_renovacion` / `extinguida` / `abandonada` /
`rechazada`. Branch on these as machine-readable values.

## Confirmation gates (HITL)

None — v0.1 is read-only.

## Error model

- `InpiValidationError` — bad input (e.g. query too short)
- `InpiUnconfiguredError` — adapter not wired
- `InpiApiError` — non-2xx; `retryable: true` for 5xx + 429

## What this package does NOT cover (v0.1)

- Filing a new mark (Form M, requires INPI portal account)
- Opposition submissions (requires DJV digital signature)
- Patents (INPI handles trademarks AND patents; patents are a separate package, future work)
