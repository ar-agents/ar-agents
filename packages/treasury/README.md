# @ar-agents/treasury

The treasury + fiscal rail for an Argentine **Sociedad Automatizada**: the moat half of the crypto/fiat bridge. An autonomous society earns in crypto (USDC on Base) but must pay AFIP in pesos. This package is the pure-logic brain of that loop.

## What it does

- **Balances + tax buffer** — track USDC + ARS; size the peso buffer for upcoming AFIP obligations (`requiredArsBuffer`, `nextObligation`).
- **Just-in-time conversion** — convert only enough USDC to ARS to cover the buffer, net of spread, never over-converting (`planConversion`, `fundTaxBuffer`).
- **Ganancias cedular accounting** — tax on the gain of each disposal: 5% (ARS) or 15% (foreign); crypto is IVA-exempt (`cedularTax`).
- **OffRampAdapter** — the USDC to ARS payout to a CVU, done by a **registered PSAV** (Manteca API Cripto/Rampa, or Ripio B2B). We integrate one; we do not become one (CNV RG 1058/2025). Ships an `InMemoryOffRampAdapter` for tests/dev.

## Design

Pure, deterministic functions (clock + fx injected, never read) so the brain is fully unit-tested. Irreversible moves (`convert`, payments) MUST be gated by the agent's `requireConfirmation` (RFC-001) and written to the signed audit log by the caller. We orchestrate on top of a registered PSAV; we never custody the conversion ourselves.

## Status

`0.1.0` — core + in-memory adapter (15 tests). The real Manteca / Ripio B2B adapter (a thin client to their off-ramp API) and the AI SDK tool wrappers are the next increment. Full design: `../../TREASURY-FISCAL-RAIL.md`.
