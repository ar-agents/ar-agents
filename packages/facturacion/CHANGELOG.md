# @ar-agents/facturacion

## 0.1.0

### Minor Changes

- Initial release: AFIP/ARCA factura electrónica (WSFE) for Vercel AI SDK 6+ agents.

  **10 tools shipped:**

  - `emitir_factura` — solicit a CAE for a new comprobante
  - `consultar_ultimo_comprobante` — get the next available comprobante number
  - `consultar_factura_emitida` — verify a previously-issued comprobante
  - `obtener_tipos_comprobante` / `obtener_tipos_documento` / `obtener_alicuotas_iva` / `obtener_tipos_concepto` / `obtener_tipos_moneda` — live AFIP catalogs
  - `obtener_cotizacion` — exchange rate for non-PES currencies
  - `health_check_afip` — WSFE health probe

  **Pre-flight validator** catches the 10 most common AFIP rejection reasons LOCALLY (ImpTotal != suma, Iva sum mismatch, Factura C with IVA, Servicios sin fchServ\*, Notas sin cbtesAsoc, etc.) before the network round-trip.

  **Reuses `@ar-agents/identity`** for the WSAA token cache + `fetchWithRetry` — same X.509 cert powers both. Same robustez (timeout / retry / SOAP-fault detection / `onCall` observability hook).

  **51 tests, 80%+ statement coverage, 9 KB brotli'd.**
