# Changelog

## 0.5.0

### Minor Changes

- [`15f9b89`](https://github.com/ar-agents/ar-agents/commit/15f9b8974b514f4321f939324fa4d24dac81ba95) Thanks [@naza00000](https://github.com/naza00000)! - Lift sweep — final wave: every remaining OG package now extends
  `ArAgentsError` from `@ar-agents/core`.

  After this release, **23 of 26 `@ar-agents/*` packages** share the
  uniform `{ code, retryable, context }` family contract. The three
  packages still on plain `Error` (`agentic-commerce-bridge`, `ap2`,
  `mcp`) have no dedicated `errors.ts` module — they throw `Error`
  inline at the call site; their lift is a deeper refactor tracked
  separately.

  For all 12 packages here: backward compatible. Public constructors,
  field names, and `instanceof` checks unchanged. New: `error.retryable`
  flag wired per code (e.g. `wsfe_service_unavailable: true`,
  `bcra_rate_limited: true`, `discovery_failed: true`, `ckan_unreachable:
true`, `fetcher_unreachable: true`, `shipping_carrier_error: true`);
  non-transient codes default to `retryable: false`.

  One **internal-API** rename in `@ar-agents/whatsapp`: `WhatsAppApiError.code`
  (previously the Meta numeric error code) is now exposed as
  `WhatsAppApiError.metaCode` so the family-uniform `code: string`
  contract (`whatsapp_meta_<n>`) can sit on the same instance. Callers
  that read `err.code` as a number must migrate to `err.metaCode`; the
  deserialized webhook event field `event.errors[i].code` is unchanged
  (still numeric, since it's not a `WhatsAppApiError` instance).

  Family-coherence count after this release: **23 / 26 packages**.

## 0.4.2

### Patch Changes

- [`da49fde`](https://github.com/ar-agents/ar-agents/commit/da49fde136ecea89b4755fe74b3ed91ed9720f46) - Enable [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) for all `@ar-agents/*` packages. From this version on, the npm registry includes a verifiable cryptographic record that the package was built from this exact GitHub commit, via the GitHub Actions `release.yml` workflow. Boosts supply-chain audit scores (Socket / Snyk / npm) and lets downstream agents verify package integrity without trusting the publisher.

  No API or runtime changes.

## 0.4.0

### Minor — Auth0 + Magic.link adapters moved to subpath exports

The Auth0 and Magic.link SDK adapters use `node:crypto` and `@magic-sdk/admin`
(which transitively imports `node:stream`, `node:http`, etc). Re-exporting
them from the main barrel made the "main bundle is Edge-Runtime safe" claim
in v0.3.0 only true under aggressive ESM tree-shaking. CJS consumers and
naive bundlers pulled the Node-only modules anyway.

```ts
// BEFORE (v0.3.x — still works, deprecated)
import { Auth0Adapter, MagicLinkSdkAdapter } from "@ar-agents/identity-attest";

// AFTER (v0.4.x — recommended)
import { Auth0Adapter } from "@ar-agents/identity-attest/auth0";
import { MagicLinkSdkAdapter } from "@ar-agents/identity-attest/magic-link-sdk";
```

The main barrel re-exports are kept for backward compatibility with a
`@deprecated` JSDoc, scheduled for removal in v1.0.0.

This closes the runtime-claim mismatch flagged by /review (CHANGELOG admitted
the limitation in fine print but the package-level "Edge Runtime support"
claim was misleading).

### Test coverage additions

- `test/crypto.test.ts` — golden-vector regression test for `hmacSha256Hex`
  vs `node:crypto.createHmac`. If the Web Crypto path drifts from the old
  implementation, all previously-issued attestations would silently fail
  signature verification — now caught loudly. Includes 5 test vectors
  (typical, empty, single-char, long, unicode) plus tests for
  `timingSafeEqualHex` and `randomUuid`.

## 0.3.0

### Minor Changes — Edge Runtime support (BREAKING for direct callers of `verifyAttestationSignature`)

**Migrated `AttestationClient` from `node:crypto` to Web Crypto.** The main
bundle now runs in Vercel Edge Runtime, Cloudflare Workers, Deno, and
any environment with `globalThis.crypto.subtle`.

**Breaking change:** `AttestationClient.verifyAttestationSignature(att)`
is now async (`Promise<void>` instead of `void`). All callers inside
agent tool execute() handlers are already async, so this is zero-cost
for typical usage. If you call it from sync code, add `await`.

```ts
// BEFORE
client.verifyAttestationSignature(att);

// AFTER
await client.verifyAttestationSignature(att);
```

The Auth0 + MagicLink adapters still use `node:crypto` for PKCE — they're
opt-in (you only pull them if you import `Auth0Adapter` / `MagicLinkSdkAdapter`).
The core `AttestationClient` + `WhatsAppOtpAdapter` + `EmailMagicLinkAdapter`
are fully Edge-safe.

## 0.2.0

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

## 0.1.0

### Initial release — the RENAPER workaround pattern

Identity attestation orchestrator for AI agents. The agent doesn't verify identity directly (RENAPER closed); it orchestrates the user proving themselves via accessible providers (WhatsApp OTP, email magic-link), receives a cryptographically-signed `Attestation` with a `trustLevel` (0..1), and decides whether trust suffices for the action requested.

**Core**

- `AttestationClient` — orchestrator. HMAC-SHA256 signs every issued attestation. Pluggable storage.
- `AttestationStore` interface + `InMemoryAttestationStore` default. Implement Redis/Postgres adapters for production.
- `AttestAdapter` interface — every adapter declares its trust level + how to deliver/verify the challenge.
- Per-request expiry (default 15 min), max attempts (default 3, then `failed`), attestation TTL (default 30 days).

**Adapters shipped (v0.1)**

- `WhatsAppOtpAdapter` (trust 0.3) — uses `@ar-agents/whatsapp` (or any `WhatsAppLikeClient`) to deliver 6-digit OTP. Falls back to template message outside 24h customer service window.
- `EmailMagicLinkAdapter` (trust 0.5) — uses any `EmailSender` (Resend/SES/SMTP) to deliver magic-link email.

**Tools (5)**

- `list_verification_methods` — what's registered, with trust levels
- `request_identity_verification` — kick off a flow
- `submit_otp_code` — for OTP flows
- `check_verification_status` — for polling magic-link flows
- `get_attestation` — fetch the signed proof

**Webhook**

- `handleAttestationCallback` — wire into your `/api/identity-attest/callback` route handler for magic-link completion.

**Trust levels**

- 0.3 phone-owned (OTP)
- 0.5 email-owned (magic-link)
- 0.7 federated identity (Auth0/Cognito) — planned v0.2
- 0.85 KYC-verified (MercadoPago Identity) — planned v0.3
- 0.95 gov-verified (SID) — planned, blocked on AR rollout
- 1.0 in-person (out of agent scope)

**Tests**: 15/15 passing. Bundle: 4.44 KB ESM brotli'd. publint + arethetypeswrong all 🟢.
