# @ar-agents/anses

> ANSES (Argentine social-security) lookups for AI agents.

```sh
pnpm add @ar-agents/anses
```

```ts
import { ansesTools, InMemoryAnsesAdapter } from "@ar-agents/anses";

const tools = ansesTools(/* adapter: yourHttpAdapter */);
```

## Tools

- `anses_get_cuil_status` — activo / jubilado / pensionado / etc.
- `anses_get_family_allowances` — AUH, AUE, SUAF, etc.
- `anses_get_minimo_jubilatorio` — haber mínimo for a given month

See [AGENTS.md](./AGENTS.md) for the status enum + family-allowance kinds. MIT.
