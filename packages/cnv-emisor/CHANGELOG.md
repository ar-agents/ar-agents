# @ar-agents/cnv-emisor

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
