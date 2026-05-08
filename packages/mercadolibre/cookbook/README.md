# Cookbook

Real recipes for `@ar-agents/mercadolibre`, ordered roughly by frequency-of-need.

| # | Recipe | What you learn |
| --- | --- | --- |
| 01 | [OAuth setup](./01-oauth-setup.md) | Surviving MELI's single-use refresh tokens — in-process mutex + DB-level CAS pattern |
| 02 | [Daily-triage agent](./02-daily-triage-agent.md) | Wire `meliTools` into a Vercel AI SDK 6 agent for the morning routine |
| 03 | [Claim defender](./03-claim-defender.md) | The 2-day SLA window + parallel evidence uploads with the right `evidence_type` |
| 04 | [Margin-guarded promotions](./04-margin-guarded-promotions.md) | Auto-opt-in to MELI promos only when margin clears your floor |
| 05 | [Webhooks + replay](./05-webhooks-with-replay.md) | Live POST receiver + the `/myfeeds` 2-day replay everyone forgets |
| 06 | [Listing creation](./06-listing-creation-with-category-predictor.md) | Category prediction + technical specs + create, all in one flow |
| 07 | [Reputation monitor](./07-reputation-monitor.md) | Severity-aware alerts + the `monitorReputation` async generator |

> Each recipe is self-contained. Copy-paste and adapt — the imports already match what's exported from `@ar-agents/mercadolibre` and `@ar-agents/mercadolibre/ai-sdk`.
