# @ar-agents/fecred

## 0.2.1

### Patch Changes

- Rebuild and republish from PII-scrubbed source. Versions published before the 2026-06-17 fixture scrub shipped a real CUIT and address in their README/AGENTS/cookbook/dist; this rebuild from the now-clean source removes them. No API changes. The earlier contaminated versions are deprecated on npm.

## 0.2.0

### Minor Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

## 0.1.0

### Minor Changes

- Initial release: WSFECred (Factura de Credito Electronica MiPyME) agent toolkit. Operations: consultarMontoObligadoRecepcion, consultarComprobantes, aceptarFECred, rechazarFECred, dummy. Five Vercel AI SDK tools with HITL-gated accept/reject, Http + InMemory + Unconfigured adapters, field names verified against the live AFIP WSDL and pyafipws.
