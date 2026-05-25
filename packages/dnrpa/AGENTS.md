# `@ar-agents/dnrpa` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools for **DNRPA** (Dirección Nacional de los Registros Nacionales
de la Propiedad del Automotor) — Argentine vehicle plate lookups.

## When to use which tool

| Goal | Tool |
|---|---|
| Get marca/modelo/año + mortgage + theft flags for a plate | `dnrpa_lookup_dominio` |

## Plate formats

- **New Mercosur** (post-2016): `LL000LL` e.g. `AB123CD`
- **Old Argentine** (1995-2016): `LLL000` e.g. `FFF123`

Hyphens are stripped automatically. Older series (pre-1995, three-letter
provincial prefixes) are out of scope for v0.1.

## IMPORTANT — DNRPA has no free REST API

DNRPA's public consulta-de-dominio form sits behind a captcha. The
`UnconfiguredDnrpaAdapter` default throws on every call so unit tests
never accidentally hit anything.

For production, wire a `BrowserDnrpaAdapter` against a browse runtime
(browserbase/skills, Playwright, the `browse.sh` skill catalog, etc.).
That adapter is host-specific and lives outside this package.

## Confirmation gates (HITL)

None — all v0.1 operations are read-only.

## Error model

- `DnrpaValidationError` — bad input (e.g. plate format)
- `DnrpaUnconfiguredError` — adapter not wired (default state)
- `DnrpaCaptchaError` — DNRPA showed a captcha; surface to human

## What this package does NOT cover (v0.1)

- Title transfer (Form 08 issuance) — requires Clave Fiscal + DNRPA-registered intermediary
- Historical owner chain — DNRPA only returns the current/last record
- Encumbrance details beyond the boolean flag — full report requires paid query
