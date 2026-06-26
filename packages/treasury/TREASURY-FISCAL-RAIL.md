# Treasury settlement rail

How an autonomous Argentine company (*sociedad-IA*) turns the dollars it earns
on-chain into pesos in its own bank account — governed (RFC-001) and audited.

> **The promise, in one line:** the agent receives a dollar stablecoin and ARS
> lands in its CBU/CVU. Everything below is how that happens, reliably.

## 1. Architecture — Polygon is the settlement hub

All value converges to **USDT on Polygon**, then off-ramps to ARS:

```
intake (any supported chain/asset)
        │
        ▼
  USDT on Polygon   ◄── the settlement hub
        │
        ▼
  Bitso: sell usdt_ars  →  withdraw ARS to the CVU/CBU (BIND / Coelsa)
        │
        ▼
  ARS in the society's bank account
```

Polygon is the hub because it is EVM, lowest-fee, **Bitso-native**, and the
dominant USDT chain in LatAm.

## 2. Off-ramp provider — Bitso (USDT → ARS)

`BitsoOffRampAdapter` (`@ar-agents/treasury`). Chosen as the spine because it is
**self-serve**: public HMAC-signed API, self-minted API keys, **no onboarding
gate** (unlike Manteca's sales gate or Mural's invite-only KYB). Flow:
market-sell `usdt_ars` → withdraw the realized ARS to the society's CBU/CVU over
the BIND/Coelsa rail. `MuralOffRampAdapter` (USDC-native), `MantecaOffRampAdapter`,
and `RipioOffRampAdapter` remain registered alternates.

### Why USDT, not USDC, at the off-ramp
Bitso has **no USDC book and does not custody USDC** (verified against the live
API, jun-2026). USDT is the de-facto dollar stablecoin in Argentina. So the hub
asset is **USDT**; any USDC intake is swapped to USDT on Polygon (§3).

## 3. Intake routes into the hub

| Intake | Route to the Polygon-USDT hub |
|---|---|
| **Polygon USDT** (native) | direct — zero hops |
| **Base USDC** (x402 rail-1 — the popular intake) | Circle **CCTP** (Base→Polygon, canonical burn-and-mint, no slippage, no third-party bridge) → USDC on Polygon → stable-stable swap **USDC→USDT** on a deep Polygon DEX → hub |
| Other EVM USDC | CCTP → Polygon → swap |

**Base stays a first-class intake.** It is the popular, x402/Coinbase-native,
Circle-home chain for USDC — so the agent can be paid there. It reaches the hub
via Circle's *own* cross-chain rail (**CCTP** — the institutional standard: burn
on Base, mint on Polygon, slippage-free, no lock-and-mint bridge risk), plus a
single stable-stable swap (the one place USDC becomes USDT). This is the
"Base + Polygon + Bitso" path, done with the most professional primitive
available rather than an ad-hoc bridge.

## 4. Idempotency & safety
- `convert()` moves real money — gate behind `requireConfirmation` (RFC-001) and
  write to the signed audit log.
- The Bitso ARS payout is idempotent via a deterministic `origin_id` derived from
  the caller's `externalId`; `convert()` looks the withdrawal up by `origin_id`
  first, so a retry never double-sells or double-pays.
- Use a Bitso (sub)account **dedicated** to the off-ramp, so the swept ARS equals
  this off-ramp's proceeds.

## 5. Going live (per provider)
1. Generate Bitso API keys with **trading + withdrawal** permission (keep the
   secret out of any shared context). Register the destination CBU/CVU as a Bitso
   beneficiary. Set `BITSO_API_KEY` / `BITSO_API_SECRET` (+ `cvu`, `recipientName`).
2. Fund the off-ramp account with USDT on Polygon (native intake, or via the
   CCTP+swap connector once built).
3. Validate against the live API: `scripts/bitso-offramp-check.mjs` proves auth +
   quote (read-only); then a tiny real `convert()` proves the sell + withdrawal.

## 6. Build order (status)
1. ✅ Off-ramp adapter — Bitso, Polygon USDT → ARS. Shipped `@ar-agents/treasury@0.3.0`; signing **auth-proven against the live api.bitso.com** (`apiPrefix=/v3`).
2. ⏳ Tiny-real money-proof — fund Polygon USDT → `convert()` → ARS to the CVU.
3. ◻ Direct Polygon-USDT intake.
4. ◻ Base-USDC intake via CCTP + Polygon swap (build when a Base-USDC payer exists — don't pay the cross-chain complexity before there's demand for it).

**Spine: USDT on Polygon. Base is a supported on-ramp via CCTP. Bitso is the fiat exit.**
