---
"@ar-agents/shipping": minor
---

Initial release: AR shipping carriers (Andreani, OCA, Correo Argentino) for Vercel AI SDK 6+ agents.

**6 tools shipped:**

- `cotizar_envio` — quote with a specific carrier
- `cotizar_envio_todos` — parallel quote across all configured carriers (cheapest first)
- `crear_envio` — create a real shipment, get trackingNumber + label PDF
- `trackear_envio` — current status + events (normalized lifecycle across carriers)
- `cancelar_envio` — cancel pre-delivery (when supported)
- `listar_sucursales` — branches near a CPA

**4 adapters shipped:**

- `AndreaniAdapter` — wired to Andreani's REST API. Full coverage (cotizar/crear/trackear/cancelar/sucursales).
- `OcaAdapter` — wired to OCA's REST Tarifador. Cotizar + sucursales work; crear/trackear/cancelar throw `ShippingNotSupportedError` (E-Pak SOAP coming in v0.2).
- `CorreoAdapter` — wired to Correo Argentino's public REST. Cotizar + trackear + sucursales work.
- `MockShippingAdapter` — deterministic in-memory responses for tests + demos.

**Pure helpers:**

- `lookupProvincia` — accent-insensitive lookup by name, ISO code, or AFIP code (24 entries: 23 provincias + CABA).
- `isValidCPA` — validates 4-digit CPs (≥1000) and extended CPA (`B1842ZAB`).
- Tools auto-validate addresses before hitting the carrier — invalid CPA / unknown provincia returns `{ ok: false, error }` with no network call.

**Robustez built-in:**

- `requestTimeoutMs`, `maxRetries`, `onCall` observability hook on every adapter
- HTTP 5xx auto-retry with exponential backoff
- Carrier-specific normalization (status codes, address shapes, product IDs)

34 tests, 80%+ statement coverage, 7.9 KB brotli'd.
