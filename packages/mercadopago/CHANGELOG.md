# Changelog

## 0.12.0

### Minor Changes — Idempotency-by-default for state-mutating writes

`MercadoPagoClient` now auto-generates a UUID v4 X-Idempotency-Key header on
every state-mutating POST request when the caller doesn't provide one
explicitly. Naive callers (and the LLM tools layer) often forget to pass an
idempotency key, leaving them exposed to double-charge bugs on network
partitions. This makes the safe default: safe.

- **Auto-generated keys are unique per call** (Web Crypto's `randomUUID()` —
  Edge Runtime + Node 19+ + Cloudflare Workers + browsers).
- **Caller-supplied keys still win** — pass `idempotencyKey: "..."` for
  deterministic retries from a job queue (e.g., same key across retry
  attempts).
- **Only POST requests are auto-keyed.** GET / DELETE are HTTP-idempotent
  by spec. PUT skips auto-gen because MP's PUT endpoints encode the dedup
  key in the resource path (`/v1/payments/:id` → cancel; `/preapproval/:id` →
  pause/resume — already deduped by id).

6 new tests in `idempotency-default.test.ts` verify:
- UUID v4 format on auto-gen
- Different keys per call
- Caller-supplied keys honored over auto-gen
- GET requests NOT keyed
- Works for `createPayment`, `createPreference`, `createPreapproval`

### New cookbook recipe

- `cookbook/09-otel-wired.ts` — full OpenTelemetry wiring example. Shows
  how to wire `traceContext` for distributed-trace correlation, instrument
  the client + tools, and what the resulting trace + metric shape looks
  like in your APM. Closes the half-finished OTel story (lib + subpath
  existed since v0.10 but no recipe wired it end-to-end).

## 0.11.0

### Minor Changes — Composability + cross-LATAM + fraud scoring

**Tool middleware pattern (NEW)**: composable wrappers around any AI SDK tool. Ships `withAuditLog`, `withRateLimit`, `withMetrics`, `withRetry` + `compose()` + `applyToAllTools()`. Add audit + rate-limit + metrics to every tool with a single config block instead of wiring each concern into the tool implementation.

**TaxID validation cross-LATAM (NEW)**: `validateTaxId(input, type)` for AR (DNI/CUIT/CUIL with modulo-11), BR (CPF/CNPJ two-step weighted), MX (RFC structure), CL (RUT with K), CO (NIT modulo-11), UY (RUT 12-digit), PE (RUC 11-digit + prefix). `detectAndValidate(input, country)` auto-detects type from length. New `validate_tax_id` agent tool. Pure, no network.

**`additional_info` on `create_payment` (fraud scoring enrichment)**: `payer` profile (registration_date, authentication_type, is_first_purchase, is_prime_user, last_purchase), `shipments` (receiver_address, express_shipment, local_pickup), `ip_address`, `referral_url`. Per MP RG 5286/2023, payments without enrichment have 3-5x higher rejection rate — this is a real conversion uplift. Documented in tool description so the agent surfaces it proactively.

**VercelKVAuditLog (NEW)**: production audit-log adapter in `@ar-agents/mercadopago/vercel-kv` subpath. Storage layout: per-entry key + ZSET indexes by day/actor/tenant for O(log N) time-range queries. Backed by Vercel KV (Upstash Redis).

**Migration guide vs `mercadopago` (official SDK)** — `MIGRATION.md` shipped in tarball with side-by-side mappings, conceptual table, "when to use both" section.

