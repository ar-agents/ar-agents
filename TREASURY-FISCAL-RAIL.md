# Treasury & Fiscal Rail — the moat half of the bridge

> Design doc. Author: Claude session, 2026-06-24, for Naza. Grounded in verified jun-2026 facts (sources at the end). Status: DESIGN, no code yet. The one gating unknown is flagged in §5.

## 1. The question this answers (Naza, 2026-06-24)

A Sociedad Automatizada earns in crypto (USDC on Base). **How does it get Argentine pesos to pay its taxes?** That loop, crypto revenue → pesos → AFIP, is the answer, and it is the **moat**: a US agent with a US bank account (e.g. Clanker) does NOT solve Argentine fiscal compliance. Nobody is building "autonomous agent = compliant Argentine taxpayer with a crypto treasury." This is pure "own the meaning": the AR-specific complexity (AFIP + crypto regulation + FX) is the moat, not something to overcome. It is a blue ocean to capture whole.

## 2. The full bridge = 3 rails

1. **Intake** — x402/Base, USDC in. *Rent the mechanism.* Table stakes (others have crypto rails).
2. **Off-ramp** — USDC(Base) → ARS, via a registered PSAV.
3. **Treasury + fiscal** — a peso account, a tax buffer, paying AFIP, invoicing, withholdings. **THE MOAT.**

`chat-eve.md` called x402/Base "the #1 gap"; that is only rail 1. This doc designs rails **2 + 3**, the half that makes the jurisdiction real.

