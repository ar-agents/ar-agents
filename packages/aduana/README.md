# @ar-agents/aduana

> ARCA Aduana (formerly AFIP / María) as drop-in tools for the Vercel AI SDK.

Look up Argentine customs declarations by SUSI / KIM / OM number, check the
status of an in-flight despacho, and resolve NCM tariff codes — all from
inside an agent.

## Install

```sh
pnpm add @ar-agents/aduana
```

## Usage

```ts
import { aduanaTools, HttpAduanaAdapter } from "@ar-agents/aduana";

const tools = aduanaTools({ adapter: new HttpAduanaAdapter() });
// Pass `tools` directly to Vercel AI SDK's generateText / streamText.
```

For testing, swap the HTTP adapter for the in-memory one:

```ts
import { InMemoryAduanaAdapter } from "@ar-agents/aduana";

const tools = aduanaTools({
  adapter: new InMemoryAduanaAdapter({
    despachos: [
      {
        identifier: { kind: "SUSI", value: "24001IM4001234A" },
        found: true,
        status: "canalizado_verde",
        operationKind: "IM4",
        ncmCode: "84713010",
      },
    ],
  }),
});
```

## Tools

| Tool | Returns |
|---|---|
| `aduana_lookup_despacho` | Status, operation kind, NCM, registration date, Aduana office. `{found: false}` for unknown IDs — not an error. |
| `aduana_lookup_ncm` | Description, whether currently in force, AEC + DIE percent. |

## Errors

All errors extend `AduanaError` (which extends `ArAgentsError` from
`@ar-agents/core`):

- `AduanaValidationError` — bad input
- `AduanaUnconfiguredError` — adapter not wired (default), see error message
  for setup steps
- `AduanaApiError` — non-2xx HTTP response (retryable for 5xx / 429)

## Status

v0.1 — read-only against the public ARCA REST surface published in 2025.
Write operations (registering a despacho) require WSAA cert handling and
are out of scope for v0.1.

## License

MIT
