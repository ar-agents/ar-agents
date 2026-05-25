# @ar-agents/dnrpa

> Argentine vehicle plate (dominio) lookups for AI agents.

## Install

```sh
pnpm add @ar-agents/dnrpa
```

## Quick start

```ts
import { dnrpaTools } from "@ar-agents/dnrpa";

const tools = dnrpaTools(/* adapter: yourBrowserAdapter */);
```

⚠ DNRPA has no free REST API. The default adapter throws. Wire a
`BrowserDnrpaAdapter` against the browse runtime of your choice; see
[AGENTS.md](./AGENTS.md) for runtime rules.

## Plate format

| Format | Example | Era |
|---|---|---|
| `LL000LL` | `AB123CD` | Mercosur, post-2016 |
| `LLL000` | `FFF123` | Old Argentine, 1995-2016 |

Hyphens stripped automatically.

## Returns

```ts
{
  dominio: string;
  found: boolean;
  marca?: string;
  modelo?: string;
  anio?: number;
  origen?: "nacional" | "importado" | "mercosur";
  prendaActiva?: boolean;  // mortgage in force?
  baja?: boolean;          // stolen / restricted?
  ultimaTransferencia?: string;
}
```

## License

MIT
