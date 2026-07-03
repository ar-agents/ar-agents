---
"@ar-agents/identity-attest": minor
---

Add an EVM + Ed25519 key-binding verification method, exposed as a new subpath
`@ar-agents/identity-attest/key-binding`.

`verifyKeyBinding(doc)` proves that the key/address claimed in an RFC-002
identity doc controls that doc, from signatures alone, without the verifier ever
holding the key. It supports:

- `ed25519` — our RFC-004/005 scheme (raw 32-byte public key).
- `evm-secp256k1` — a Base/Ethereum key: EOA via EIP-191 `personal_sign` +
  ecrecover, or a smart-contract account (EIP-1271) via an injected
  `isValidSignature` RPC call.

The verifier re-derives the signed statement and doc hash from the doc body and
identity fields (never trusting `binding.statement` / `binding.docHash`), so
mutating any field or swapping the address breaks the binding. Deterministic:
`issuedAt` is read from the doc, never wall-clock, so bindings stay
re-verifiable.

Generalizes the single-partner `$SAIRI × ar-agents` spec into a reusable
primitive. Additive and self-contained: the new dependencies (`@noble/curves`,
`@noble/hashes`) load only on the subpath, keeping the main bundle Edge-safe.
