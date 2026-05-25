---
"@ar-agents/banking-bcra": minor
"@ar-agents/suss": minor
"@ar-agents/tienda-nube": minor
"@ar-agents/wscdc": minor
---

Second lift wave: the 4 swarm-wave packages now extend `ArAgentsError`
from `@ar-agents/core`.

This brings the family-coherence count to **10 / 26 packages** all
emitting the uniform `{ code, retryable, context }` shape that
`@ar-agents/core` middleware (`withRetry`, `withMetrics`, …)
expects without parsing messages.

`banking-bcra`, `suss`, and `tienda-nube` already exposed the same
field surface; the change is purely the base class. `wscdc` previously
used standalone fields (`field`, `status`, `faultCode`); they're kept
on the instances and now ALSO mirrored into `context` for cross-package
middleware.

All 106 tests across the 4 packages pass; no public-API changes.
