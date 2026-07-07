---
"@ar-agents/mercadopago": patch
---

OAuth token responses with a malformed (non-JSON) body now throw the typed
`MercadoPagoError` with a 300-char body snippet for context, instead of
leaking a raw `SyntaxError` from `JSON.parse`. Applies to
`exchangeCodeForToken()` and `refreshAccessToken()`.
