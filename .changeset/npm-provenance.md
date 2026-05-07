---
"@ar-agents/mercadopago": patch
"@ar-agents/identity": patch
"@ar-agents/identity-attest": patch
"@ar-agents/whatsapp": patch
"@ar-agents/banking": patch
"@ar-agents/facturacion": patch
"@ar-agents/shipping": patch
"@ar-agents/mcp": patch
---

Enable [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) for all `@ar-agents/*` packages. From this version on, the npm registry includes a verifiable cryptographic record that the package was built from this exact GitHub commit, via the GitHub Actions `release.yml` workflow. Boosts supply-chain audit scores (Socket / Snyk / npm) and lets downstream agents verify package integrity without trusting the publisher.

No API or runtime changes.
