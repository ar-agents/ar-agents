---
"@ar-agents/treasury": minor
"@ar-agents/core": patch
---

**OUSD → ARS route** (`createOusdArsRoute`). The on-thesis way ar-agents handles Open USD off-ramping: it does NOT become the ramp (that is a regulated PSAV/VASP — CNV registration, AML, banking). It ORCHESTRATES on top of a licensed `OffRampAdapter` (Bitso/Ripio/Manteca/Mural) and adds the parts that are ours — the AFIP-correct `accounting_payload` (mark-to-market ARS valuation at execution time, reported separately from the provider's realized ARS so the off-ramp spread is a visible cost) and the registry/guardrail posture. `convert` is irreversible: gate it behind art.102 + spending guardrails.

**MOCK-until-live.** OUSD is not issued yet and no AR PSAV has listed it, so by default both legs are mocked (`InMemoryOffRampAdapter` + `mockFxOracle`). `route.live` is `false` until `OPEN_USD.status === "live"`. Pass a real `provider` + `fx` once OUSD is live, a provider lists it, and the AR legal/FX (cepo) treatment is cleared.

- `@ar-agents/treasury` now depends on `@ar-agents/core` for the accounting bridge.
- `@ar-agents/core`: `OPEN_USD.status` is now typed `OpenUsdStatus` (`"pre-launch" | "live"`) so downstream code can gate on `=== "live"`.
