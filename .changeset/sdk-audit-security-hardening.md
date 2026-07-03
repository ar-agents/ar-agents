---
"@ar-agents/identity-attest": patch
"@ar-agents/identity": patch
"@ar-agents/firma-digital": patch
"@ar-agents/mcp": patch
---

Security hardening.

- **identity-attest**: the Auth0 id_token verification now pins the signature algorithm (`RS256`), closing the algorithm-confusion vector (consistent with the ap2 verifier).
- **identity / firma-digital**: `node-forge` (on the signature-verification path) is constrained to `~1.4.0` (patch-only) so a consumer cannot silently resolve a regressed minor.
- **mcp**: `@modelcontextprotocol/sdk` is constrained to `~1.29.0` (patch-only) on the transport path.
