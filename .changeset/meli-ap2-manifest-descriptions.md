---
"@ar-agents/mercadolibre": patch
"@ar-agents/ap2": patch
---

`tools.manifest.json` for both packages shipped with null/missing tool
descriptions. Cause: mercadolibre and ap2 define their tools in
`src/ai-sdk.ts` instead of `src/tools.ts`, and `scripts/regen-manifests.mjs`
only ever parsed `src/tools.ts`. `regen-manifests.mjs` now falls back to
`src/ai-sdk.ts` when a package has no `src/tools.ts`, reusing the same
`tool({ description: ... })` / `DEFAULT_DESCRIPTIONS` extraction, so no
package that keeps its tools in `src/tools.ts` changes. Regenerating picked
up ap2's real 7 tools (previously an empty `tools: []`) and refreshed
mercadolibre's 14 descriptions. The site-wide tool count moved 245 to 252
and the hand-written copy was synced to match.
