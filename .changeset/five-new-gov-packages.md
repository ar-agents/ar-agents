---
"@ar-agents/aduana": minor
"@ar-agents/dnrpa": minor
"@ar-agents/inpi": minor
"@ar-agents/anses": minor
"@ar-agents/cnv-emisor": minor
---

Five new packages — Argentine government / regulatory surfaces:

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
