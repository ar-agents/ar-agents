# @ar-agents/cnv-emisor

> CNV (Argentine SEC) issuer disclosures for AI agents.

```sh
pnpm add @ar-agents/cnv-emisor
```

```ts
import { cnvTools, InMemoryCnvAdapter } from "@ar-agents/cnv-emisor";

const tools = cnvTools(/* adapter: yourHttpAdapter */);
```

## Tools

- `cnv_get_issuer` — issuer metadata
- `cnv_list_hechos_relevantes` — material-fact filings (with category + since filter)
- `cnv_list_financial_statements` — annual / quarterly / intermediate financials

See [AGENTS.md](./AGENTS.md) for codes + category enums. MIT.
