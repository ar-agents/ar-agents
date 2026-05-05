# @ar-agents/identity-attest — agent guide

The "RENAPER workaround" pattern: orchestrate identity verification via providers that ARE accessible to indie devs (WhatsApp OTP, email magic-link, Auth0, MercadoPago Identity), get back a signed attestation with a trust level. The agent then decides if the trust level is enough for the action requested.

## Why this exists

RENAPER (official Argentine DNI verification) is **closed to non-financial institutions** at $60/transaction. There is no public API for indie devs to verify "is this person who they say they are."

This package implements the only viable workaround: **the agent doesn't verify directly — it orchestrates the user proving themselves via a third-party provider, then receives a cryptographically-signed attestation it can trust.**

## Decision tree

| User intent | Tool to call |
|---|---|
| "I need to verify the user before [sensitive action]" | First `list_verification_methods` to see options. Then pick by trust requirement. |
| "Send a code to their WhatsApp" | `request_identity_verification(method="whatsapp_otp", subject_type="phone", subject_value=...)` |
| "Send a magic link to their email" | `request_identity_verification(method="email_magic_link", subject_type="email", subject_value=...)` |
| User dictated the OTP code back | `submit_otp_code(request_id, code)` |
| Waiting for user to click magic link | `check_verification_status(request_id)` (poll) |
| Need the proof later | `get_attestation(request_id)` |

## The two flow shapes

### OTP (WhatsApp / SMS / Email OTP)

```
agent → request_identity_verification(method="whatsapp_otp", ...)
   ↓ adapter sends 6-digit code via WhatsApp
agent → "Te mandé un código por WhatsApp, pasámelo cuando lo recibas"
user → "el código es 482917"
agent → submit_otp_code(request_id, "482917") → returns Attestation
agent → "Listo, verificado ✓"
```

### Magic-link (Email / OAuth)

```
agent → request_identity_verification(method="email_magic_link", ...)
   ↓ adapter sends email with click-this-link
agent → "Te mandé un mail con un link, hacé click ahí"
user clicks link → handleAttestationCallback() validates token
   ↓ Attestation signed and stored
agent (polling check_verification_status) → status="verified"
agent → get_attestation(request_id) → returns Attestation
agent → "Listo, verificado ✓"
```

## Trust levels reference

| Trust | Method | Threat model passed | Use cases |
|---|---|---|---|
| 0.3 | WhatsApp/SMS OTP | Controls phone right now | Low-stakes (newsletter signup, low-amount tx) |
| 0.5 | Email magic-link | Controls email right now | Mid-stakes (account creation, < $10k tx) |
| 0.7 | Auth0 / Cognito (planned) | Has account at federated IdP | Standard fintech onboarding |
| 0.85 | MercadoPago Identity (planned) | Passed MP KYC | Higher-value tx, AR-specific |
| 0.95 | SID gov (planned, blocked on rollout) | Official identity check | Anything regulated |

The agent's prompt should include the trust threshold for each action: *"For payments < $5k, trust >= 0.3 OK. For payments < $50k, trust >= 0.5. For payments above, require 0.85+."*

## Result schemas (memorize)

### `request_identity_verification` returns

```jsonc
{
  "request_id": "uuid-...",
  "method": "whatsapp_otp" | "email_magic_link" | ...,
  "trust_level": 0.3,
  "status": "pending",
  "expires_at": "2026-05-05T22:00:00.000Z",
  "verification_url": "https://app/cb?..." | null,
  "next_step": "Tell the user: 'Te mandé un código por WhatsApp...' (instructions vary by method)"
}
```

**ALWAYS surface `next_step` to the user verbatim** (or a Spanish-argentino equivalent). The lib gives you the exact wording.

### `submit_otp_code` returns

