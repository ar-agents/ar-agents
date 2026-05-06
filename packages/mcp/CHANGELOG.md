# Changelog

## 0.3.0

### Minor Changes

- MCP v0.3: ships `@ar-agents/facturacion` as 6th tool registry.

  The MCP server now exposes 6 packages:

  - `@ar-agents/identity` (validate_cuit, lookup_cuit_afip)
  - `@ar-agents/identity-attest` (4 attestation tools)
  - `@ar-agents/mercadopago` (41 MP API tools)
  - `@ar-agents/whatsapp` (6 messaging tools)
  - `@ar-agents/banking` (5 CBU/BCRA tools)
  - **NEW: `@ar-agents/facturacion`** (10 WSFE tools — emitir factura, consultar último, catálogos)

  Auto-detects facturación from env: `AFIP_CUIT_REPRESENTADO` + `AFIP_CERT_PEM/PATH` + `AFIP_KEY_PEM/PATH` (same vars as identity, but the cert must be authorized for the `wsfe` service in addition).

  Tunables: `WSFE_DEFAULT_PTOVTA`, `WSFE_TIMEOUT_MS`, `WSFE_MAX_RETRIES`.

  Server version bumped to 0.3.0 in the MCP handshake.

## 0.2.0

### Minor Changes

- MCP v0.2: ships `@ar-agents/banking` as a 5th tool registry.

  The MCP server now exposes:

  - `@ar-agents/identity` (validate_cuit, lookup_cuit_afip)
  - `@ar-agents/identity-attest` (issue_attestation, verify_attestation)
  - `@ar-agents/mercadopago` (41 MP API tools)
  - `@ar-agents/whatsapp` (6 messaging tools)
  - **NEW: `@ar-agents/banking` (validate_cbu, lookup_bank_by_code, list_banks, list_psps, lookup_credit_situation)**

  Banking tools auto-wire to BCRA's public API via `BcraPublicApiAdapter`
  (no auth required). To opt out, set `AR_AGENTS_BCRA_DISABLED=1` in env.
  Tunables: `BCRA_TIMEOUT_MS` (default 30000), `BCRA_MAX_RETRIES` (default 1).

  Server version bumped from 0.1.0 → 0.2.0 in the MCP handshake.

## 0.1.3

### Patch Changes

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

- Updated dependencies []:
  - @ar-agents/identity@0.5.0

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @ar-agents/mercadopago@0.4.0

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @ar-agents/mercadopago@0.3.0
  - @ar-agents/identity-attest@0.2.0

## 0.1.0

### Initial release — the MCP wrapper

One MCP server that bundles the entire `@ar-agents/*` toolkit (identity, identity-attest, mercadopago, whatsapp) into any MCP host (Claude Desktop, Cursor, Codeium, Continue, Cline, etc.). Up to **34 tools in one install**, configured entirely via env vars.

**What it does**

- Spawns as a stdio MCP server (`npx @ar-agents/mcp`).
- Auto-detects which `@ar-agents/*` packages to enable based on env vars present.
- Bridges Vercel AI SDK 6 `tool()` definitions → MCP `Tool` shape, including Zod → JSON Schema conversion (using Zod 4 native `z.toJSONSchema()`).
- Reports startup summary on stderr (which packages enabled, how many tools registered).

**Tool inventory**

| Source                            | Tools (when configured) |
| --------------------------------- | ----------------------- |
| `@ar-agents/identity` (always on) | 1-2                     |
| `@ar-agents/identity-attest`      | 5                       |
| `@ar-agents/mercadopago`          | 21                      |
| `@ar-agents/whatsapp`             | 6                       |

**Env-var configuration**

- Without any env vars: only `validate_cuit` (algorithm-only).
- Each package's tools enable independently when its env vars are set. See README for the full table.

**Quality**

- 12/12 tests pass (adapter conversions, registry env-var detection, server boot).
- 21.33 KB ESM brotli'd (under 60 KB budget).
- publint + arethetypeswrong all 🟢.
- Smoke-tested CLI binary boots and connects via stdio with both empty and full env-var setups.

**Implementation notes**

- Uses Zod 4's native `z.toJSONSchema()` (no `zod-to-json-schema` dep needed).
- MCP SDK: `@modelcontextprotocol/sdk@^1.0.0`.
- Tool name collisions across registered packages throw at startup (no silent overrides).
