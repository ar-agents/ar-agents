# Changelog

## 0.4.0

### Minor Changes

- v0.4.0 — full toolkit: Subscription Plans + Stores/POS + Disputes + Subscription Payment History + Lookup helpers + Webhooks management

  **41 tools total** (was 24 in v0.3). Adds 17 new tools covering the rest of the agent-relevant MP API surface.

  # New: Subscription Plans (5 tools)

  For SaaS-style billing where you have fixed tiers (Básico/Pro/Enterprise), use plans instead of per-customer preapprovals.

  - `create_subscription_plan` — define reusable plan (price + frequency + optional free trial)
  - `list_subscription_plans` — list all plans
  - `update_subscription_plan` — change reason / amount / status / back_url (existing subs keep old amount)
  - `subscribe_to_plan` — enroll a customer in a plan; returns init_point URL
  - `list_subscription_payments` — auto-charge attempts (authorized_payments) under a preapproval. Useful for "show me cobros del último mes for this client" or to debug failing recurring charges.

  # New: Stores + POS management (4 tools)

  Self-serve setup for in-store QR payments. Eliminates the previous one-time MP dashboard step.

  - `create_store` — create a store under the seller
  - `list_stores` — list configured stores
  - `create_pos` — create a POS under a store (the `external_id` is what `create_qr_payment` uses)
  - `list_pos` — list POSes (optionally filtered by store_id)

  # New: Disputes / Chargebacks (2 tools, read-only)

  - `list_payment_disputes` — list disputes raised against a payment (surfaces `dashboard_url`)
  - `get_dispute` — full dispute details (reason, amount, resolution status)

  Resolution remains dashboard-only; the lib surfaces the right URL.

  # New: Lookup helpers (2 tools)

  - `list_identification_types` — AR returns DNI/CI/LE/LC/Otro/Pasaporte/CUIT/CUIL with min/max length
  - `list_issuers` — banks issuing a card type. Pass `bin` (first 6-8 digits) for precise issuer detection — needed for issuer-specific cuotas promos like Naranja Galicia 6 cuotas sin interés

  # New: Webhooks management (4 tools)

  Programmatically configure webhook subscriptions instead of clicking around the MP dashboard.

  - `list_webhooks` — see what's configured
  - `create_webhook` — subscribe a URL to a topic (`payment`, `subscription_authorized_payment`, `merchant_order`, `point_integration_wh`, etc.)
  - `update_webhook` — change URL or topic
  - `delete_webhook` — unsubscribe

  # Quality

  - 81/81 tests pass (was 61 in v0.3) — added 20 tests for v0.4 endpoints
  - 21.72 KB ESM brotli'd (under 32 KB budget)
  - publint + arethetypeswrong all 🟢
  - Type-safe end-to-end; new types: SubscriptionPlan, Store, Pos, Dispute, IdentificationType, Issuer, WebhookConfig, SubscriptionPayment

  # Cumulative tool inventory (41 total)

  - Subscriptions: 5 (create, get, cancel, pause, resume)
  - Subscription Plans: 5 (create, list, update, subscribe, list_payments)
  - Payments: 5 (create, get, search, cancel, capture)
  - Refunds: 2 (create, list)
  - Checkout Pro: 2 (create_preference, get_preference)
  - Customers + Cards: 4 (create, find, list_cards, delete_card)
  - Saved-card charging: 1 (charge_saved_card)
  - Methods + Installments: 2 (list_methods, calculate_installments)
  - Account: 1 (get_account_info)
  - QR + POS: 6 (create_qr, cancel_qr, create_store, list_stores, create_pos, list_pos)
  - Disputes: 2 (list, get)
  - Lookup: 2 (identification_types, issuers)
  - Webhooks: 4 (list, create, update, delete)

## 0.3.0

### Minor Changes

- Robustness pass + 5 new features across both packages.

  # `@ar-agents/mercadopago@0.3.0`

  **Robustness (Section 6 of v0.3 spec)**

  - Per-request timeout via `AbortSignal` (default 30s, configurable via `requestTimeoutMs`).
  - Auto-retry on 5xx + 429 with exponential backoff (default 1 retry, configurable via `maxRetries`). Honors `Retry-After` header on rate-limit. **Never retries on 4xx** (deterministic user/config errors).
  - New typed errors: `MercadoPagoTimeoutError`, `MercadoPagoOverloadedError` (HTML 503 detection — when MP returns HTML instead of JSON).
  - `onCall` observability hook fires after every request with `{ method, path, durationMs, httpStatus, retried, success }`. Wire into OpenTelemetry / Sentry / Axiom without forking the lib.
  - **Deterministic idempotency keys** — `create_payment` and `refund_payment` now use `sha256(meaningful_fields)` instead of `Date.now()`. Retries dedupe correctly on MP's side.

  **New tools (3)**

  - **`charge_saved_card`** — server-side retokenize + charge for returning customers. Requires CVV (AR MP doesn't support CVV-less via public API). Idempotent on (card_id, amount, external_reference).
  - **`create_qr_payment`** — dynamic in-store QR via MP Point. Returns raw `qr_data` (EMVCo) + ready-to-display base64 PNG `qr_data_url`. Compatible with all AR wallets (Modo, BNA+, Cuenta DNI, Naranja X) via Transferencias 3.0 interop.
  - **`cancel_qr_payment`** — clear a pending QR order on a POS so the next `create_qr_payment` doesn't 409.

  **Total tool count: 24** (was 21 in v0.2). Added `qrcode` as runtime dep for in-store flow.

  # `@ar-agents/identity-attest@0.2.0`

  **3 new adapters bringing total to 5**

  - **`Auth0Adapter`** (trust 0.7, or 0.85 with MFA) — OAuth2 Authorization Code flow with PKCE. Server-side `id_token` verification via `jose` JWKS. Optional MFA step-up via `acr_values` — when MFA is completed, `effective_trust_level` bumps to 0.85.
  - **`MagicLinkSdkAdapter`** (trust 0.7) — Magic.link DIDToken validation via `@magic-sdk/admin` (optional peer dep). Lazy-loaded so users without Magic don't pay cold-start cost. Returns DID + email/phone/wallet claims.
  - **`MercadoPagoIdentityAdapter`** (trust 0.5) — partial KYC via $1 micro-charge. MP doesn't expose a public KYC API, so we use payment-payer attestation: a successful payment proves MP validated the buyer's CUIT/DNI against their internal database. Auto-refunds the $1 by default. Returns `identification_type` + `identification_number` + email + name claims.

  **New client methods**

  - `submitOauthCode(requestId, code)` — for OAuth callbacks (Auth0)
  - `submitMagicDidToken(requestId, didToken)` — for Magic.link
  - `submitMercadoPagoPaymentId(requestId, paymentId)` — for MP webhook callbacks

  **Quality**

  - 28/28 tests pass (was 15 in v0.1)
  - 12.93 KB ESM brotli'd (jose is treeshakeable; was 4.44 KB without OAuth adapter)
  - publint + arethetypeswrong all 🟢
  - `jose` is a dep (used by Auth0Adapter); `@magic-sdk/admin` is optional peer dep

  **Trust levels reference (current)**

  - 0.3 — `WhatsAppOtpAdapter` (phone-owned)
  - 0.5 — `EmailMagicLinkAdapter` (email-owned), `MercadoPagoIdentityAdapter` (partial KYC)
  - 0.7 — `Auth0Adapter` (federated identity), `MagicLinkSdkAdapter` (Magic-managed)
  - 0.85 — `Auth0Adapter` with MFA enforcement
  - 0.95 — gov-verified (planned, blocked on AR SID rollout)

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
