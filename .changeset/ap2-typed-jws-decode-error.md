---
"@ar-agents/ap2": patch
---

`decodeJwsUnverified()` now throws the package's typed `SdJwtError` when the
JWS header or payload segment is not valid base64url-encoded JSON, instead of
leaking a raw `SyntaxError` from `JSON.parse` on attacker-controlled input.
`SdJwtError` moved to the crypto module (re-exported from its previous
location), so the public surface is unchanged.
