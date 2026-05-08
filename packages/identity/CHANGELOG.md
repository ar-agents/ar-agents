# Changelog

## 0.6.0

### Minor Changes

- [`687aa10`](https://github.com/ar-agents/ar-agents/commit/687aa1017a665ed9b3414b9f92db634a9329ac4e) - Add `identity doctor` CLI for environment diagnosis.

  ```bash
  npx @ar-agents/identity doctor
  ```

  Validates `AFIP_CUIT` (algorithm-only), checks `AFIP_CERT_PEM` and `AFIP_KEY_PEM` are PEM-shaped, and confirms `AFIP_ENV` is `prod` or `homo`. Lists the 2 tools (`validate_cuit` always-on, `lookup_cuit_afip` adapter-required). Exit codes 0/1 for CI.

  Helps users distinguish "env vars missing" from "cert wrong-CA" from "wrong service alias" before hitting the WSAA round-trip.

## 0.5.1

### Patch Changes

- [`da49fde`](https://github.com/ar-agents/ar-agents/commit/da49fde136ecea89b4755fe74b3ed91ed9720f46) - Enable [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) for all `@ar-agents/*` packages. From this version on, the npm registry includes a verifiable cryptographic record that the package was built from this exact GitHub commit, via the GitHub Actions `release.yml` workflow. Boosts supply-chain audit scores (Socket / Snyk / npm) and lets downstream agents verify package integrity without trusting the publisher.

  No API or runtime changes.

## 0.5.0

### Minor Changes

- Identity v0.5: production robustez parity with the rest of the toolkit.

  **WSAA + WSCDC now share a hardened HTTP layer** (`fetchWithRetry`):

  - Per-request timeouts via `AbortSignal` (default 30s, override with `requestTimeoutMs`).
  - Exponential backoff on 5xx + transient network errors (default 1 retry, override with `maxRetries`).
  - SOAP-aware: HTTP 500 with a real `<Fault>` body is treated as a parseable response (not retried).
  - Optional `onCall` observability hook fires after every WSAA + WSCDC request — `{ label, durationMs, httpStatus, retried, success }` — drop-in for OpenTelemetry / Datadog / console.

  **`WsaaWscdcAdapter` accepts the new options** (`requestTimeoutMs`, `maxRetries`, `onCall`) and forwards them to both the TA refresh path and the per-CUIT lookup path.

  **`fetchWithRetry` is exported from `@ar-agents/identity/wsaa`** so multi-step flows (custom AFIP services, A4, A5, etc.) can reuse the same retry/timeout/observability stack.

  No breaking changes — existing 0.4 setups keep working with the previous (no-retry, no-timeout) defaults until you opt in.

  The MCP wrapper bumps to pull in the new identity major.

## 0.4.0

### Minor Changes

- Add `ws_sr_constancia_inscripcion` support — full constancia data (monotributo + IVA condition + impuestos asociados).

  **What's new**

  - `WsaaWscdcAfipPadronAdapter` now accepts a `service` option:
    - `"ws_sr_constancia_inscripcion"` (default, recommended) — full constancia
    - `"ws_sr_padron_a13"` — datos generales only (lighter, no monotributo)
  - Both share the same `getPersona` operation but the response shapes differ. The parser handles both transparently.
  - Constancia uses the `personaServiceA5` endpoint URL (`http://a5.soap.ws.server.puc.sr/` namespace) — reuses what was previously thought of as the "deprecated A5" endpoint, but with a different TA service name (`ws_sr_constancia_inscripcion`).
  - Live-tested against ARCA prod (AFIP rebrand) — returns nombre, condicion (MONOTRIBUTO/RESPONSABLE INSCRIPTO/EXENTO), monotributoCategoria, domicilio fiscal, actividades.

  **API additions**

  ```ts
  // New exports from @ar-agents/identity/wsaa
  import {
    CONSTANCIA_INSCRIPCION_SERVICE_NAME, // "ws_sr_constancia_inscripcion"
    PADRON_A13_SERVICE_NAME, // "ws_sr_padron_a13"
    type AfipPadronService,
    getPersona, // service-aware (replaces getPersonaA13)
  } from "@ar-agents/identity/wsaa";

  // Default — uses constancia (richer)
  new WsaaWscdcAfipPadronAdapter({ certPem, keyPem, cuitRepresentado, env });

  // Opt into the lighter A13-only flavor
  new WsaaWscdcAfipPadronAdapter({
    certPem,
    keyPem,
    cuitRepresentado,
    env,
    service: "ws_sr_padron_a13",
  });
  ```

  **Backward compatibility**

  - `getPersonaA13` is kept as a deprecated alias that calls `getPersona({ service: "ws_sr_padron_a13", ... })`.
  - `WSCDC_SERVICE_NAME` now points to `ws_sr_constancia_inscripcion` (was `ws_sr_padron_a13` in v0.3). If you relied on the v0.3 default to query A13, pass `service: "ws_sr_padron_a13"` explicitly OR authorize the new constancia service in your AFIP/ARCA "Administrador de Relaciones".

  **Note on AFIP → ARCA rebrand**

  AFIP was renamed to ARCA (Agencia de Recaudación y Control Aduanero) in 2025. URLs, panels, and forms still mix both names — the lib uses "AFIP" in code/docs because the WSAA + WSCDC service names didn't change.

## 0.3.0

### Minor Changes

- [`cd4756b`](https://github.com/ar-agents/ar-agents/commit/cd4756b3a377b1c8f439e93dd7cd3cc9cad79f2c) - First end-to-end functional release of the WSAA + WSCDC adapter.

  **Bug fixes (the previous v0.2.0 didn't work end-to-end against AFIP)**

  - WSCDC migrated from deprecated `ws_sr_padron_a5` to `ws_sr_padron_a13`. AFIP retired A5; only A4 and A13 remain in the service catalog.
  - WSAA: switched signing from detached PKCS#7 CMS to attached. AFIP needs eContent embedded to verify; detached signing returned `cms.sign.invalid`.
  - WSCDC envelope: targetNamespace `http://a13.soap.ws.server.puc.sr/`, operation renamed from `getPersona_v2` to `getPersona`, child elements (token, sign, cuitRepresentada, idPersona) are NOT namespace-prefixed (A13 WSDL uses `elementFormDefault="unqualified"`).
  - WSCDC parser updated for A13 response shape: `<personaReturn>` wrapper, multiple `<domicilio>` blocks distinguished by `<tipoDomicilio>` (FISCAL vs LEGAL/REAL), `codigoPostal` (not `codPostal`), `descripcionActividadPrincipal` at persona level.
  - SOAP fault handling: HTTP 500 with structured Fault now passes through to the parser, which converts `inexistente` faults into `available: false` results instead of throwing.

  **New: PEM-string adapter mode for serverless**

  Added `certPem` / `keyPem` options alongside `certPath` / `keyPath` so the lib works in filesystem-less runtimes (Vercel, Lambda, Cloudflare Workers). Paste PEM contents into env vars. PEM strings are robust-normalized to handle escaped `\n` survival from dashboard env-var paste and single-line copy-paste accidents.

  **Known limitation**

  A13 is "datos generales" — it does NOT include monotributo category or fechaInscripcion. The lib reports `condicion: "DESCONOCIDA"` and null for those fields. Full constancia (monotributo + IVA condition + impuestos asociados) requires `ws_sr_constancia_inscripcion`, planned for v0.4.

  Verified end-to-end against AFIP prod via the `cuit-hello` reference app deployed to Vercel.

## 0.2.0

### Minor Changes

- [`12519eb`](https://github.com/ar-agents/ar-agents/commit/12519eb6868c4b3acc556803b70c6335283e39f2) - Add `WsaaWscdcAfipPadronAdapter` — production-ready AFIP padrón lookup via WSAA + WSCDC SOAP.

  Imported from the new subpath `@ar-agents/identity/wsaa` (kept off the main entry so users who only need pure-algorithm validation don't pull in `node-forge`). The adapter implements `AfipPadronAdapter` and handles:

  - WSAA login flow: TRA generation → PKCS#7 detached CMS signing with the integration's X.509 cert → POST to `loginCms` → parsing the returned access ticket
  - TA caching with pluggable `TokenStore` (in-memory default; bring your own Upstash/Redis/Postgres adapter for multi-process deployments)
  - WSCDC `getPersona_v2` SOAP call with full response parsing into `AfipPadronData` (name, tax condition, monotributo category, address, activities)
  - Typed error surfacing: WSAA failures return `{ available: false, error: "Failed to authenticate with AFIP WSAA: ..." }` with actionable detail, never throws unexpectedly
  - Fast path for malformed CUITs: rejected before any AFIP call

  Also exports `loginCms`, `TokenCache`, `InMemoryTokenStore`, `getPersonaV2`, and the underlying `buildTraXml` / `signTra` / `parseLoginTicketResponse` / `buildGetPersonaSoap` / `parseGetPersonaResponse` helpers for callers who want to compose their own AFIP flows.

  Setup requires generating an X.509 cert + key with openssl, registering it in AFIP via Clave Fiscal, and authorizing the cert for the `ws_sr_padron_a5` service. See README's "Quick start (with AFIP padrón lookup)" section for the full walkthrough.

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
