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
| 08 | [Webhook dedup with Vercel KV](./08-webhook-dedup-vercel-kv.md) | Atomic `SET … NX EX` so MELI's redeliveries never double-process |
| 09 | [Distributed rate limiter (Upstash Redis)](./09-redis-rate-limiter.md) | Multi-region GCRA token bucket implementing the `RateLimiter` interface |
| 10 | [Cloudflare Durable Objects for OAuth](./10-cloudflare-durable-objects-oauth.md) | Per-userId DO partitioning makes single-use refresh-token races impossible |
| 11 | [Human-in-the-loop on irreversible ops](./11-human-in-the-loop.md) | Programmatic gate the LLM cannot bypass — confirms `create_item`, price changes, claim defenses, public answers before they fire |
| 12 | [ACP feed generator](./12-acp-feed-generator.md) | Agent-readable product feed so ChatGPT/Claude/Gemini buyers find your MELI catalog before they go to Amazon/Shein |

> Each recipe is self-contained. Copy-paste and adapt — the imports already match what's exported from `@ar-agents/mercadolibre` and `@ar-agents/mercadolibre/ai-sdk`.
