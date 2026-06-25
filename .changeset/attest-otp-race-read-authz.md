---
"@ar-agents/identity-attest": minor
---

Harden identity attestation against OTP brute-force races and cross-tenant reads (DeepSec MEDIUM).

- **OTP attempt counter race** (`rate-limit-bypass`): `completeVerification` decremented `attemptsRemaining` with a non-atomic read-modify-write, so concurrent wrong submissions could all read the same counter and exceed `maxAttempts`. The client now atomically CLAIMS an attempt (new `AttestationStore.decrementAttempts`) BEFORE verifying, so even a fully concurrent burst can never run more than `maxAttempts` verifications. Infrastructure errors from an adapter refund the slot (new `AttestationStore.incrementAttempts`) so a transient external-IdP failure doesn't burn a legitimate user's attempt. Both new store methods are optional — stores that omit them fall back to a (single-process-safe) read-modify-write. `InMemoryAttestationStore` implements both atomically.
- **Cross-tenant attestation reads** (`cross-tenant-id`): `check_verification_status` and `get_attestation` returned subject/claims/signature for any caller-supplied `request_id`. New optional `IdentityAttestToolsOptions.authorizeRead(ctx)` hook gates both read tools — construct the tools per request with the caller bound (e.g. compare `ctx.externalReference`), return `false` to deny, and the tool responds with `not_authorized` exposing no data. Omitting it preserves current behavior.

New exports: `IdentityAttestReadContext`.
