---
"@ar-agents/mercadopago": patch
---

Add 3 production-grade cookbook recipes:

- **13-anti-fraud-middleware.ts** — pre-charge heuristics chain: CUIT validity (algorithm-only), payer email history (searchPayments + status_detail flags for `cc_rejected_call_for_authorize` / `_high_risk` / `_blacklist`), 1-hour velocity tracker, AR issuer-promo stacking detector. Combined risk score (`approve` / `review` / `reject`), with high-value charges (>$100k) getting a 1.5x multiplier.
- **14-marketplace-onboarding.ts** — end-to-end flow: CUIT validation → AFIP padron lookup (resolves legal name + IVA condition + monotributo category) → OAuth redirect with PKCE round-tripped via state → callback handler exchanging code for tokens → $1 ARS test charge → marketplace fee setup with `computeMarketplaceFee`.
- **15-prorated-pause-resume.ts** — pause a subscription with prorated refund for the unused period (`createRefund` against the most recent charge), resume with an adjusted next-billing date so the customer doesn't double-pay. Uses `pausePreapproval` + `resumePreapproval` + a local `pauseStore` (Vercel KV in prod) to remember the credit.

12 → 15 cookbook recipes total. README updated.
