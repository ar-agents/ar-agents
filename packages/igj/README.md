# `@ar-agents/igj`

> Inspección General de Justicia (IGJ) open data as drop-in tools for the Vercel AI SDK 6.

```bash
pnpm add @ar-agents/igj ai zod
```

Part of the [`Arg`](https://ar-agents.vercel.app) toolkit — open infrastructure for the Argentine AI agent jurisdiction.

## Why this exists

When you ask "is ACME S.A. a real Argentine company? who runs it? when was it constituted?", the only authoritative source is IGJ — and there is no documented IGJ API. There is a sample dataset on `datos.jus.gob.ar` (CKAN) that covers a chunk of registered entities, plus their domicilios, balances filed, autoridades, and asambleas. This package wraps that dataset with a typed adapter contract.

The first AR agent infrastructure piece for **sociedad-IA referencing**: when an agent needs to verify a counterparty entity exists, this is the cheapest read-only check before falling back to TAD/portal flows.

> **Critical caveat:** the IGJ dataset is a SAMPLE (`muestreo`). Coverage is incomplete and not real-time. Every result carries a `coverageNote` field — surface it. For authoritative verification, only the IGJ portal (no API) works.

## Quick start

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { igjTools, LiveCkanFetcher } from "@ar-agents/igj";

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: igjTools({ fetcher: new LiveCkanFetcher() }),
  stopWhen: stepCountIs(8),
});

const { text } = await agent.generate({
  prompt: "Buscame entidades constituidas como SAS en 2025. Mostrame nombre y CUIT.",
});
```

## Tool surface

| Tool                     | Purpose                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `igj_search_entities`    | Free-text + filter search over the entity dataset.           |
| `igj_get_entity`         | Single entity by id.                                         |
| `igj_get_domicilios`     | Domicilios (addresses) for an entity.                        |
| `igj_get_autoridades`    | Officers / directors of an entity.                           |
| `igj_get_balances`       | Balance filings filed at IGJ for an entity.                  |
| `igj_get_asambleas`      | Asambleas (general meetings) on record.                      |

All read-only. All return a `coverageNote` describing the dataset's sample/muestreo nature.

## Direct API

```ts
import { LiveCkanFetcher, normalizeEntityType } from "@ar-agents/igj";

const fetcher = new LiveCkanFetcher();
const { results, coverageNote } = await fetcher.search({
  cuit: "30707500129",
});
console.log(coverageNote); // surface this to the user
```

## License

MIT © Nazareno Clemente
