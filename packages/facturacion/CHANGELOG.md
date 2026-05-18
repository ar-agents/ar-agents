# @ar-agents/facturacion

## 0.3.1

### Patch Changes

- [#10](https://github.com/ar-agents/ar-agents/pull/10) [`2103c17`](https://github.com/ar-agents/ar-agents/commit/2103c17e89fc6f17659ece3dc0fdc9d28a05e4e7) Thanks [@naza00000](https://github.com/naza00000)! - Add AFIP RG 5616 `CondicionIVAReceptorId` support to `solicitarCAE`.

  AFIP Resolución General 5616 made `CondicionIVAReceptorId` mandatory in
  `FECAESolicitar`; requests omitting it are rejected with observación 10246.
  This release adds:

  - A new `CondicionIvaReceptor` catalog (and `CondicionIvaReceptorCode` type)
    covering the `FEParamGetCondicionIvaReceptor` codes.
  - An optional `condicionIvaReceptorId` field on `SolicitarCaeInput`.
  - A safe default in the request builder when omitted (DocTipo
    `CONSUMIDOR_FINAL` → 5; otherwise Responsable Inscripto → 1) so existing
    callers keep working without code changes while becoming RG 5616
    compliant.

## 0.3.0

### Minor Changes

- [`4aaaecc`](https://github.com/ar-agents/ar-agents/commit/4aaaecc4bab0429f61bd034b60c0c77607562b20) - Add `@ar-agents/facturacion/testing` subpath with `MockWsfeClient` (public-method-compatible stand-in for `WsfeClient`) and result factories (`mockSolicitarCaeApproved`, `mockSolicitarCaeRejected`, `mockUltimoComprobante`, `mockConsultarComprobante`, `mockDummyOk`, `mockDummyDown`). Lets agent loops and recipes test factura-emission flows without a live AFIP/ARCA WSAA + WSFE round-trip.

## 0.2.0

### Minor Changes

- [`e067a4a`](https://github.com/ar-agents/ar-agents/commit/e067a4a4f37e882b32fd0cbf6dfdb872f31d0e6e) Thanks [@naza00000](https://github.com/naza00000)! - Add `doctor` CLIs to the remaining 4 packages — completes the uniform CLI surface across the toolkit.

  ```bash
  npx @ar-agents/banking doctor       # algorithm-only tools, BCRA endpoint, 11 tools
  npx @ar-agents/facturacion doctor   # AFIP cert/key/CUIT/env/PdV check + tools
  npx @ar-agents/shipping doctor      # which carriers (Andreani/OCA/Correo) are wired
  npx -y @ar-agents/mcp doctor        # which @ar-agents/* subpackages your MCP host has wired
  ```

  The `mcp doctor` is particularly useful — it shows the full subpackage status (enabled / partial / disabled) with the always-on tools per package, so a Claude Desktop / Cursor user knows exactly what their host can do without enumerating env vars.

  All 7 published `@ar-agents/*` packages with tools now ship a uniform `doctor` subcommand. Plus `mp-doctor` from earlier still works for backward compat.

### Patch Changes

- Updated dependencies [[`e067a4a`](https://github.com/ar-agents/ar-agents/commit/e067a4a4f37e882b32fd0cbf6dfdb872f31d0e6e)]:
  - @ar-agents/identity@0.7.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`687aa10`](https://github.com/ar-agents/ar-agents/commit/687aa1017a665ed9b3414b9f92db634a9329ac4e)]:
  - @ar-agents/identity@0.6.0

## 0.1.1

### Patch Changes

- [`da49fde`](https://github.com/ar-agents/ar-agents/commit/da49fde136ecea89b4755fe74b3ed91ed9720f46) - Enable [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) for all `@ar-agents/*` packages. From this version on, the npm registry includes a verifiable cryptographic record that the package was built from this exact GitHub commit, via the GitHub Actions `release.yml` workflow. Boosts supply-chain audit scores (Socket / Snyk / npm) and lets downstream agents verify package integrity without trusting the publisher.

  No API or runtime changes.

- Updated dependencies [[`da49fde`](https://github.com/ar-agents/ar-agents/commit/da49fde136ecea89b4755fe74b3ed91ed9720f46)]:
  - @ar-agents/identity@0.5.1

## 0.1.0

### Minor Changes

- Initial release: AFIP/ARCA factura electrónica (WSFE) for Vercel AI SDK 6+ agents.

  **10 tools shipped:**

  - `emitir_factura` — solicit a CAE for a new comprobante
  - `consultar_ultimo_comprobante` — get the next available comprobante number
  - `consultar_factura_emitida` — verify a previously-issued comprobante
  - `obtener_tipos_comprobante` / `obtener_tipos_documento` / `obtener_alicuotas_iva` / `obtener_tipos_concepto` / `obtener_tipos_moneda` — live AFIP catalogs
  - `obtener_cotizacion` — exchange rate for non-PES currencies
  - `health_check_afip` — WSFE health probe

  **Pre-flight validator** catches the 10 most common AFIP rejection reasons LOCALLY (ImpTotal != suma, Iva sum mismatch, Factura C with IVA, Servicios sin fchServ\*, Notas sin cbtesAsoc, etc.) before the network round-trip.

  **Reuses `@ar-agents/identity`** for the WSAA token cache + `fetchWithRetry` — same X.509 cert powers both. Same robustez (timeout / retry / SOAP-fault detection / `onCall` observability hook).

  **51 tests, 80%+ statement coverage, 9 KB brotli'd.**