**STATUS (2026-06-24): all three rails BUILT + unit-tested.** Rail 1 = `@ar-agents/x402@0.1.0` (x402 HTTP-402 intake on Base: local EIP-712/EIP-3009 verify + facilitator settle, 22 tests). Rails 2 + 3 = `@ar-agents/treasury@0.2.0` (Manteca **and** Ripio off-ramp adapters + AFIP fiscal layer + 8 AI SDK tools + a full-bridge integration test, 67 tests). All wired into the generated society (`treasury` + `x402` piezas). The only thing left is LIVE runs against real PSAV / facilitator accounts, which are sales-gated (Naza's action).

## 3. Verified facts (jun-2026)

**Off-ramp (crypto→ARS):** Lemon, Buenbit, Belo, Ripio, Fiwind sell crypto for ARS and withdraw to a bank/CVU in 24-48h. **Fiwind supports USDC on Base** and issues a CVU (instant ARS in/out to any bank/wallet). These are consumer apps; **programmatic B2B API availability is the open question (§5).**

**AFIP / paying taxes:** AFIP has a VEP web service (`WSCREATEVEP`, SETI/SOAP) **but it is enabled only for public organisms** → NOT a path for a private society. A VEP is payable via MercadoPago / E-Pagos / "Pagar" / banks and expires 30 days. → The automatable paths are **(a) monotributo via débito automático** from the society's CVU/CBU (cleanest, fully hands-off) and **(b) paying an existing VEP via MercadoPago** (MP has APIs). NOT `WSCREATEVEP`.

**Regulation (CNV RG 1058/2025, PSAV):** virtual-asset service providers must be registered PSAVs; unregistered ones are judicially blockable; obligations include monthly client/volume reporting, annual audit, AML, a compliance officer. Deadlines already passed in 2025. → **Design decision: integrate a registered PSAV as the off-ramp, do NOT become one** (the compliance is heavy; orchestrate on top of a registered provider).

**Tax treatment:** selling/exchanging/earning crypto = hecho imponible; Impuesto a las Ganancias is cedular: **5%** (sold in ARS, no adjustment clause) or **15%** (foreign currency) on the **gain**. **Crypto is IVA-exempt** (digital intangible). Holding + transfers between own wallets = not taxable. CABA now charges IIBB only on the spread. Monotributo is available for small earners.

## 4. Design decisions

1. **Integrate a registered PSAV (start: Fiwind, USDC-on-Base + CVU); never become a PSAV.** Abstract behind an `OffRampAdapter` so Belo/Lemon/Ripio can be added as config.
2. **Treasury = a peso account (CVU)** tied to the society's CUIT (from the PSAV or MercadoPago).
3. **Tax-payment automation v1 = monotributo via débito automático** (fully automatable, hands-off). v2 = pay general-regime VEPs via MercadoPago. Avoid `WSCREATEVEP` (gov-only).
4. **The rail does the tax accounting:** cedular 5/15% on each conversion gain; income via monotributo or Ganancias on services; crypto IVA-exempt; IIBB per jurisdiction. It keeps an ARS **tax buffer** sized to upcoming obligations.
5. **Every irreversible money move (convert, withdraw, pay) goes through `requireConfirmation` (RFC-001) and the signed audit log.** The treasury is autonomous but supervised.

## 5. The gating unknown — RESOLVED (2026-06-24)

**Does any registered AR PSAV expose a programmatic B2B API for off-ramp + CVU? YES.** **Manteca** (manteca.dev, docs.manteca.dev) offers **API Cripto + API Rampa**: programmatic USDC/USDT to ARS on/off-ramp with payout to a CVU, regulated, **zero integration cost** (revenue via shared commission), integrable in under 3 weeks. **Ripio B2B** ("Crypto as a Service", a registered PSAV, sandbox-documented) is the alternative. So the `OffRampAdapter` targets **Manteca first**.

**SHIPPED (2026-06-24), `@ar-agents/treasury@0.2.0`, 52 tests:** the pure-logic core + the **real `MantecaOffRampAdapter`** (a thin client over Manteca's documented v2 API — `GET /v2/prices/direct/{ticker}`, `POST /v2/synthetics/ramp-off`, `GET /v2/synthetics/{id}`, `add-bank-account`, `md-api-key` auth, idempotent on `externalId`) + the **AFIP fiscal layer** (2026 monotributo table + the honest settlement model) + **8 Vercel AI SDK tools** (`@ar-agents/treasury/tools`), **wired into the generated society** (the `treasury` pieza → `MANTECA_*` env → `getOffRamp()`). The Manteca **request contract is pinned + unit-tested against mocked HTTP**; live integration is pending a Manteca business account (onboarding is sales-gated, no self-serve keys). **Next:** the Ripio B2B adapter (same interface) + x402/Base intake (rail 1).

Original framing (kept for context):

**Does any registered AR PSAV expose a programmatic B2B API for off-ramp + CVU?** (Fiwind/Belo/Ripio are consumer apps; we need their developer/B2B docs or a partnership.) Everything downstream depends on this:
- If YES (a PSAV has an off-ramp API): build the `OffRampAdapter` against it. Clean.
- If NO public API: v1 is a **partnership / semi-automated** path (the society holds a CVU at the PSAV; conversion is triggered via whatever interface exists; we automate everything around it). Still shippable, but the architecture differs.

Secondary unknowns: can monotributo débito automático be enrolled/paid programmatically; can MercadoPago pay an AFIP VEP via its API; the exact monotributo/cedular thresholds at a society's scale.

## 6. What we have vs. what to build

**Have (ar-agents packages):** `identity` (CUIT/AFIP padrón), `banking` (CBU/CVU validate + BCRA), `facturacion` (AFIP WSFE), `mercadopago`, `iibb`, `sicore`.

**Build:**
- **`@ar-agents/offramp`** — `OffRampAdapter` interface (quote, convert USDC→ARS, withdraw to CVU, status) + the first registered-PSAV implementation. Settlement-chain-abstracted (Base first).
- **AFIP payment automation** — monotributo débito-automático enrolment + VEP-via-MercadoPago payment.
- **`@ar-agents/treasury`** — the orchestration: a pure-logic core (balances crypto+ARS, tax-buffer sizing, conversion policy, payment scheduling) that is unit-testable, plus the adapters above. This is the brain that answers "keep enough pesos to pay AFIP, convert just-in-time, log everything."

## 7. Build sequence

1. ✅ **Verify §5** (the off-ramp B2B API question). Resolved: Manteca primary, Ripio second.
2. ✅ `@ar-agents/treasury` **pure-logic core** (balances, tax buffer, conversion policy) + tests.
3. ✅ `OffRampAdapter` + **Manteca impl** (`MantecaOffRampAdapter`) + the `getStatus` async-settlement extension.
4. ✅ AFIP layer — but the **honest** version: no fully-autonomous payment exists (WSCREATEVEP gov-only; débito automático can't be enrolled by API; no MP-pay-VEP API). So it **computes the obligation + funds the buffer + emits the settlement instruction** (`settlementPlan`, `canAutoExecute: false`). It does not pretend to pay AFIP.
5. ✅ Wire into the generated society: the `treasury` pieza (8 tools) + `MANTECA_*` env + `getOffRamp()` in the starter; a `treasury` skill playbook. (A charter clause declaring the fiscal posture is the small remaining polish.)
6. ✅ **Ripio B2B adapter** (`RipioOffRampAdapter`, same `OffRampAdapter` interface — provider-optionality, no single-PSAV lock-in).
7. ✅ **x402/Base intake** (`@ar-agents/x402`, rail 1) + ✅ full-bridge integration test (x402 → treasury → AFIP composed end-to-end) + ✅ wired into the society (`x402` pieza + starter `/api/x402` route + charter fiscal clause).
8. ⏭️ **Remaining:** LIVE integration tests once a Manteca / Ripio business account + (for mainnet) a CDP facilitator key exist. All sales-gated — Naza's action. Everything controllable in code is done.

## 8. Why this is the right "build big" bet

Naza's stance (2026-06-24): do not be timid about building big for fear of being copied. This rail qualifies twice over: it is the **blue ocean** (no one builds AR fiscal compliance for autonomous agents) AND it is **naturally un-copyable** (no foreign lab will do AFIP + PSAV + cedular). Building it IS the strategy.

## Sources (jun-2026, verify before relying)
- Off-ramps: copytradeinsider, comparalatam, iProUP "6 mejores exchanges", Fiwind.io (USDC on Base + CVU).
- AFIP VEP: argentina.gob.ar "Obtener VEP", afip.gob.ar `WSCREATEVEP` developer manual ("enabled only for public organisms"), AFIP "pagar VEP por Mercado Pago".
- PSAV: CNV RG 1058/2025 (Boletín Oficial 14-mar-2025), argentina.gob.ar CNV PSAV registry, Beccar Varela / Allende & Brea / O'Farrell analyses.
- Tax: ARCA "Impuesto a las Ganancias - Criptoactivos", MEXC/Firmaway/TributoSimple guides, Infobae (CABA IIBB on spread, abr-2026), La Nación (abr-2026).
