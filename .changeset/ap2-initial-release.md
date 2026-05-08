---
"@ar-agents/ap2": minor
"@ar-agents/agentic-commerce-bridge": minor
---

Add `@ar-agents/ap2` — Agent Payments Protocol primitives, plus the bridge's optional `@ar-agents/agentic-commerce-bridge/integrations/ap2` helpers that verify and sign AP2 mandates inside a custom `PaymentProvider`.

`@ar-agents/ap2` exposes the verification + signing surface for AP2 Closed Checkout Mandates and Payment Receipts. JWS over the canonical claims set, JWK key handling. Edge-Runtime safe (Web Crypto only).

The bridge integration is opt-in: `@ar-agents/ap2` is declared as an optional peer dependency. Hosts that don't need AP2 don't pay the bundle cost.
