# @ar-agents/ap2

> **First faithful TypeScript implementation of the Agent Payments Protocol (AP2) v0.2.**
> Schemas, crypto, SD-JWT VC primitives, all 8 constraint evaluators, and signed
> Checkout/Payment receipts. Edge-Runtime-compatible. Aligned with the FIDO Alliance
> Agentic Auth Working Group reference Python SDK.

[![CI](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/ar-agents/ar-agents/actions)
[![npm](https://img.shields.io/npm/v/@ar-agents/ap2?label=%40ar-agents%2Fap2)](https://www.npmjs.com/package/@ar-agents/ap2)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-88%20passing-green)](#tests)

```bash
pnpm add @ar-agents/ap2 zod
```

## Why this exists

AP2 v0.2 (April 2026) is the agentic-payments protocol Google donated to the
FIDO Alliance. It binds an agent's payment action to a cryptographically
signed mandate carrying the user's intent — the missing trust layer for
ChatGPT Buy / Claude / Gemini / x402 / Visa-IC / Mastercard-Agent-Pay.

As of May 2026, **there is no production-grade TypeScript implementation
of AP2.** The community `agentic-payments` package fails the rainbow-table
defense rule (uses Ed25519 for `checkout_jwt` — explicitly forbidden by
spec). Google's reference implementation is Python-only.

This package fills that gap. It implements every primitive AP2 v0.2
defines, faithfully to spec.

## What's in scope (v0.1)

**Phase 2.1 — single-hop AP2.** Sufficient for direct flows where the
Trusted Surface signs both open and closed mandates (the most common
agent-direct-action case).

| Surface | Status |
|---|---|
| All four mandate types — Open + Closed × Checkout + Payment | ✅ Zod schemas, validated round-trip |
| All ten constraint types — `checkout.allowed_merchants`, `checkout.line_items`, `payment.amount_range`, `payment.allowed_payees`, `payment.allowed_payment_instruments`, `payment.allowed_pisps`, `payment.budget`, `payment.agent_recurrence`, `payment.execution_date`, `payment.reference` | ✅ Evaluators with max-flow for `line_items` |
| ES256 (P-256 ECDSA) sign/verify, jose-backed | ✅ |
| `checkout_jwt` rainbow-table defense (Ed25519 forbidden) | ✅ Throws at signing time |
| SD-JWT VC primitives — disclosures (RFC 9901), `_sd`, `sd_hash`, compact parser | ✅ Single-hop only |
| KB-JWT (Key Binding JWT) — build + verify (audience, nonce, sd_hash) | ✅ |
| Issuer factories for all 4 mandate types | ✅ |
| Verifier for all 4 mandate types + role-specific checks | ✅ |
| `CheckoutReceipt` + `PaymentReceipt` build + verify (plain JWT, signed by issuer) | ✅ |
| 88 tests across schemas, crypto, sd-jwt, constraints, end-to-end Direct flow | ✅ |

## Phase 2.2 — planned

- Multi-hop chain support (`~~`-separated), dSD-JWT delegation
  ([gco-delegate-sd-jwt](https://github.com/GarethCOliver/gco-delegate-sd-jwt))
- W3C DC-API binding for hardware-backed user signing (passkey-bound
  mandates per FIDO Alliance Agentic Auth WG profile)
- Stateful evaluator for `payment.budget` + `payment.agent_recurrence`
  (BudgetTracker default impl)
- Payment-instrument bindings — x402, PIX, SPEI, Transferencias 3.0,
  Mastercard / Visa agentic tokens

## Quickstart — full Direct flow

```ts
import {
  generateAp2KeyPair,
  signCheckoutJwt,
  computeCheckoutHash,
  issueOpenCheckoutMandate,
  issueClosedCheckoutMandate,
  issueOpenPaymentMandate,
  issueClosedPaymentMandate,
  verifyClosedCheckoutMandate,
  verifyOpenCheckoutMandate,
  verifyClosedPaymentMandate,
  verifyOpenPaymentMandate,
  buildCheckoutReceipt,
  buildPaymentReceipt,
  parseSdJwt,
  computeSdHash,
} from "@ar-agents/ap2";

// 1. Setup keys (per role).
const merchant = await generateAp2KeyPair("ES256");
const agent = await generateAp2KeyPair("ES256");
const mpp = await generateAp2KeyPair("ES256");

// 2. Merchant signs the inner checkout_jwt.
const checkoutJwt = await signCheckoutJwt(
  {
    order_id: "ord_1",
    merchant: { id: "merchant_1", name: "Demo" },
    line_items: [{
      id: "li_1",
      product: { id: "shoe_red", title: "Red Shoe", price: 199, currency: "USD" },
      quantity: 1,
    }],
    total_price: 199,
    currency: "USD",
  },
  merchant.privateKey,
);
const checkoutHash = await computeCheckoutHash(checkoutJwt);

// 3. Trusted Surface signs Open Checkout Mandate (intent constraints).
const openCheckoutPresentation = await issueOpenCheckoutMandate({
  mandate: {
    vct: "mandate.checkout.open.1",
    constraints: [
      { type: "checkout.allowed_merchants", allowed: [{ id: "merchant_1" }] },
      {
        type: "checkout.line_items",
        items: [{
          id: "c_shoes",
          acceptable_items: [{ id: "shoe_red" }, { id: "shoe_blue" }],
          quantity: 1,
        }],
      },
    ],
    cnf: { jwk: agent.publicJwk },
  },
  signingCtx: { privateKey: merchant.privateKey, alg: "ES256" },
});

// 4. Agent signs Closed Checkout Mandate carrying the merchant's checkout_jwt.
const closedCheckoutPresentation = await issueClosedCheckoutMandate({
  mandate: {
    vct: "mandate.checkout.1",
    checkout_jwt: checkoutJwt,
    checkout_hash: checkoutHash,
  },
  signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
});

// 5. Merchant verifies closed checkout + open constraints.
const closedVerify = await verifyClosedCheckoutMandate(
  closedCheckoutPresentation,
  { issuerKey: agent.publicJwk, checkoutJwtKey: merchant.publicJwk },
);
if (!closedVerify.ok) throw new Error(closedVerify.reason);

const openVerify = await verifyOpenCheckoutMandate(openCheckoutPresentation, {
  issuerKey: merchant.publicJwk,
  closedCheckout: closedVerify.mandate.checkout,
  closedMandate: closedVerify.mandate.closed,
});
if (!openVerify.ok) throw new Error(openVerify.reason);

// 6. Merchant issues CheckoutReceipt — `reference` = sd_hash of closed mandate.
const checkoutReceiptJwt = await buildCheckoutReceipt({
  receipt: {
    status: "Success",
    iss: "merchant_1",
    iat: Math.floor(Date.now() / 1000),
    reference: closedVerify.sdHash,
    order_id: "ord_1",
  },
  signingKey: merchant.privateKey,
});

// 7. Agent signs Open + Closed Payment Mandate. transaction_id = checkout_hash.
const openCheckoutParts = parseSdJwt(openCheckoutPresentation);
const openCheckoutDigest = await computeSdHash({
  issuerJwt: openCheckoutParts.issuerJwt,
  disclosures: openCheckoutParts.disclosures,
});
const openPaymentPresentation = await issueOpenPaymentMandate({
  mandate: {
    vct: "mandate.payment.open.1",
    constraints: [
      { type: "payment.reference", conditional_transaction_id: openCheckoutDigest },
      { type: "payment.amount_range", currency: "USD", max: 50000 },
      { type: "payment.allowed_payees", allowed: [{ id: "merchant_1" }] },
    ],
    cnf: { jwk: agent.publicJwk },
  },
  signingCtx: { privateKey: merchant.privateKey, alg: "ES256" },
});
const closedPaymentPresentation = await issueClosedPaymentMandate({
  mandate: {
    vct: "mandate.payment.1",
    transaction_id: checkoutHash,
    payee: { id: "merchant_1" },
    payment_amount: { amount: 19900, currency: "USD" },
    payment_instrument: { id: "card_x", type: "card" },
  },
  signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
});

// 8. Credential Provider verifies + emits PaymentReceipt.
const closedPaymentVerify = await verifyClosedPaymentMandate(
  closedPaymentPresentation,
  { issuerKey: agent.publicJwk, expectedTransactionId: checkoutHash },
);
if (!closedPaymentVerify.ok) throw new Error(closedPaymentVerify.reason);

const openPaymentVerify = await verifyOpenPaymentMandate(openPaymentPresentation, {
  issuerKey: merchant.publicJwk,
  closedMandate: closedPaymentVerify.mandate.closed,
  linkedCheckoutMandateDigest: openCheckoutDigest,
});
if (!openPaymentVerify.ok) throw new Error(openPaymentVerify.reason);

const paymentReceiptJwt = await buildPaymentReceipt({
  receipt: {
    status: "Success",
    iss: "mpp.acme",
    iat: Math.floor(Date.now() / 1000),
    reference: closedPaymentVerify.mandate.sdHash,
    payment_id: "PAY-001",
  },
  signingKey: mpp.privateKey,
});
```

## Spec deviations + things to know

- **The inner `checkout_jwt` MUST use ECDSA.** Per spec §A.1 + the
  rainbow-table attack section in `security_and_privacy_considerations.md`,
  Ed25519 is forbidden because deterministic signatures leak no entropy
  to defeat preimage attacks against `checkout_hash`. We enforce this in
  `signCheckoutJwt` — passing `alg: "EdDSA"` throws `CheckoutJwtAlgError`.

- **Single-hop only in v0.1.** Multi-hop chains (`~~`-separated, with
  per-hop `cnf.jwk` PoP binding for delegated SD-JWT presentations) ship
  in Phase 2.2. The single-hop case covers Direct flows where the Trusted
  Surface holds both signing keys (the most common agent-direct-action
  shape today). For Trusted Agent Provider models with delegated chains,
  wait for Phase 2.2 or open an issue.

- **Currency is ISO 4217 alpha-3.** AP2 examples use uppercase ("USD",
  "ARS"); we accept both upper and lowercase on parse. CLP / PYG / JPY /
  KRW are 0-decimal — use `divisorFor(currency)` to convert major-unit
  values correctly.

- **`payment.budget` + `payment.agent_recurrence` are stateful.** They
  require a `BudgetTracker` that knows how much has been spent against
  the same Open Payment Mandate. Phase 2.1 ships an interface; the
  default in-memory tracker lands in Phase 2.2. In the meantime, these
  constraints PASS-THROUGH when no tracker is wired (loud warning in
  production code is your responsibility).

- **The receipt `reference` is the sd_hash of the closed mandate**, NOT
  the closed mandate's payload-side claim. The verifier returns `sdHash`
  on a successful `VerificationOutcome` — pass that into your
  `buildCheckoutReceipt` / `buildPaymentReceipt` call.

## How it fits with the rest of `@ar-agents/*`

| Package | What it does | AP2 role |
|---|---|---|
| `@ar-agents/agentic-commerce-bridge` | ACP merchant facilitator (5 endpoints + signed webhooks + idempotency) for MercadoPago/MercadoLibre | Optional Phase 2 layer: receive AP2 mandates as `payment_data.instrument.credential` |
| `@ar-agents/mercadopago` | MP Subscriptions / Payments / Checkout Pro toolkit | Where the receipt-issuing MPP lives |
| `@ar-agents/identity` | CUIT + ARCA padrón | Buyer-fiscal context for Argentine AP2 receipts |
| `@ar-agents/facturacion` | AFIP/ARCA Factura A/B/C/E (WSFE) | Fiscal receipts on top of AP2 receipts |

## Tests

```bash
pnpm test            # 88 tests across all surfaces
pnpm test:coverage   # full coverage report
pnpm typecheck       # strict TS, no `any`, exactOptionalPropertyTypes
```

## License

MIT, same as `@ar-agents/*`. Built by Naza Clemente / Hello Astro.

## Spec sources

- AP2 spec — [github.com/google-agentic-commerce/AP2](https://github.com/google-agentic-commerce/AP2)
- AP2 docs — [ap2-protocol.org](https://ap2-protocol.org/specification/)
- RFC 9901 (SD-JWT) — [datatracker.ietf.org/doc/rfc9901](https://datatracker.ietf.org/doc/rfc9901/)
- RFC 7800 (Proof-of-Possession Key) — [datatracker.ietf.org/doc/html/rfc7800](https://datatracker.ietf.org/doc/html/rfc7800)
- FIDO Alliance Agentic Auth WG — [fidoalliance.org](https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/)
