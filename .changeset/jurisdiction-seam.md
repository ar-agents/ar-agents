---
"@ar-agents/core": minor
---

Add jurisdiction seam: `Jurisdiction` / `FiatRail` / `Registry` / `TaxRule` interfaces + AR first impl (`AR_CEDULAR`, `AR_MONOTRIBUTO`, `AR_TAX_RULES`, `createArJurisdiction`, `createJurisdictionRegistry`). Additive, export-only; no breaking change. AR is jurisdiction #1, not the only one — the registry and fiat rails are injected by the host so core stays dependency-free.