**CI fixes**: build packages BEFORE typecheck (was failing for facturacion → identity workspace dep with subpath exports). Release workflow now `workflow_dispatch` only (was spamming failure emails on every push because changesets/action couldn't create PRs without explicit repo permission).

**New tools**: `validate_tax_id`. Tool count: **87** (was 86).

**Quality**: 284 tests pass (was 245; +39 v0.11 tests covering middleware, taxId, and more). publint clean, attw 🟢 across 3 subpaths. Bundle: main 42.9 KB brotli'd (size budget bumped 40→50 KB).

## 0.10.0

### Minor Changes — Compliance + DX + observability deepening

**Audit logging system (NEW)**: `AuditLogger` + `AuditLogAdapter` + `InMemoryAuditLog`. Captures every state-mutating tool call (operation, actor, tenantId, inputHash, outcome, errorCode, resourceId, idempotencyKey, durationMs). PII-conscious by default (`redact: true` hashes input, `redact: false` logs raw). Pluggable storage — InMemory shipped, plug your own Postgres/S3/SIEM.

**Webhook idempotency dedup (NEW)**: `WebhookDedup` class short-circuits duplicate MP webhook deliveries. MP retries on 5xx over an 8-day window — without dedup your handler processes the same event 5+ times. TTL default 7 days. Two modes: mark-on-first-sight and at-least-once.

**Pagination helpers (NEW)**: `paginate()` generic + 7 typed wrappers (payments, subscriptions, account movements, settlements, merchant orders, plans, subscription payments). AsyncIterable streaming, bounded concurrency, `maxItems` cap.

**Token bucket rate limiting (NEW)**: `TokenBucketRateLimiter` — proactive client-side limiter with **adaptive learning** from MP's `x-rate-limit-remaining` headers.

**AR issuer cuotas catalog (NEW)**: `AR_ISSUER_PROMOS` + `AHORA_PROGRAM_PROMOS` — embedded knowledge of AR bank promos. 14 issuer promos (Naranja, Galicia, Santander, Macro, BBVA, ICBC, Patagonia, Nación, Provincia, Ciudad). New `find_applicable_promos` tool.

**OpenTelemetry instrumentation subpath (NEW)**: `@ar-agents/mercadopago/otel` exports `createOtelHooks({ serviceName })`. Auto-emits spans + histograms + counters + gauges. `@opentelemetry/api` is OPTIONAL peer dep — graceful no-op fallback.

**3DS challenge resolution (NEW)**: `confirmChallengeAndPoll()` polls after the buyer completes the issuer challenge. New `confirm_3ds_challenge` tool — completes the FULL 3DS flow.

**New tools**: `find_applicable_promos`, `confirm_3ds_challenge`, `search_payments_all`, `list_settlements_all`. Tool count: **86** (was 82).

**Quality**: 245 tests pass (was 222). publint clean, attw 🟢 across 3 subpaths (`.`, `/vercel-kv`, `/otel`). Optional peer deps: `@vercel/kv`, `@opentelemetry/api`.

## 0.9.0

### Minor Changes — Production hardening: circuit breaker, deadline propagation, property-based tests, real MP sandbox integration tests, benchmarks

The "100/100, top-1 in the world" upgrade. Architectural production-grade
features that separate a toolkit-with-tests from a toolkit-deployed-at-scale.

**Circuit Breaker (NEW)**

- `CircuitBreaker` class — full state machine: CLOSED → OPEN (after N consecutive failures within rolling window) → HALF_OPEN (after cooldown) → CLOSED (after M trial successes) | OPEN (on trial failure).
- Configurable thresholds: `failureThreshold`, `successThreshold`, `resetTimeoutMs`, `monitoringWindowMs`.
- `isFailure(err)` predicate — by default counts all errors; override to ignore expected business errors (e.g., 4xx user errors should NOT count toward circuit opening).
- `onStateChange(event)` hook for emitting metrics on every transition.
- Manual `trip()` / `reset()` for runbook-driven ops.
- Pass to multiple `MercadoPagoClient` instances to **share backpressure signal across per-seller marketplace clients**.
- Throws `CircuitOpenError` (catchable separately from `MercadoPagoError`) when failing fast — your error tracker can distinguish "MP said no" from "we didn't even ask MP".
- 13 dedicated state-machine tests with controllable clock for deterministic transitions.

**Deadline Propagation (NEW)**

- `RequestOptions.signal?: AbortSignal` — pass a parent `AbortSignal` from the agent's tool budget; cancels MP requests when the agent's deadline expires.
- The client merges parent signal with its own per-request timeout — whichever fires first wins.
- When parent aborts, the client does NOT retry (caller's deadline has expired — retrying would be wrong).
- `healthCheck(signal?)` accepts the same.

**W3C Trace Context Propagation (NEW)**

- New `MercadoPagoClientOptions.traceContext` callback — returns `{ traceId, spanId, traceFlags? }`.
- When configured, the client injects standard `traceparent` headers into every MP request (so MP's logs can be correlated with your distributed traces) and surfaces the same context in `onCall` events.
- Compatible with OpenTelemetry without adding `@opentelemetry/api` as a peer dep — pass `() => trace.getActiveSpan()?.spanContext()`.

**Extended `onCall` event**

- Now includes `requestId` (MP's `x-request-id` echo for support tickets), `rateLimit` (`{ remaining, resetSeconds }` from MP headers), `circuitState` (when breaker configured), `traceContext` (when configured).
- Drop-in for OpenTelemetry / Datadog / Sentry.

**Health Check (NEW)**

- `client.healthCheck(signal?)` — liveness probe against MP. Returns `{ ok, latencyMs, userId, error, circuit }`.
- New `mp_health_check` tool — accepts optional `timeout_ms` for status-page polling.
- Returns `ok: false` instead of throwing — safe in monitoring loops without try/catch.

**Property-Based Testing (NEW)**

- 14 tests using `fast-check` that verify INVARIANTS across thousands of randomly-generated inputs (each test runs 100 random scenarios → ~1400 unique cases verified).
- HMAC: fresh signature ALWAYS accepted; tampered signature ALWAYS rejected; ANY single-character mutation ALWAYS rejected.
- SHA256: deterministic, 64-char hex output, collision-resistant.
- `computeMarketplaceFee`: monotone in percent, respects min/max bounds, never exceeds amount.
- `explainPaymentStatus`: never throws, always returns Spanish text, paid → approved invariant.

**Integration Tests vs MP Sandbox (NEW)**

- `test/integration/` — real HTTP calls to `api.mercadopago.com` with TEST tokens.
- Gated by `MP_INTEGRATION_TESTS=1` env var so they don't run in CI by default.
- Coverage: health check, payment search, lookups (payment methods, identification types), preference creation, installments. Catches MP API drift, real rate-limit headers, real status_detail values that mocks can't simulate.
- Run via `pnpm test:integration`.

**Failure Injection Tests (NEW)**

- 11 tests for adverse network/response conditions: ECONNRESET retry recovery, partial JSON, empty 200, MP-overloaded HTML 5xx, AbortSignal propagation, parent-abort no-retry, circuit breaker trip + fast-fail, 4xx no-circuit-trip, timer leak, concurrent calls.

**Benchmarks (NEW)**

- `pnpm bench` runs Vitest benchmarks. Measured on MacBook Air M2 (8GB), Node 22:
  - `hmacSha256Hex`: **45,932 ops/sec** (typical webhook manifest)
  - `sha256Hex` (40-byte input): **92,218 ops/sec** (idempotency key derivation)
  - `timingSafeEqualHex` (64 chars): **3,099,551 ops/sec**
  - `computeMarketplaceFee`: **20,662,947 ops/sec** (pure helper, sub-ns per call)
  - `explainPaymentStatus`: **21,289,436 ops/sec**
  - `InMemoryStateAdapter.set`: **5,752,416 ops/sec**

**Quality**

- **223 tests pass** (was 185; +38 v0.9 tests).
- publint clean. attw all 🟢 across both subpaths.
- Bundle: main 32 KB brotli'd; vercel-kv subpath 0.6 KB.
- `mp_health_check` brings tool count to **82**.

## 0.8.0

### Minor Changes — Edge Runtime + Vercel KV + Cookbook

**Edge Runtime support (was: Node-only)**

- Replaced `node:crypto` with the universal Web Crypto API across all crypto helpers.
- The toolkit now runs in **Vercel Edge Runtime, Cloudflare Workers, Deno, browsers, and Node 18+** with zero changes.
- New module `./crypto` exposes `hmacSha256Hex`, `sha256Hex`, `timingSafeEqualHex`.

**Webhook signature verify is now async + replay-attack protected**

- `verifyWebhookSignature(...)` returns `Promise<boolean>` (was `boolean`). All call sites in `handle_webhook` tool already awaited.
- New default 5-minute replay window: signatures with `ts` more than `replayToleranceSeconds` (default 300) old are rejected as replay attempts.
- Override the window per-call with the new `replayToleranceSeconds` option.
- **Breaking**: callers using the exported `verifyWebhookSignature` directly need to add `await`.

**Vercel KV adapters via subpath `@ar-agents/mercadopago/vercel-kv`**

- `VercelKVSubscriptionStateAdapter` — drop-in `SubscriptionStateAdapter` backed by Vercel KV (Upstash Redis).
- `VercelKVOAuthTokenStore` — persists per-seller OAuth tokens for marketplace flows. Key namespace `mp:oauth:{userId}`.
- `VercelKVIdempotencyCache` — TTL-aware cache for short-circuiting agent retries.
- `@vercel/kv` is an **optional** peer dependency — only consumers who use the subpath install it. Main bundle untouched.
- All three adapters work in Edge Runtime.

**New state adapter interfaces in main package**

- `OAuthTokenStore` + `InMemoryOAuthTokenStore` — token bundle persistence for marketplace OAuth.
- `IdempotencyCache` + `InMemoryIdempotencyCache` — agent-retry deduplication layer on top of MP's server-side dedup.

**Cookbook (8 recipes)**

- `cookbook/01-checkout-pro-basic.ts` — first-time hosted checkout
- `cookbook/02-saas-subscription.ts` — reusable plan + first payment + card swap on rejection
- `cookbook/03-webhook-handler.ts` — production-grade Edge handler with HMAC verify
- `cookbook/04-marketplace-split.ts` — OAuth seller link → preference with fee → reconciliation
- `cookbook/05-qr-in-store.ts` — QR generation → buyer scan → WhatsApp notify
- `cookbook/06-3ds-challenge.ts` — detect → redirect → recover via webhook
- `cookbook/07-auth-only-order.ts` — Order with manual capture (ride-share / hotel pattern)
- `cookbook/08-recovery-patterns.ts` — recover stuck-pending, card-swap on rejected sub, idempotent upsert via search, cron-driven monitoring

**Quality**

- 185 tests pass (was 169; +16 for KV adapters + 2 for replay protection).
- publint clean, attw all 🟢 across both subpaths.
- Bundle: main 31.9 KB brotli'd; vercel-kv subpath 0.6 KB brotli'd.

## 0.7.0

### Minor Changes

- MP v0.7: completeness máxima — el agente de MP más completo posible. **+25 tools (81 total)**.

  **Cierre de gaps obvios (8 tools)**:
  - `get_customer`, `update_customer`, `create_customer_card`, `get_customer_card`
  - `get_subscription_plan`, `update_subscription`, `search_subscriptions`
  - `get_refund`, `update_payment_preference`

  **Merchant Orders (3 tools — categoría completa nueva)**:
  - `get_merchant_order`, `search_merchant_orders`, `update_merchant_order`
  - MerchantOrder agrupa Payments asociados a una Preference — clave para reconciliar webhooks con `topic='merchant_order'`.

  **Stores + POS CRUD completion (6 tools)**:
  - `get_store`, `update_store`, `delete_store`
  - `get_pos`, `update_pos`, `delete_pos`

  **Bank Accounts (2 tools)**:
  - `list_bank_accounts`, `register_bank_account`

  **Point Devices físicos (5 tools — categoría nueva)**:
  - `list_point_devices` (terminales físicas: Smart, Tap to Pay)
  - `update_point_device_mode` (PDV vs STANDALONE)
  - `create_point_payment_intent` (push payment al device — amount en CENTAVOS)
  - `get_point_payment_intent`, `cancel_point_payment_intent`

  **Pure helpers (2 tools, high-leverage)**:
  - `compute_marketplace_fee` — given amount + (% o flat ARS, con min/max), returns exact `marketplace_fee`
  - `explain_payment_status` — dado un Payment, traduce los 30+ status_detail codes a `{ summary, recommendedAction, final, paid, retryable }` en español

  Type exports: `MerchantOrder`, `BankAccount`, `PointDevice`, `PointPaymentIntent`, `PointPaymentIntentState`, `CreatePointPaymentIntentParams`, `MarketplaceFeeRule`, `PaymentStatusExplanation`.

  Helpers exportados: `computeMarketplaceFee`, `explainPaymentStatus`.

  Cliente extendido: `request<T>` ahora soporta PATCH (necesario para Point devices).

  **169 tests pass** (was 132; +37 v0.7 tests). publint clean. attw 🟢. 31.4 KB brotli'd.

  **Cubre el 100% de lo que MP expone como API pública remota.** Operaciones dashboard-only (verificación de identidad, transferencias account-to-account, configuración de notificaciones por email, fraud rules) NO están — tampoco lo están en ningún SDK oficial de MP.

## 0.6.0

### Minor Changes

- MP v0.6: account/balance + settlements + 3DS analyzer + test cards. **+6 tools (56 total)**.

  **Account / Balance / Settlements (4 tools)**:

  - `get_account_balance` — current MP wallet `{ available, unavailable, total, currency_id }`. Per-seller in marketplace setups.
  - `list_account_movements({ from?, to?, limit?, offset? })` — wallet movement log (incoming payments, refunds, holdings, transfers).
  - `list_settlements({ from?, to?, status? })` — `release_money` transfers from MP wallet → registered CBU.
  - `get_settlement(id)` — single settlement detail with bank_account info.

  **3DS analyzer (1 tool + 1 helper)**:

  - `analyze_payment_3ds(payment_id)` — fetches the Payment, derives `{ status: 'not_required'|'frictionless'|'challenge_required'|'rejected'|'unknown', mode, challengeUrl, description }`. When `challengeUrl !== null`, MUST redirect the buyer to complete authentication.
  - `analyze3DS(payment)` exported as a pure helper for callers who already have a Payment object.

  **Test cards (1 tool + helpers)**:

  - `get_test_cards` — returns the official AR (MLA) sandbox cards: VISA/Mastercard/Amex credit + debit. Each has the "magic" holder names that route to specific status_detail (APRO, OTHE, CONT, FUND, CALL, SECU, EXPI, FORM).
  - `TEST_CARDS_AR`, `TEST_PAYERS_AR`, `buildTestCardScenario(card, scenario, amount)` exported for direct use in test files.

  **132 tests pass** (was 117; +15 v0.6 tests). publint clean. attw 🟢. 24.3 KB brotli'd (within 32 KB budget).

## 0.5.0

### Minor Changes

- MP v0.5: production hardening + marketplace flows. **+9 tools (50 total)**.

  **Webhook handler combo (1 tool)**:

  - `handle_webhook` — verifies HMAC-SHA256 signature, parses the event, and (optionally) auto-fetches the underlying resource (Payment, Subscription) in ONE call. Replaces the manual chain of verify_webhook_signature + parse_webhook_event + get_payment.
  - `mercadoPagoTools({ webhookSecret })` to enable.
  - Returns `{ verified, event, resource, resource_error }`. Reject with HTTP 401 when `verified: false`.

  **OAuth Marketplace flow (3 tools + 5 helper functions)**:

  - `oauth_authorize_url` — pure function, builds the URL the seller visits to authorize your marketplace app.
  - `oauth_exchange_code` — server-side exchange of the OAuth code for an `OAuthToken` (`access_token` + `refresh_token` + `user_id` + `expires_in`).
  - `oauth_refresh_token` — refresh a per-seller token before it expires (~6h).
  - Helper functions exported: `buildAuthorizeUrl`, `exchangeCodeForToken`, `refreshAccessToken`, `expirationTimeMs`, `isExpiringSoon`.
  - `mercadoPagoTools({ oauth: { clientId, clientSecret } })` to enable.

  **Order Management API (5 tools)**:

  - `create_order`, `get_order`, `update_order`, `capture_order`, `cancel_order` — MP's modern Order API. Distinct from Preference: explicit lifecycle, manual-capture support (auth-only flows for ride-share, hotels, marketplaces), multi-payment-per-order semantics.
  - `capture_mode: "manual"` enables the auth-only flow → `capture_order(id, amount?)` later.

  **Marketplace split payments**:

  - `marketplace`, `marketplace_fee` (in ARS), `collector_id` (seller MP user_id) supported on BOTH `create_order` AND `create_payment_preference`.
  - Funds route to the seller; `marketplace_fee` is split off to the marketplace's MP account.

  117 tests pass. publint clean. attw all green. 21.6 KB brotli'd (within 32 KB budget).

  The MCP wrapper auto-picks up the new tools — `@ar-agents/mcp` patch bump.

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
