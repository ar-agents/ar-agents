---
"@ar-agents/mercadopago": minor
"@ar-agents/identity": minor
---

Initial public 0.1.0 release of `@ar-agents/mercadopago` and `@ar-agents/identity`.

**`@ar-agents/mercadopago`** — Mercado Pago Subscriptions as drop-in tools for the Vercel AI SDK 6+. Five tools (`create_subscription`, `get_subscription_status`, `cancel_subscription`, `pause_subscription`, `resume_subscription`), pluggable `SubscriptionStateAdapter` interface, webhook helpers (`parseWebhookEvent`, `verifyWebhookSignature`), and 8 typed error classes that codify 11 documented MP landmines as actionable errors.

**`@ar-agents/identity`** — Argentine CUIT/CUIL validation + AFIP padron lookup as drop-in tools. Two tools (`validate_cuit` algorithmic + `lookup_cuit_afip` adapter-pluggable), `AfipPadronAdapter` interface with safe `UnconfiguredAfipPadronAdapter` default, full modulo-11 algorithm with normalization and actionable Spanish error messages.

Both packages ship `README.md` for human readers and `AGENTS.md` for LLM consumption (tool selection rules, memorizable result schemas, error-recovery patterns, latency tables, AR context for non-AR agents).
