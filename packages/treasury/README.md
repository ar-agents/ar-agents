# @ar-agents/treasury

The treasury + fiscal rail for an Argentine **Sociedad Automatizada**: the moat half of the crypto/fiat bridge. An autonomous society earns in crypto (USDC on Base) but must pay AFIP/ARCA in pesos. This package closes that loop.

## What it does

- **Balances + tax buffer** — track USDC + ARS; size the peso buffer for upcoming AFIP obligations (`requiredArsBuffer`, `nextObligation`).
- **Just-in-time conversion** — convert only enough USDC to ARS to cover the buffer, net of spread, never over-converting (`planConversion`, `fundTaxBuffer`).
- **Ganancias cedular accounting** — tax on the gain of each disposal: 5% (ARS) or 15% (foreign); crypto is IVA-exempt; holding + own-wallet transfers are not taxable (`cedularTax`).
- **Monotributo** — the verified 2026 category table (A–K, eff. 2026-02-01) + `monotributoCuota` / `categoryForAnnualIncome`.
- **Honest settlement model** — `settlementPlan` describes how an obligation actually gets paid. In jun-2026 there is **no fully-autonomous official channel**, so `canAutoExecute` is always `false`: débito automático is *passive* (one-time human enrolment, then it runs and the agent only keeps the CVU funded); VEP / Mercado Pago need a human each time. The rail funds + instructs; it does not pay.
- **MantecaOffRampAdapter** — the real USDC→ARS payout to a CVU, done by a **registered PSAV** (Manteca). We integrate one; we do not become one (CNV RG 1058/2025). An `InMemoryOffRampAdapter` ships for tests/dev.
- **AI SDK tools** — `@ar-agents/treasury/tools` exports `treasuryTools()`: 8 Vercel AI SDK 6 tools (5 pure + 3 PSAV-backed) that drop into an `Experimental_Agent`.

## Entry points

- `@ar-agents/treasury` — pure core + `MantecaOffRampAdapter` + AFIP fiscal logic. **No `ai`/`zod` deps.**
- `@ar-agents/treasury/tools` — the AI SDK tool wrappers (needs the `ai` + `zod` peers).

## Design

Pure, deterministic functions (clock + fx injected, never read) so the brain is fully unit-tested. Irreversible moves (`convert`, payments) MUST be gated by the agent's `requireConfirmation` (RFC-001) and written to the signed audit log by the caller. We orchestrate on top of a registered PSAV; we never custody the conversion ourselves.

## Going live with Manteca

`MantecaOffRampAdapter` is a thin client over Manteca's documented v2 API. The **request contract is pinned exactly** (paths, `md-api-key` header, the ramp-off body) and unit-tested against mocked HTTP. Manteca onboarding is sales-gated (no self-serve keys), so it is **not yet integration-tested live**. To go to production, confirm three config items against a sandbox account, then run for real:

1. `baseUrl` — defaults to `https://api.manteca.dev` (the public docs host is `developers.manteca.dev`; the live API host ships with your credentials).
2. `ticker` — defaults to `USDC_ARS`.
3. The price-response JSON shape and the synthetic status enum — both are parsed defensively + normalized here; verify against a sandbox call.

Ripio B2B (a registered PSAV with a documented sandbox) is the planned second adapter behind the same `OffRampAdapter` interface.

## Status

`0.2.0` — core + Manteca off-ramp adapter + AFIP fiscal layer (monotributo + settlement) + 8 AI SDK tools, **52 tests**. Wired into the generated society (select the `treasury` pieza). Live PSAV integration is pending a Manteca business account; the Ripio adapter is the next increment. Full design + sourcing: [`../../TREASURY-FISCAL-RAIL.md`](../../TREASURY-FISCAL-RAIL.md).
