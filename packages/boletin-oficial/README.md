# `@ar-agents/boletin-oficial`

> Argentine Boletín Oficial as a structured firehose for AI agents on the Vercel AI SDK 6.

```bash
pnpm add @ar-agents/boletin-oficial ai zod
```

Part of the [`Arg`](https://ar-agents.vercel.app) toolkit — open infrastructure for the Argentine AI agent jurisdiction.

## Why this exists

The Boletín Oficial publishes ~1500 normas a day across four secciones — laws, decrees, ARCA/BCRA resoluciones, sociedades, public-sector contracting, judicial notices. Compliance, regtech, legal monitoring, and "did the government just publish something about us" all hit it.

There is no documented public API. There is no RSS. There is no webhook. Every Argentine company that monitors the BO is either scraping the same endpoint, paying a consultancy to do it, or missing things.

This package fixes that for AI agents and developer apps:

- **Search + filter** by sección, organismo, CUIT, date range, free-text.
- **Get a single norma** by id with full text + extracted CUITs.
- **Subscribe to keywords/CUITs/secciones** and get matched normas back.

Pluggable adapters: ship-with-defaults `LiveBoFetcher`, `MockBoFetcher` for tests, `UnconfiguredBoFetcher` for safe-by-default tools, plus an `InMemoryBoSubscriptionAdapter` and a `BoSubscriptionAdapter` interface for production stores.

## Quick start

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import {
  boletinOficialTools,
  LiveBoFetcher,
  InMemoryBoSubscriptionAdapter,
} from "@ar-agents/boletin-oficial";

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: boletinOficialTools({
    fetcher: new LiveBoFetcher(),
    subscriptions: new InMemoryBoSubscriptionAdapter(),
  }),
  stopWhen: stepCountIs(8),
});

const { text } = await agent.generate({
  prompt:
    "¿Hubo algo nuevo de ARCA en el Boletín Oficial esta semana? Si hay alguna resolución sobre monotributistas, suscribime para que me avises.",
});
```

The agent will:

1. Call `bo_search` with `{ organismo: "ARCA", from: "<7 days ago>" }`.
2. Filter results by relevance.
3. Call `bo_subscribe` with `{ owner_id, organismo: "ARCA", keyword: "monotributo" }`.
4. Summarize.

## Tool surface

| Tool                      | Purpose                                                |
| ------------------------- | ------------------------------------------------------ |
| `bo_search`               | Free-text + filters → list of normas.                  |
| `bo_get_norma`            | Fetch a single norma by id.                            |
| `bo_today`                | Convenience wrapper for "today's publications".        |
| `bo_subscribe`            | Register a keyword/CUIT/sección match.                 |
| `bo_list_subscriptions`   | List active subscriptions for an owner.                |
| `bo_unsubscribe`          | Remove a subscription by id.                           |

See [`AGENTS.md`](./AGENTS.md) for tool-selection rules.

## Direct API

You can also use the building blocks without the agent layer.

```ts
import {
  LiveBoFetcher,
  matchNorma,
  classifyTipo,
  extractCuits,
} from "@ar-agents/boletin-oficial";

const fetcher = new LiveBoFetcher();
const { results } = await fetcher.search({ organismo: "ARCA", query: "monotributo" });

// Pure helpers — no I/O, safe in any environment:
classifyTipo("RESOLUCIÓN GENERAL Nº 5612/2026", "primera"); // → "resolucion"
extractCuits("CUIT del responsable: 20-41758101-5"); // → ["20417581015"]
```

## Resilience model

The Boletín Oficial doesn't publish a stable API. Parsers in this package are **conservative**: when the page structure changes, the package returns empty results or throws `BoError("fetcher_unexpected_response")` rather than silently return wrong data.

Pin the package version. Watch the changelog. Report parser breakage on GitHub — a fix usually lands within 24h.

## Production storage

`InMemoryBoSubscriptionAdapter` is fine for dev and demos but loses state on restart. Implement `BoSubscriptionAdapter` against your preferred store:

```ts
class PostgresBoSubscriptionAdapter implements BoSubscriptionAdapter {
  async put(sub) { /* INSERT … ON CONFLICT */ }
  async get(id) { /* SELECT */ }
  async list(filter) { /* SELECT WHERE */ }
  async remove(id) { /* DELETE */ }
}
```

## License

MIT © Nazareno Clemente
