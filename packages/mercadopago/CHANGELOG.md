# Changelog

## 0.2.0

### Minor Changes

- v0.2.0 — full Payments surface (the "Stripe Agent Toolkit" for Mercado Pago)

  Extends from Subscriptions-only (v0.1, 5 tools) to the complete agent toolkit (21 tools). New surface:

  **Payments (5 tools)**: `create_payment`, `get_payment`, `search_payments`, `cancel_payment`, `capture_payment`. Supports both transparent flow (with card_token) and server-side flow (account_money / Rapipago / Pago Fácil). Auto-generates idempotency keys (mandatory since 2023).

  **Refunds (2 tools)**: `refund_payment` (full or partial), `list_refunds`. Auto-idempotent on (payment_id, amount).

  **Checkout Pro (2 tools)**: `create_payment_preference` (THE recommended "agent takes a payment" tool — returns hosted URL, no PCI scope needed), `get_payment_preference`. Configurable max installments, excluded payment types, statement descriptor (13-char AR limit), expiration.

  **Customers + Cards (4 tools)**: `create_customer` (idempotent on email), `find_customer_by_email`, `list_customer_cards`, `delete_customer_card`. Foundation for saved-card flows.

  **Payment Methods + Installments (2 tools)**: `list_payment_methods` (lists AR methods: visa, master, naranja, naranja_x, cabal, account_money, rapipago, etc.), `calculate_installments` (THE killer AR feature — returns `recommended_message` strings in compliant Argentine format, includes Cuotas Simples gov program + issuer-specific promos via BIN).

  **Account (1 tool)**: `get_account_info` (site_id, country, user_type).

  **v0.1 Subscriptions (5 tools)**: kept identical for backward compatibility.

  # Live-tested

  Verified end-to-end against MP sandbox: account info, payment methods (21 AR methods returned), installments (81 visa offers with proper `recommended_message`), preference creation (returns real init_point + sandbox_init_point URLs).

  # Documentation

  - AGENTS.md updated with decision tree, status_detail recovery actions (top 12 values), AR-specific gotchas (statement_descriptor 13-char limit, sandbox cardholder name selects outcome, test cards reference, account_money instant settlement vs T+14 card hold, etc.).
  - tools.manifest.json updated to v0.2 with all 21 tools documented (purity, sideEffects, latency, input/output schemas, whenToUse, whenNotToUse).

  # Bundle size

  8.07 KB ESM brotli'd (under 22 KB budget). Doubled tool count, still half the size limit.

  # What's NOT in v0.2 (deferred to v0.3+)

  - `charge_saved_card` (retokenize + charge in one call) — coming v0.3
  - `create_qr_payment` (in-store dynamic QR) — coming v0.3
  - Marketplace splits (OAuth, application_fee) — v0.4
  - Raw-PAN tokenization — never (PCI scope; agents must use Checkout Pro)
  - Webhook x-signature verification for `payment` topic (v0.1 covers `preapproval`) — v0.3

All notable changes to `@ar-agents/mercadopago` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/) and the project adheres
to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-05-05

Initial release. Extracted from the `ar-agents-mp-hello` proof-of-concept.

### Added

- `MercadoPagoClient` — typed wrapper around MP REST API for preapprovals
  (create / get / cancel / pause / resume).
- `mercadoPagoTools()` — drop-in tool collection for the Vercel AI SDK 6+.
  Five tools: `create_subscription`, `get_subscription_status`,
  `cancel_subscription`, `pause_subscription`, `resume_subscription`.
- `SubscriptionStateAdapter` interface for pluggable persistence + an
  `InMemoryStateAdapter` reference implementation.
- `parseWebhookEvent()` — normalize MP webhook payloads regardless of whether
  topic + id arrive in query string or body.
- `verifyWebhookSignature()` — HMAC-SHA256 verification of MP `x-signature`
  header with constant-time comparison.
- Eight specific error classes: `MercadoPagoAuthError`,
  `MercadoPagoBackUrlInvalidError`, `MercadoPagoSelfPaymentError`,
  `MercadoPagoAccountTypeMismatchError`, `MercadoPagoPaymentRejectedError`,
  `MercadoPagoAuthorizeForbiddenError`, `MercadoPagoRateLimitError`, plus the
  base `MercadoPagoError`. `classifyError()` routes raw MP responses to the
  best-fit class.

### Known limitations

- Subscriptions API only. No one-off Checkout, no Marketplace, no Pix.
- AR (MLA) verified end-to-end. Other LATAM sites should work but aren't
  exercised by the test suite.
- Webhook signature verification implemented but not fully validated against a
  live MP webhook — the `x-signature` manifest format may evolve and is based
  on documented behavior as of 2026-05.
- AFIP factura emission is out of scope; consume `external_reference` to map
  payments to your own invoicing pipeline.
