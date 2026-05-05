# Changelog

All notable changes to `@ar-agents/identity` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/) and the project adheres
to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-05-05

Initial release. Extracted from the `cuit-hello` reference app.

### Added
- `parseCuit()` / `isValidCuit()` / `computeCheckDigit()` / `normalizeCuit()` /
  `describePersonType()` — pure-algorithm CUIT/CUIL validation and parsing.
- `identityTools()` — drop-in tool collection for the Vercel AI SDK 6+. Two
  tools: `validate_cuit` (pure algorithm, always works) and `lookup_cuit_afip`
  (delegates to user-supplied `AfipPadronAdapter`).
- `validateCuitTool` — standalone export of just the validate tool.
- `AfipPadronAdapter` interface for pluggable AFIP padrón backends.
- `UnconfiguredAfipPadronAdapter` — default safe adapter that returns
  `{ available: false, error: <setup steps> }` instead of throwing when the
  app hasn't wired a real AFIP integration.
- Three typed error classes: `IdentityError` (base), `AfipNotConfiguredError`,
  `AfipCuitNotFoundError`.
- Public types: `CuitParseResult`, `CuitPersonType`, `AfipPadronData`,
  `AfipPadronResult`, `AfipTaxCondition`, `MonotributoCategoria`,
  `IdentityErrorCode`, `IdentityToolName`, `IdentityToolsOptions`.

### Tested
- 20+ unit tests across `cuit`, `afip-adapter`, `tools`, and `errors` test
  files, all passing.

### Documented
- `README.md` — human-friendly intro, quick start (with and without cert),
  AFIP cert setup walkthrough, standalone API reference, algorithm summary,
  test cases, error reference.
- `AGENTS.md` — agent-targeted format following the [agents.md
  convention](https://agents.md/). Tool selection rules, result schemas
  (memorizable), error patterns, composition with other `@ar-agents/*`
  packages, latency table, AR context for non-AR agents.

### Known limitations
- AFIP padrón lookup is contract-only in v0.1; the real WSAA + WSCDC SOAP
  implementation is left to the consumer (or future v0.2 reference adapter).
- Algorithm currently targets MLA (Argentina) only; CUIT-equivalent IDs in
  other LATAM countries (CPF/BR, RUC/PE, RFC/MX, RUT/CL/UY) are not in scope.
- Renaper DNI lookup is not in v0.1; planned for v0.3.
- Factura electrónica issuance is out of scope; use a dedicated AFIP invoicing
  package.
