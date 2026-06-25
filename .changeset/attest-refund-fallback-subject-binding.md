---
"@ar-agents/identity-attest": minor
---

Harden the verification client further (DeepSec adversarial-review follow-ups, incl. a deferred HIGH).

- **Remove refund-on-throw (HIGH).** The 0.7.0 fix refunded a claimed attempt whenever `adapter.verify()` threw, assuming a throw was always a transient infra error. Since a throw is attacker-influenceable (network-backed adapters throw `AttestAdapterError` on induced failures), this let an attacker run unlimited `verify()` calls (cost/DoS) with the counter stuck. Attempts are now consumed **unconditionally** — total `verify()` invocations are bounded by `maxAttempts`. (`incrementAttempts` removed from `AttestationStore`.)
- **Make the non-atomic-store fallback race-safe (HIGH).** When a store omits the atomic `decrementAttempts`, the client now serializes per-request with an in-process lock, so a concurrent burst can't exceed `maxAttempts` within a process. Multi-process deployments still MUST implement atomic `decrementAttempts` (documented).
- **Client-side subject binding (deferred HIGH, `cross-tenant-id`).** Adapters may now return `verifiedSubject` on success; the client fails closed with the new `SubjectMismatchError` when it doesn't equal `request.subject`. The MercadoPago and Magic.link adapters previously attested *any* requested subject off an unrelated payer/token identity — they now return the identity they actually prove (Auth0 too, for defense in depth), so a valid token for one identity can't mint an attestation for another.

New export: `SubjectMismatchError`.
