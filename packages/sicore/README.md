# @ar-agents/sicore

SICORE / Ganancias retention agent toolkit for the Vercel AI SDK 6+. Federal income tax withholding per RG 830/00: per-payment math with the monthly accumulator + already-retained credit, plus DDJJ assembly for the 4 most common operation types (servicios, honorarios, bienes, alquileres).

```sh
pnpm add @ar-agents/sicore
```

## What this package does

- **Pure math** for RG 830/00 retentions. No network. Unit-testable.
- **Monthly accumulator + already-retained credit** built in — the algorithm AFIP actually checks against, not the naive "rate × payment" that overcollects on big invoices and undercollects when payments straddle the mínimo.
- **4 operation types covered out of the box** with current (2024-Q4) mínimos no imponibles + scales:
  - `servicios` — Locaciones de obra y/o servicios (Anexo II 36).
  - `honorarios` — Honorarios profesionales con escala progresiva (Anexo II 28).
  - `bienes` — Compraventa de cosas muebles (Anexo II 78).
  - `alquileres` — Locaciones de inmuebles urbanos (Anexo II 49).
- **DDJJ assembly** — `buildSicoreDdjj` rolls a list of retention results into per-category and per-supplier breakdowns ready to file.

## What this package does NOT do (v0.1)

- **Submit DDJJ to AFIP/ARCA.** SICORE upload is XML over WSAA. v0.1 ships only the contract + `UnconfiguredSicoreAdapter`; wire your own credentialed adapter to actually submit.
- **The other ~80 Anexo II categories.** Intereses, honorarios de directorio, locaciones rurales, etc. Add via custom rate-table (the calc layer takes any `SicoreRateEntry[]`).
- **Annual readjustments to mínimos** beyond 2024-Q4. Pass `rateTable` override when filing for older / newer periods.
- **IVA, IIBB, SUSS retentions.** This package only handles Ganancias.

## Quick start

```ts
import { calculateRetention } from "@ar-agents/sicore";

// Single payment, inscripto, services
const r = calculateRetention({
  category: "servicios",
  status: "inscripto",
  supplierCuit: "20-12345678-9",
  paymentCentavos: 10_000_000, // ARS 100.000
  paymentDate: "2026-01-15",
});
console.log(r.retentionAmountCentavos); // 65660 centavos = ARS 656,60
```

Monthly stream for a single supplier:

```ts
import { calculateRetentionStream } from "@ar-agents/sicore";

const results = calculateRetentionStream([
  {
    category: "servicios",
    status: "inscripto",
    supplierCuit: "20-12345678-9",
    paymentCentavos: 3_000_000,
    paymentDate: "2026-01-05",
  },
  {
    category: "servicios",
    status: "inscripto",
    supplierCuit: "20-12345678-9",
    paymentCentavos: 3_000_000,
    paymentDate: "2026-01-15",
  },
  {
    category: "servicios",
    status: "inscripto",
    supplierCuit: "20-12345678-9",
    paymentCentavos: 3_000_000,
    paymentDate: "2026-01-25",
  },
]);
// First two payments retain 0 (below mínimo). Third retains the catch-up.
```

Wired as agent tools:

```ts
import { Experimental_Agent as Agent } from "ai";
import { sicoreTools } from "@ar-agents/sicore";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new Agent({
  model: anthropic("claude-sonnet-4-7"),
  tools: sicoreTools(), // 4 tools: calculate_retention, ..._stream, build_ddjj, submit_ddjj
  system: "Eres un contador asistente para sociedades-IA argentinas.",
});
```

## Monthly DDJJ

```ts
import {
  calculateRetention,
  asEntry,
  buildSicoreDdjj,
} from "@ar-agents/sicore";

const r1 = calculateRetention({ /* ... */ });
const r2 = calculateRetention({ /* ... */ });

const ddjj = buildSicoreDdjj({
  period: "2026-01",
  agentCuit: "20-12345678-6",
  entries: [
    asEntry("FA-A-001", r1),
    asEntry("FA-A-002", r2),
  ],
});
// ddjj.totals: { paymentCentavos, retentionCentavos, entryCount }
// ddjj.byCategory: per-category roll-up
// ddjj.bySupplier: per-supplier roll-up sorted by amount retained
```

## Errors

```ts
import {
  SicoreError,
  SicoreValidationError,    // bad input
  SicoreRateNotFoundError,  // table missing the category/status pair
  SicoreUnconfiguredError,  // adapter not wired
} from "@ar-agents/sicore";
```

## Constraints (quick reference)

- **Centavos** for all amounts (ARS integers). No floats.
- **Rates are fractions** (0.06 = 6%). Never percentages.
- **`paymentDate` is YYYY-MM-DD**, period is YYYY-MM.
- **CUIT is 11 digits** (hyphens optional; normalized to 11-digit on output).

For LLM agents using these tools, see [AGENTS.md](./AGENTS.md).

## License

MIT — Nazareno Clemente <naza@naza.ar>
