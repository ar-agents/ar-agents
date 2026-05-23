---
"@ar-agents/iibb": minor
---

Real padrón adapters for CABA + BSAS, plus an extensible HTTP base.

- `HttpPadronAdapter` — abstract base class accepting an injected `fetch` function, with built-in timeout, error normalisation, and User-Agent. Subclass by implementing `buildLookupRequest` + `parseLookupResponse`.
- `AgipPublicAdapter` (CABA) — concrete implementation hitting AGIP's public consulta endpoint. No CIT credentials needed for read-only padrón status. Recognises both the JSON and HTML response shapes that AGIP serves across its UI variants.
- `ArbaCitAdapter` (BSAS) — concrete implementation hitting ARBA's dfe service. Type-level requires a host-supplied authenticated `fetch` wrapper carrying the CIT session cookie (the package never stores credentials). Parses both the JSON and XML response surfaces.
- `FetchLike`, `HttpPadronAdapterOptions`, `AgipPublicAdapterOptions`, `ArbaCitAdapterOptions` are exported for typed extension.
- Legacy `AgipAdapter` and `ArbaAdapter` stubs are kept exported but marked `@deprecated`. Migration is one-line: swap the import.
- 25 new adapter tests, fully offline (no real network calls in CI).
