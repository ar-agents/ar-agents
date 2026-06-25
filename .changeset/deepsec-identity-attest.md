---
"@ar-agents/identity-attest": minor
---

Security hardening (DeepSec audit, all true-positive):

- **Attestation HMAC now covers `claims` + `externalReference`.** The previous
  delimiter payload signed only id/verifier/method/trustLevel/subject/dates, so
  claims and externalReference could be tampered without invalidating the
  signature. Signing is now a canonical (sorted-key) serialization of every
  security-relevant field. BREAKING: signatures issued by older versions no
  longer verify (they were forgeable on those fields).
- **Auth0 verification binds to the requested subject.** A valid Auth0 id_token
  for a *different* account no longer satisfies a request: `subject.type:"oauth"`
  requires `payload.sub === subject.value`; `"email"` requires
  `payload.email === subject.value` and `email_verified === true`; other subject
  types are rejected.
- **OTP codes + tokens use a CSPRNG.** `randomOtp` / `randomToken` switched from
  `Math.random` (predictable) to `crypto.getRandomValues` with rejection
  sampling (no modulo bias).
- **`allowedMethods` is enforced**, not just used to filter the listing: a method
  outside the allowlist is rejected by `request_identity_verification`.