```jsonc
{
  "verified": true,
  "request_id": "uuid-...",
  "trust_level": 0.3,
  "subject": { "type": "phone", "value": "5491112345678" },
  "verified_at": "2026-05-05T22:00:00.000Z",
  "expires_at": "2026-06-04T22:00:00.000Z",
  "message": "User verified at trust level 0.3 via whatsapp_otp."
}
```

If the OTP was wrong: throws `InvalidOtpCodeError(attemptsRemaining)` — the agent should ask the user to try again, mentioning attempts remaining.

If exhausted: throws `TooManyAttemptsError` — the agent must start a new request.

### `check_verification_status` returns

```jsonc
{
  "request_id": "...",
  "status": "pending" | "verified" | "failed" | "expired" | "cancelled",
  "method": "...",
  "subject": { "type": "...", "value": "..." },
  "trust_level": 0.5,
  "expires_at": "...",
  "attestation": { "verified_at": "...", "claims": {...}, "signature": "..." } | null
}
```

## Error patterns

| Error class | Meaning | Agent action |
|---|---|---|
| `InvalidOtpCodeError(attemptsRemaining)` | Wrong code | "El código no coincide. Te quedan N intentos." |
| `TooManyAttemptsError` | 3 strikes | "Demasiados intentos. Te genero un código nuevo." → call `request_identity_verification` again |
| `VerificationExpiredError` | TTL past | "El código expiró. Te mando uno nuevo." → new request |
| `VerificationRequestNotFoundError` | Bad request_id | Internal error — check your call site |
| `IdentityAttestConfigError` | Misconfiguration | App-level error — surface as "internal error" to user |
| `AttestAdapterError` | Provider failure (WhatsApp send, email send) | "No pude mandar el código, probemos otro método" |

## The signature on every attestation

Every issued `Attestation` carries an HMAC-SHA256 signature over `(requestId, verifier, method, trustLevel, subject, verifiedAt, expiresAt)`. Persist the full attestation when you take a sensitive action — later you can prove "I had verified this person at this trust level on this date" by re-running `client.verifyAttestationSignature(attestation)`.

This matters for:
- Audit logs / regulatory disclosure
- Disputes ("the user claims they didn't authorize" → "here's the signed attestation from X date at trust 0.85")
- Multi-tenant scenarios where one service issues attestations and another consumes them

## What this package will NEVER do

- Verify DNI directly via RENAPER (closed API; out of scope and would be misleading).
- Store unverified user data (phones, emails) without explicit verification request.
- Issue attestations without a real verification (no "trust me bro" mode).
- Bypass adapter rate limits (WhatsApp Cloud API limits, email provider throttles).
- Return the raw OTP secret to the agent (agent can ONLY get the result of submit, not the original code).

## Composition with other @ar-agents/* packages

| Pair with | Why |
|---|---|
| [`@ar-agents/whatsapp`](../whatsapp) | The `WhatsAppOtpAdapter` uses any client matching the `WhatsAppLikeClient` shape. Pass your `WhatsAppClient` instance. |
| [`@ar-agents/identity`](../identity) | Combine: validate CUIT format with `validate_cuit`, lookup AFIP padron with `lookup_cuit_afip`, then verify the user controls the WhatsApp/email of record with `request_identity_verification`. Three layers of identity in one agent. |
| [`@ar-agents/mercadopago`](../mercadopago) | Gate `create_payment` / `create_payment_preference` on a minimum trust level. Example: "for charges > $20k I require trust >= 0.5". |

## Argentina context

- AR-specific: WhatsApp OTP works flawlessly because virtually every adult has WhatsApp. Email penetration is lower. Magic-link via SMS is unreliable in AR (carrier filtering).
- Federated identity providers in AR: Auth0 + Cognito + Magic dominate. SID (Sistema de Identidad Digital del gobierno) is the future but rollout to private sector is incremental.
- For B2B AR flows, `@ar-agents/identity`'s CUIT lookup PLUS this package's email verification gives high-confidence identity at near-zero cost.
