# @ar-agents/banking

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
