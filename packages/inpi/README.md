# @ar-agents/inpi

> INPI (Argentine trademark registry) lookups for AI agents.

```sh
pnpm add @ar-agents/inpi
```

```ts
import { inpiTools, HttpInpiAdapter } from "@ar-agents/inpi";

const tools = inpiTools({ adapter: new HttpInpiAdapter() });
```

## Tools

- `inpi_search_trademark` — substring + class/status filter, paginated
- `inpi_get_trademark` — single record by acta

See [AGENTS.md](./AGENTS.md) for runtime rules (Nice classes, status
enum, etc.). MIT.
