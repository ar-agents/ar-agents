---
"@ar-agents/identity": patch
"@ar-agents/facturacion": patch
---

Harden the AFIP SOAP envelope builders against XML injection (DeepSec MEDIUM).

- `identity` `buildGetPersonaSoap` now validates `cuitRepresentado` / `cuitToQuery` as exactly 11 digits before building the envelope and XML-escapes them as defense-in-depth, so a malformed or hostile CUIT can no longer break out of the SOAP context.
- `facturacion` `solicitarCAE` / `getCotizacion` now XML-escape every interpolated string field (auth CUIT, `fchServDesde` / `fchServHasta` / `fchVtoPago`, `cbteFch`, `docNro`, `monId`, and `cbtesAsoc` `cuit` / `fecha`). Numeric fields were already type-safe.
