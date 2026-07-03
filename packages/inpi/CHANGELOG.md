# @ar-agents/inpi

## 0.3.0

### Minor Changes

- [#144](https://github.com/ar-agents/ar-agents/pull/144) [`267f842`](https://github.com/ar-agents/ar-agents/commit/267f842302879411fe3e4e64b3278ff538b04e32) Thanks [@naza00000](https://github.com/naza00000)! - Migrate `HttpInpiAdapter` onto `@ar-agents/core`'s `HttpClient` (SDK-audit P1 [#14](https://github.com/ar-agents/ar-agents/issues/14), following banking-bcra).

  The trademark searches now run through the shared transport: a real per-request timeout (default 10s — a slow/flaky INPI mirror previously hung the agent forever), idempotent-GET retry with jittered backoff (the public mirror is flaky, so a transient 5xx/timeout is retried), and typed errors mapped back to `InpiApiError`.

  Most importantly, responses are now **schema-validated**: a search body that isn't a `{ records: TrademarkRecord[] }` envelope — an error page, an empty `{}`, or a record with an unknown `status` — now throws `ArAgentsResponseValidationError` instead of being blind-cast into `records: []` and read downstream as **"no conflicting trademarks."** That fabrication could have greenlit registering an infringing mark. `getByActa` still returns `null` on 404.

  New `HttpInpiAdapterOptions`: `timeoutMs`, `retry`, `userAgent`. The `fetch` option is unchanged (already a standard `fetch`).

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
