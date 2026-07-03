# @ar-agents/wscdc

## 0.3.0

### Minor Changes

- [#152](https://github.com/ar-agents/ar-agents/pull/152) [`2d9985d`](https://github.com/ar-agents/ar-agents/commit/2d9985d17894ec7dd731434a3fcbd11391b703ab) Thanks [@naza00000](https://github.com/naza00000)! - Migrate the real-network `HttpWscdcAdapter` (SOAP — constatación de comprobantes) off its hand-rolled fetch + `Promise.race` timeout onto the shared `HttpClient` from `@ar-agents/core`. The old `withTimeout` raced the fetch against a `setTimeout` reject and could leak the timer's rejection; the core client now supplies a real `AbortSignal.timeout`, bounded jittered backoff, and typed `ArAgentsError` mapping. SOAP stays transport-only: both operations POST the envelope via `requestRaw`, read the raw XML text, and keep the existing `parseConstatarResponse` / `parseDummyResponse` SOAP-fault + observation/error surfacing untouched. AFIP's HTTP-500-with-`<soap:Fault>` (TA expiry) is remapped back to `WscdcProtocolError` with the `faultstring` preserved from the error's body snippet, and network/timeout errors (status null) route to the protocol-error path — every existing error code is preserved.

  `ComprobanteConstatar` and `Dummy` are pure reads, so the POSTs are marked `idempotent: true` to opt into retry on transient 5xx; there is no money mutation here to blind-retry. The parsed result is additionally validated with a zod `constatarResultSchema` / `dummyResultSchema` via `parseOrThrow`, so a drifted/partial body fails loud (`ArAgentsResponseValidationError`) instead of being blind-cast. `FetchLike` is kept exported but deprecated; the `fetch` option is now a standard `typeof fetch`. A new optional `retry` option forwards to the client. New tests cover a malformed 200 failing loud, a transient 5xx retrying-then-succeeding on the idempotent read, and the real-`Response`-based fetch mock the core client requires.

### Patch Changes

- Updated dependencies [[`2d9985d`](https://github.com/ar-agents/ar-agents/commit/2d9985d17894ec7dd731434a3fcbd11391b703ab)]:
  - @ar-agents/core@0.4.1

## 0.2.5

### Patch Changes

- Updated dependencies [[`21e5c38`](https://github.com/ar-agents/ar-agents/commit/21e5c389ca5355567c89c125a53749e3e22a50bf)]:
  - @ar-agents/core@0.4.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1), [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c), [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b)]:
  - @ar-agents/core@0.3.0

## 0.2.3

### Patch Changes

- Rebuild and republish from PII-scrubbed source. Versions published before the 2026-06-17 fixture scrub shipped a real CUIT and address in their README/AGENTS/cookbook/dist; this rebuild from the now-clean source removes them. No API changes. The earlier contaminated versions are deprecated on npm.

## 0.2.2

### Patch Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

## 0.2.1

### Patch Changes

- Vision mega-update: package descriptions aligned to the canonical framing (open infrastructure for Argentina's sociedades de IA), em dashes removed, mcp bundles 13 packages, incorporate points to ar-agents.ar.

## 0.2.0

### Minor Changes

- [`ae82cc9`](https://github.com/ar-agents/ar-agents/commit/ae82cc9c3c3d7ac744d5653ada169505c029c7f5) Thanks [@naza00000](https://github.com/naza00000)! - Second lift wave: the 4 swarm-wave packages now extend `ArAgentsError`
  from `@ar-agents/core`.

  This brings the family-coherence count to **10 / 26 packages** all
  emitting the uniform `{ code, retryable, context }` shape that
  `@ar-agents/core` middleware (`withRetry`, `withMetrics`, …)
  expects without parsing messages.

  `banking-bcra`, `suss`, and `tienda-nube` already exposed the same
  field surface; the change is purely the base class. `wscdc` previously
  used standalone fields (`field`, `status`, `faultCode`); they're kept
  on the instances and now ALSO mirrored into `context` for cross-package
  middleware.

  All 106 tests across the 4 packages pass; no public-API changes.

## 0.1.0

### Minor Changes

- [`b24b2fe`](https://github.com/ar-agents/ar-agents/commit/b24b2fe1f5e91fcdb97fab59ae750892cf319a71) Thanks [@naza00000](https://github.com/naza00000)! - Two new packages: validate received facturas + retain IVA on supplier payments.

  ## `@ar-agents/wscdc` (initial release)

  AFIP WSCDC — Constatación de Comprobantes Destinatarios. Validate that a factura received from a supplier was actually issued by AFIP with a real CAE, BEFORE ingesting it into accounts payable.

  - `HttpWscdcAdapter` — real adapter with SOAP envelope construction + parsing + SoapAction headers. Caller supplies a WSAA AccessTicket; the adapter handles the rest. Supports homo + prod endpoints, request timeout, custom User-Agent.
  - `InMemoryWscdcAdapter` — deterministic in-process adapter. Pre-seed `(CAE, emisor, ptoVta, cbteTipo, cbteNro)` triples; matches → "A", IVA differs → "O", missing → "N". For integration tests + cockpit dogfood without AFIP creds.
  - `UnconfiguredWscdcAdapter` — explicit `throws on every call` default.
  - Pure `validateConstatarRequest()` catches CUIT shape, date format, CAE length, etc. before the network round-trip.
  - 2 Vercel AI SDK tools: `wscdc_validate_comprobante`, `wscdc_health`.
  - 33 offline tests covering envelope construction, response parsing (A/N/O), SOAP fault handling, HTTP error translation, in-memory match semantics, validation guards.

  The fundamental anti-phishing guard for any AP-automation agent. Translates AFIP's three-valued `Resultado` (A/N/O) into a typed discriminated result the agent can switch on without misinterpreting.

  ## `@ar-agents/iva-retenciones` (initial release)

  The mirror of `@ar-agents/iva-percepciones` — RG 2854/10 IVA retention regime. Where percepción adds a charge to a sale (buyer pays more), retención withholds part of the IVA on a payment to a supplier (supplier takes home less).

  - `calculateRetention(input)` — per-payment math applied to the IVA component of the comprobante (NOT the net or total).
  - `buildRetentionDdjj({period, agentCuit, entries})` — monthly SIRE DDJJ assembly with per-regime + per-supplier breakdowns.
  - 3 operation types baked-in: `servicios` (50% RI / 100% no-cat), `cosas_muebles` (80% RI / 100% no-cat), `locaciones_inmuebles` (50% RI / 100% no-cat). 4 supplier statuses (responsable_inscripto / monotributista / exento / no_categorizado) with sensible default rates per RG 2854/10 2024-Q4 snapshot. Mínimo IVA $5.000 per comprobante for RI.
  - Non-retention certificate flag short-circuits to 0.
  - 3 Vercel AI SDK tools: `iva_retention_calculate`, `iva_retention_build_ddjj`, `iva_retention_submit_ddjj`.
  - 17 offline tests.

  Together with `@ar-agents/iva-percepciones` (already shipped) and `@ar-agents/sicore` (Ganancias retentions), this closes the federal AR tax-agent surface for AP/AR-automation workflows.
