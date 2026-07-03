# @ar-agents/igj

## 0.3.0

### Minor Changes

- [#148](https://github.com/ar-agents/ar-agents/pull/148) [`024a68f`](https://github.com/ar-agents/ar-agents/commit/024a68f968e1074f1474764c2b82fcdf6dc4ad52) Thanks [@naza00000](https://github.com/naza00000)! - Migrate `LiveCkanFetcher` onto `@ar-agents/core`'s `HttpClient` (SDK-audit P1 [#14](https://github.com/ar-agents/ar-agents/issues/14)).

  IGJ's CKAN datastore lookups now run through the shared client: it keeps the per-request timeout it already had, **adds idempotent-GET retry** with backoff (the reads had none), and typed errors mapped back to `IgjError`. The CKAN action envelope is **schema-validated**, so a `success:true` body whose `result.records` isn't an array now throws instead of being coerced into an empty result set; CKAN's own `success:false` errors still surface with their original message, and a non-200 still maps to `CKAN <status>`.

  New `LiveCkanFetcherOptions.retry`. `baseUrl`/`fetch`/`timeoutMs`/`resourceIds` unchanged.

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

- [`15f9b89`](https://github.com/ar-agents/ar-agents/commit/15f9b8974b514f4321f939324fa4d24dac81ba95) Thanks [@naza00000](https://github.com/naza00000)! - Lift sweep — final wave: every remaining OG package now extends
  `ArAgentsError` from `@ar-agents/core`.

  After this release, **23 of 26 `@ar-agents/*` packages** share the
  uniform `{ code, retryable, context }` family contract. The three
  packages still on plain `Error` (`agentic-commerce-bridge`, `ap2`,
  `mcp`) have no dedicated `errors.ts` module — they throw `Error`
  inline at the call site; their lift is a deeper refactor tracked
  separately.

  For all 12 packages here: backward compatible. Public constructors,
  field names, and `instanceof` checks unchanged. New: `error.retryable`
  flag wired per code (e.g. `wsfe_service_unavailable: true`,
  `bcra_rate_limited: true`, `discovery_failed: true`, `ckan_unreachable:
true`, `fetcher_unreachable: true`, `shipping_carrier_error: true`);
  non-transient codes default to `retryable: false`.

  One **internal-API** rename in `@ar-agents/whatsapp`: `WhatsAppApiError.code`
  (previously the Meta numeric error code) is now exposed as
  `WhatsAppApiError.metaCode` so the family-uniform `code: string`
  contract (`whatsapp_meta_<n>`) can sit on the same instance. Callers
  that read `err.code` as a number must migrate to `err.metaCode`; the
  deserialized webhook event field `event.errors[i].code` is unchanged
  (still numeric, since it's not a `WhatsAppApiError` instance).

  Family-coherence count after this release: **23 / 26 packages**.

## 0.1.0

### Minor Changes

- Initial release. Inspección General de Justicia open data wrapped as Vercel AI SDK 6 tools.
  - `LiveCkanFetcher` against `datos.jus.gob.ar/api/3/action/datastore_search` (no auth required).
  - `MockIgjFetcher` for tests/demos. `UnconfiguredIgjFetcher` safe-by-default.
  - 6 tools: search, get entity, domicilios, autoridades, balances, asambleas.
  - Pure normalize helpers (`parseEntity`, `normalizeEntityType`, `normalizeCuit`) that work without a fetcher.
  - Resource ids overridable for resilience against dataset republishing.
  - Every result carries `coverageNote` explaining sample-dataset limitations.
