---
"@ar-agents/mercadolibre": patch
"@ar-agents/ap2": patch
---

`tools.manifest.json` for both packages shipped with null/missing tool
descriptions. Cause: mercadolibre and ap2 define their tools in
`src/ai-sdk.ts` instead of `src/tools.ts`, and `scripts/regen-manifests.mjs`
only ever parsed `src/tools.ts`. `regen-manifests.mjs` now falls back to
`src/ai-sdk.ts` when a package has no `src/tools.ts`, using the same
`tool({ description: ... })` / `DEFAULT_DESCRIPTIONS` extraction it already
uses elsewhere -- no change for packages that keep their tools in
`src/tools.ts`. Regenerating picked up ap2's 7 tools (previously an empty
`tools: []`, since the old extractor found nothing to parse) and refreshed
descriptions for mercadolibre's 14 tools.
