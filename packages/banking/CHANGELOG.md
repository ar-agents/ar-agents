# @ar-agents/banking

## 0.3.0

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

## 0.1.1

### Patch Changes

- [`da49fde`](https://github.com/ar-agents/ar-agents/commit/da49fde136ecea89b4755fe74b3ed91ed9720f46) - Enable [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) for all `@ar-agents/*` packages. From this version on, the npm registry includes a verifiable cryptographic record that the package was built from this exact GitHub commit, via the GitHub Actions `release.yml` workflow. Boosts supply-chain audit scores (Socket / Snyk / npm) and lets downstream agents verify package integrity without trusting the publisher.

  No API or runtime changes.

## 0.1.0

### Minor Changes

- Initial release: AR banking primitives for Vercel AI SDK 6+ agents.

  **5 tools shipped:**

  - `validate_cbu` — pure-algorithm CBU/CVU validation with bank/PSP identification (Galicia, Nación, Mercado Pago, Ualá, Naranja X, etc.)
  - `lookup_bank_by_code` — resolve a 3-digit bank code or 7-digit CVU prefix → name
  - `list_banks` — enumerate all known traditional banks
  - `list_psps` — enumerate all known fintechs
  - `lookup_credit_situation` — BCRA Central de Deudores adapter (`BcraPublicApiAdapter` ships, no auth required)

  **Robustez built-in** matching the rest of the toolkit:

  - `BcraPublicApiAdapter` accepts `requestTimeoutMs`, `maxRetries`, `onCall` observability hook
  - HTTP 404 from BCRA cleanly mapped to `available: false` (CUIT not in registry, not a crash)
  - Exponential backoff on 5xx + transient errors

  **Pure tools cost nothing** — no API key, no env var, no network. Drop-in safe.

  54 tests, 90%+ statement coverage, 6.2 KB brotli'd.
