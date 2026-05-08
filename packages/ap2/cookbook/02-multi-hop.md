# 02 — Multi-hop dSD-JWT chains

A single-hop mandate covers the Direct flow (Trusted Surface signs both
the open and closed mandates). For Trusted Agent Provider models — where
an OEM-signed root issuer delegates to an agent who delegates further —
you need **dSD-JWT chains**: SD-JWT presentations joined with the
canonical `~~` separator, each hop binding the next via `cnf.jwk` PoP.

```ts
import {
  generateAp2KeyPair,
  parseDsdJwtChain,
  serializeDsdJwtChain,
  verifyDsdJwtChain,
  computeSdHash,
  signCompactJws,
  encodeDisclosure,
  digestOfDisclosure,
  generateSalt,
  serializeSdJwt,
  CHAIN_SEPARATOR,
} from "@ar-agents/ap2";

// Three roles, three keys.
const root = await generateAp2KeyPair("ES256");          // Trusted Agent Provider
const intermediateHolder = await generateAp2KeyPair("ES256"); // optional middle hop
const agent = await generateAp2KeyPair("ES256");         // signs the closed mandate

// (Helper omitted — see test/chain.test.ts for `buildRootHop` / `buildKbHop`.)
//
// For a 2-hop chain (Trusted Agent Provider → Agent):
//
//   <root SD-JWT>~~<terminal KB-SD-JWT>
//
// For a 3-hop chain (Provider → Intermediate → Agent):
//
//   <root SD-JWT>~~<intermediate KB-SD-JWT>~~<terminal KB-SD-JWT>
//
// Verify with:

const result = await verifyDsdJwtChain(presentation, {
  rootIssuerKey: root.publicJwk,
  expectedAudience: "merchant_1",
  expectedNonce: "verifier-issued-nonce",
});
if (!result.ok) throw new Error(result.reason);

// `result.openMandates` carries every open mandate from non-terminal hops
// — apply their constraints to `result.closedMandate`.
// `result.terminalSdHash` is the receipt `reference`.
```

## Spec rules enforced

The verifier walks hops 1..n applying these rules from AP2 §C:

| Rule | Where it lives in `verifyDsdJwtChain` |
|---|---|
| Hop[i] signature verifies under hop[i-1]'s `cnf.jwk` (RFC 7800 PoP) | Inside the per-hop loop |
| Each non-root hop's `sd_hash` claim equals the previous hop's computed `sd_hash` | Step 3 of the per-hop loop |
| Terminal hop typ ∈ `{kb+sd-jwt, kb-sd-jwt}` | Step 2 |
| Intermediate hop typ ∈ `{kb+sd-jwt+kb, kb-sd-jwt+kb}` | Step 2 |
| Terminal hop carries `aud` matching `expectedAudience` | Step 4 (terminal-only) |
| Terminal hop carries `nonce` matching `expectedNonce` | Step 4 (terminal-only) |
| `delegate_payload[0]` of every non-terminal hop carries `cnf.jwk` for the next signer | Step 8 |
| Terminal hop's `delegate_payload[0]` MUST be a closed mandate (no `cnf`) | Final extraction loop |

## Failure modes

`result.code` is one of:

- `invalid_credential` — signature, schema, parse, sd_hash, typ, or `cnf.jwk` chain failure
- `invalid_mandate` — terminal hop's closed mandate fails schema (e.g. unknown `vct`)

Pair with [03 — Budget tracking](./03-budget-tracking.md) when the chain
includes `payment.budget` + `payment.agent_recurrence`.
