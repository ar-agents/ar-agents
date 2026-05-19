# @ar-agents/constancia

## 0.1.0

### Minor Changes

- Initial release: `@ar-agents/constancia` — ARCA (ex-AFIP) Constancia de Inscripción as a typed, browser-backed tool for the Vercel AI SDK. Returns the parsed fiscal situation **plus the official PDF artifact** (with its código verificador) — the piece the SOAP padrón webservices structurally cannot give you. Drives the public web form (no Clave Fiscal) behind a pluggable `ConstanciaFetcher` contract (`BrowseSkillConstanciaFetcher` / `MockConstanciaFetcher` / `UnconfiguredConstanciaFetcher`); ships no browser and no Browserbase dependency — a deliberately quarantined browser-backed tier. Companion browser runbook published as the `afip-constancia` skill on `browserbase/skills`; both share one JSON output contract (`parseSkillOutput`). One artifact, two surfaces.
