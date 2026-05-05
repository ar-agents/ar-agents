# Changelog

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
