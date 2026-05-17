# arg-verify

Independent, zero-dependency, offline verifier for the `/arg` operational-log
standard (RFC-004 HMAC, RFC-005 Ed25519). No npm install. No network. Does not
import `/arg` or Vultur code — it is a clean-room implementation written from
the RFC text, so passing it is real evidence the standard is reproducible.

```
node arg-verify.mjs vectors        # reproduce published RFC-004/005 vectors
node arg-verify.mjs entry e.json --secret S --keys keys.json   # verify one entry
node arg-verify.mjs attestation att.json [expectedPubKeyB64]   # verify a Vultur attestation
```

`vectors` is the headline: it recomputes every value in
`apps/landing/public/test-vectors/rfc-00{4,5}-v1.json` and asserts byte
equality. A regulator or journalist runs it to confirm the cited standard
without trusting us. Current result: **14/14 PASS**.

See [`CONFORMANCE.md`](./CONFORMANCE.md) for how the flagship implementation
(Vultur `@vultur/core`) maps to the standard — what matches, what it extends,
and the one place it diverges (Vultur is a stronger hash-chain profile, not a
drop-in RFC-004 emitter) plus the decision that resolves it.
