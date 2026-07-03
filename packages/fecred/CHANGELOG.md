# @ar-agents/fecred

## 0.3.0

### Minor Changes

- [#152](https://github.com/ar-agents/ar-agents/pull/152) [`2d9985d`](https://github.com/ar-agents/ar-agents/commit/2d9985d17894ec7dd731434a3fcbd11391b703ab) Thanks [@naza00000](https://github.com/naza00000)! - Migrate `HttpFecredAdapter` onto `@ar-agents/core`'s `HttpClient` (SDK-audit P1 transport migration).

  Every WSFECred SOAP call now runs through the shared client via `requestRaw` (SOAP is `text/xml`, so the adapter still owns body decoding + the existing regex/`SoapFaultError` parsers). This removes the hand-rolled `withTimeout` `Promise.race`/`setTimeout` leak and the raw-fetch loop, replacing them with the client's real per-request timeout and typed-error mapping. The endpoint's origin becomes the client `baseUrl` and its pathname is passed as `path`, so the resolved request URL stays byte-identical to the original per-env endpoint (no injected trailing slash).

  Idempotency is safe by construction: every FECred operation is a `POST` (the reads `consultarMontoObligadoRecepcion`/`consultarComprobantes`/`dummy` as well as the **irreversible** money acts `aceptarFECred`/`rechazarFECred`), and none carries an idempotency key. The SOAP request is sent with `retry: false` to disable auto-retry entirely — closing the one hole in the default classifier where a `429` is retried regardless of method — so an irreversible accept/reject is never replayed on a transient `429`/`5xx`. HTTP-status errors still preserve AFIP's `<faultstring>` (now recovered from the typed error's body snippet) and map to `FecredProtocolError` with the upstream status; network/timeout failures map to the same `FecredProtocolError` with `status: null`. The `HttpFecredAdapterOptions.fetch` type is now `typeof fetch` (the exported `FetchLike` alias is kept, deprecated, aliased to `typeof fetch`, so external type imports don't break). New tests assert the exact-URL resolution, faultstring preservation, and that both money POSTs call `fetch` exactly once on a transient 5xx/429.

### Patch Changes

- Updated dependencies [[`2d9985d`](https://github.com/ar-agents/ar-agents/commit/2d9985d17894ec7dd731434a3fcbd11391b703ab)]:
  - @ar-agents/core@0.4.1

## 0.2.3

### Patch Changes

- Updated dependencies [[`21e5c38`](https://github.com/ar-agents/ar-agents/commit/21e5c389ca5355567c89c125a53749e3e22a50bf)]:
  - @ar-agents/core@0.4.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1), [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c), [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b)]:
  - @ar-agents/core@0.3.0

## 0.2.1

### Patch Changes

- Rebuild and republish from PII-scrubbed source. Versions published before the 2026-06-17 fixture scrub shipped a real CUIT and address in their README/AGENTS/cookbook/dist; this rebuild from the now-clean source removes them. No API changes. The earlier contaminated versions are deprecated on npm.

## 0.2.0

### Minor Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

## 0.1.0

### Minor Changes

- Initial release: WSFECred (Factura de Credito Electronica MiPyME) agent toolkit. Operations: consultarMontoObligadoRecepcion, consultarComprobantes, aceptarFECred, rechazarFECred, dummy. Five Vercel AI SDK tools with HITL-gated accept/reject, Http + InMemory + Unconfigured adapters, field names verified against the live AFIP WSDL and pyafipws.
