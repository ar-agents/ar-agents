---
"@ar-agents/banking": minor
---

Add `@ar-agents/banking/testing` subpath with `MockBcraDeudaAdapter` + `MockBcraVarsAdapter` and result factories (`mockBcraDeudaClean`, `mockBcraDeudaRiesgo`, `mockBcraDeudaUnavailable`, `mockUsdOficialSeries`, `mockCerSeries`). Lets cookbook recipes and downstream apps test BCRA-dependent flows without a live BCRA round-trip.
