# @ar-agents/aduana

## 0.3.0

### Minor Changes

- [#145](https://github.com/ar-agents/ar-agents/pull/145) [`160871b`](https://github.com/ar-agents/ar-agents/commit/160871b465c4e0c0a78b6af978fd8c97e9d5136b) Thanks [@naza00000](https://github.com/naza00000)! - Migrate `HttpAduanaAdapter` onto `@ar-agents/core`'s `HttpClient` (SDK-audit P1 [#14](https://github.com/ar-agents/ar-agents/issues/14), following banking-bcra and inpi).

  The ARCA Aduana lookups now run through the shared transport: a real per-request timeout (default 10s — the reads had none, so a slow ARCA endpoint hung the agent forever), idempotent-GET retry with jittered backoff, and typed errors mapped back to `AduanaApiError`.

  Responses are now **schema-validated**, fixing the audit's `found: true`-on-any-200 bug: `lookupDespacho` used to stamp `found: true` onto whatever came back with HTTP 200, so an error page or an empty `{}` became a "found" customs declaration. It now requires a valid despacho `status` and throws `ArAgentsResponseValidationError` on anything else — a non-despacho body can no longer masquerade as a real, found declaration. `lookupNcm` is likewise validated. Both still return the not-found sentinel (`{found:false}` / `null`) on a genuine 404.

  New `HttpAduanaAdapterOptions`: `timeoutMs`, `retry`, `userAgent`. The `fetch` option is unchanged.

### Patch Changes

- Updated dependencies [[`21e5c38`](https://github.com/ar-agents/ar-agents/commit/21e5c389ca5355567c89c125a53749e3e22a50bf)]:
  - @ar-agents/core@0.4.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1), [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c), [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b)]:
  - @ar-agents/core@0.3.0

## 0.2.1

### Patch Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

## 0.2.0

### Minor Changes

- [`1a7935c`](https://github.com/ar-agents/ar-agents/commit/1a7935c5e07b5d2aae44828d5183ce6329c6840d) Thanks [@naza00000](https://github.com/naza00000)! - Five new packages — Argentine government / regulatory surfaces:

  - **`@ar-agents/aduana`** — ARCA Aduana (formerly AFIP / María). Look up
    customs declarations by SUSI / KIM / OM number; NCM tariff resolution.
    2 tools.
  - **`@ar-agents/dnrpa`** — Argentine vehicle plate (dominio) lookups.
    Browser-backed by design (DNRPA has no free REST API); ships
    Unconfigured + InMemory adapters + a plate-format detector.
    1 tool.
  - **`@ar-agents/inpi`** — INPI trademark registry. Substring search +
    Nice-class filter + status enum (`concedida` / `oposicion` / etc.).
    Get-by-acta lookup. 2 tools.
  - **`@ar-agents/anses`** — ANSES social-security. CUIL status, family
    allowance entitlements (AUH / AUE / SUAF / etc.), haber mínimo
    reference table. 3 tools.
  - **`@ar-agents/cnv-emisor`** — CNV (Argentine SEC) issuer disclosures.
    Issuer registry, hechos relevantes (with category filter), financial
    statement filings. 3 tools.

  Every package extends `ArAgentsError` from `@ar-agents/core` so they fit
  the family-coherence contract from day one. Each ships:

  - Typed adapter contract + `UnconfiguredXxxAdapter` + `InMemoryXxxAdapter`
  - Vercel AI SDK tool collection
  - README + AGENTS.md (LLM runtime rules) + `tools.manifest.json`
  - Smoke tests covering the tool factory, error model, and in-memory adapter

  11 new tools total. 39 new tests, all passing.
