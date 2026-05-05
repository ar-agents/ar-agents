# Changelog

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
