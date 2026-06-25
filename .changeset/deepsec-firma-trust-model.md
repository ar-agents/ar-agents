---
"@ar-agents/firma-digital": minor
---

Security: rework the X.509 / CMS trust model so a forged certificate can no
longer be reported as authentic (DeepSec audit, all true-positive).

- **Chain validity requires a pinned trust anchor.** `verifyChain` previously
  accepted any self-signed root whose DN *looked like* an AR ONTI / AC-Raíz root
  (`acceptArOntiRoot` defaulted true). DN strings are forgeable, so this let an
  attacker mint a self-signed "Autoridad Certificante Raíz" and have a chain
  validate. Now `valid:true` requires the root to match a configured
  `trustAnchors` SHA-256 fingerprint; the name match is demoted to an
  informational `looksLikeArRoot` flag. `acceptArOntiRoot` is a deprecated no-op.
- **Enforce CA constraints + strong algorithms.** Every non-leaf issuer must be a
  CA (`basicConstraints.cA` + `keyCertSign`); an end-entity cert can no longer
  sign another cert. SHA-1/MD5-era signature algorithms are rejected.
- **CMS validity now includes the chain.** `verifyDetachedCmsSignature` returned
  `valid:true` on a good signature even when the signer chain was untrusted; it
  now returns `valid:false` if any signer's chain fails (when `verifyChain` is on).
- **CMS signer resolved by IssuerAndSerialNumber**, not certificate array order.
- **Tools:** `firmaDigitalTools({ trustAnchors })` takes host-pinned anchors;
  `firma_verify_chain` dropped the model-controllable `accept_ar_onti_root` input.

BREAKING: callers relying on heuristic-root acceptance must now pass `trustAnchors`
(parsed official AC-Raíz certs) to get `valid:true`.
