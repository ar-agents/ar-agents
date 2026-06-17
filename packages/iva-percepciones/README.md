# @ar-agents/iva-percepciones

IVA perceptions agent toolkit for the Vercel AI SDK 6+. Federal value-added tax perceptions per RG 2408/08 and the most common sub-regimes: per-invoice math (rate × neto, with mínimo + waiver checks) plus monthly SIRE DDJJ assembly.

```sh
pnpm add @ar-agents/iva-percepciones
```

## What this package does

- **Pure math** for IVA perceptions. No network. Unit-testable.
- **RG 2408/08 régimen general** out of the box with current (2024-Q4) rates: 1.5% RI, 3% no-categorizado, 0% monotributista / exento / consumidor final.
- **Buyer-condition gates** — automatic 0 with `waiverReason` for monotributistas, exentos, consumidores finales, and buyers with a non-perception certificate.
- **Mínimo support** — bring your own rate-table for sub-regimes (RG 3337 combustibles, RG 2126 servicios) that have a non-zero threshold.
- **DDJJ assembly** — `buildPerceptionDdjj` rolls a list of perception results into per-regime + per-buyer breakdowns ready for SIRE.

## What this package does NOT do (v0.1)

- **Submit SIRE DDJJ to AFIP/ARCA.** Adapter contract only; ship your own credentialed adapter for actual submission.
- **Sub-regime rates baked-in.** RG 3337 (combustibles) and RG 2126 (servicios) get a stub regime code but no default table. Pass your own `rateTable`.
- **Provincial perceptions.** Those are IIBB perceptions — use `@ar-agents/iibb`.
- **Customs-stage IVA.** Régimen de pagos a cuenta en aduana is a different beast.

## Quick start

```ts
import { calculatePerception } from "@ar-agents/iva-percepciones";

const r = calculatePerception({
  regime: "rg_2408_general",
  buyerCondition: "responsable_inscripto",
  buyerCuit: "20-12345678-9",
  netCentavos: 10_000_000, // ARS 100.000
  operationDate: "2026-01-15",
});
console.log(r.perceptionCentavos); // 150_000 = ARS 1.500
```

Wired as agent tools:

```ts
import { Experimental_Agent as Agent } from "ai";
import { ivaPerceptionTools } from "@ar-agents/iva-percepciones";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new Agent({
  model: anthropic("claude-sonnet-4-7"),
  tools: ivaPerceptionTools(), // 3 tools
  system: "Eres un contador asistente.",
});
```

## Monthly SIRE DDJJ

```ts
import {
  calculatePerception,
  asEntry,
  buildPerceptionDdjj,
} from "@ar-agents/iva-percepciones";

const r1 = calculatePerception({ /* ... */ });
const r2 = calculatePerception({ /* ... */ });

const ddjj = buildPerceptionDdjj({
  period: "2026-01",
  agentCuit: "20-12345678-6",
  entries: [asEntry("FA-A-001", r1), asEntry("FA-A-002", r2)],
});
// ddjj.totals: { netCentavos, perceptionCentavos, entryCount }
// ddjj.byRegime
// ddjj.byBuyer (sorted by perception desc)
```

## Errors

```ts
import {
  IvaPerceptionError,
  IvaPerceptionValidationError,
  IvaPerceptionRateNotFoundError,
  IvaPerceptionUnconfiguredError,
} from "@ar-agents/iva-percepciones";
```

## Constraints

- **Centavos** for all amounts. No floats.
- **Rates are fractions** (0.015 = 1.5%).
- **`operationDate` is YYYY-MM-DD**, `period` is YYYY-MM.
- **CUIT is 11 digits** (hyphens optional).

For LLM agents using these tools, see [AGENTS.md](./AGENTS.md).

## License

MIT — Nazareno Clemente <naza@naza.ar>
