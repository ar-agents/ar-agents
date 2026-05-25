# `@ar-agents/aduana` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools for **ARCA Aduana** (the renamed-2025 AFIP Aduana / María
system) — look up Argentine customs declarations + tariff codes from
inside an agent. v0.1 read-only.

## When to use which tool

| Goal | Tool | Notes |
|---|---|---|
| Status of an in-flight import/export declaration | `aduana_lookup_despacho` | Returns `found: false` for unknown numbers — that's a valid answer, not an error |
| Resolve an HS code to its description + tariff | `aduana_lookup_ncm` | Full 8-digit code required (e.g. `84713010` = laptops) |

## Identifier kinds (despacho)

- **SUSI** — Sistema Único de Solicitud de Información. The modern format
  (post-2010), 16 chars: aduana(3) + year(2) + operación(3) + correlativo(6)
  + control(1). Most common.
- **KIM** — older identifier still seen on legacy paperwork.
- **OM** — Orden de Mérito, used in some Mercosur-specific operations.

Pass exactly what is printed on the despacho; the adapter normalizes nothing.

## Despacho statuses

ARCA returns one of:
- `registrado` — declaration submitted but not yet validated
- `oficializado` — validated, awaiting canalización
- `canalizado_verde` — fast-track, no physical/document inspection
- `canalizado_naranja` — document inspection required
- `canalizado_rojo` — physical + document inspection required
- `libre_disponibilidad` — cleared, goods can be released
- `anulado` — declaration was cancelled

Use these directly as branching conditions; they are stable values.

## NCM (tariff code)

Argentine NCM is the Mercosur HS-based nomenclature, 8 digits. Some
useful patterns:

- 84xx → machinery (84713010 = portable computers)
- 85xx → electrical equipment
- 87xx → vehicles
- 30xx → pharmaceuticals
- 22xx → beverages (incl. yerba mate at 09031000)

The `aduana_lookup_ncm` tool returns `active: false` for codes that have
been retired by a Decreto. If `aecPercent` / `diePercent` are absent,
the code is in force but the published tariff is jurisdiction-specific.

## Confirmation gates (HITL)

None — v0.1 is read-only.

## Error model

- `AduanaValidationError` — bad input (don't retry)
- `AduanaUnconfiguredError` — adapter not wired (surface to operator)
- `AduanaApiError` — non-2xx; `retryable: true` for 5xx + 429

## What this package does NOT cover (v0.1)

- Registering a new despacho (requires WSAA cert handling — out of scope)
- Real-time courier-shipment tracking (different SIM channel, different cert)
- DUA / SIMI permission resolution (separate ARCA service)
- Sub-product / partida-level breakdowns within a despacho
