# @ar-agents/firma-digital

## 0.1.0

### Minor Changes

- Initial release. Argentine Firma Digital (Ley 25.506 / ONTI) verification primitives wrapped as Vercel AI SDK 6 tools.
  - `parseCert(pem)` — parse single X.509 cert, extract subject/issuer/CUIT/key info.
  - `parseCertChain(pemBundle)` — multi-cert PEM extraction.
  - `verifyChain(pemBundle, options)` — leaf → root walk with heuristic AR-ONTI root acceptance OR explicit trust-anchor fingerprint pinning.
  - `verifyDetachedCmsSignature(sig, payload, options)` — PKCS#7 / CMS detached signature verification with optional chain walk per signer.
  - 4 tools: `firma_inspect_cert`, `firma_verify_chain`, `firma_is_onti_issued`, `firma_verify_cms_signature`.
  - Heuristic AR-ONTI / AC-Raíz detection via DN-pattern matching; extensible via `TrustStore`.
  - Verification only — signing is out of scope (requires hardware tokens).
