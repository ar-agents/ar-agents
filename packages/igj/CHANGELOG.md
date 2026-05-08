# @ar-agents/igj

## 0.1.0

### Minor Changes

- Initial release. Inspección General de Justicia open data wrapped as Vercel AI SDK 6 tools.
  - `LiveCkanFetcher` against `datos.jus.gob.ar/api/3/action/datastore_search` (no auth required).
  - `MockIgjFetcher` for tests/demos. `UnconfiguredIgjFetcher` safe-by-default.
  - 6 tools: search, get entity, domicilios, autoridades, balances, asambleas.
  - Pure normalize helpers (`parseEntity`, `normalizeEntityType`, `normalizeCuit`) that work without a fetcher.
  - Resource ids overridable for resilience against dataset republishing.
  - Every result carries `coverageNote` explaining sample-dataset limitations.
