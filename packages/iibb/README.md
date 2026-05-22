# @ar-agents/iibb

Ingresos Brutos (Argentine gross income tax) agent toolkit for the Vercel AI SDK 6+. Pure calculation helpers for retention, perception, and monthly DDJJ assembly across CABA, Provincia de Buenos Aires, and Convenio Multilateral.

```sh
pnpm add @ar-agents/iibb
```

## What this package does

- **Pure math** for retentions, perceptions, and DDJJ assembly. No network, no I/O. Unit-testable.
- **Adapter pattern** for jurisdictional portals (AGIP, ARBA, Comisión Arbitral). v0.1 ships stubs (the jurisdictions don't expose documented public APIs yet); real adapters are on the roadmap.
- **Two regimes**: LOCAL (single jurisdiction) and CONVENIO MULTILATERAL Article 2 (general regime, distribution by coeficiente unificado).

## What this package does NOT do

- **Submit DDJJ** to a real portal. Each jurisdiction requires fiscal-clave-based authentication; submission is left to the adapter, and the v0.1 adapter stubs throw `IibbUnconfiguredError`.
- **Carry rate-books**. Rates change with every annual regulation and per activity (CIIU/NAES). You bring the rate-book; the package does the math.
- **Handle CM special regimes** (Articles 6-13: construction, transport, professionals, etc.). v0.1 covers Article 2 (general regime) only.
- **FX or other-than-ARS currencies**. All amounts are ARS centavos integers.

## Quick start

```ts
import { Experimental_Agent as Agent } from "ai";
import {
  iibbTools,
  RateBook,
  computeDdjj,
  calculateRetention,
} from "@ar-agents/iibb";
import { anthropic } from "@ai-sdk/anthropic";

// Pure: no agent needed.
const result = computeDdjj({
  period: "2026-05",
  regime: "local",
  filerCode: "CABA",
  lines: [
    {
      dateIso: "2026-05-05",
      jurisdiction: "CABA",
      activityCode: "620100", // CIIU/NAES code
      baseImponibleCentavos: 1_000_000, // ARS 10.000
    },
  ],
  rateBook: new RateBook([
    { jurisdiction: "CABA", activityCode: "620100", rate: 0.05 },
  ]),
});

console.log(result.totals.taxDueCentavos); // 50_000 cents (ARS 500)
```

Wired as agent tools:

```ts
const agent = new Agent({
  model: anthropic("claude-sonnet-4-7"),
  tools: iibbTools(), // 4 tools: calc_retention, calc_perception, compute_ddjj, lookup_padron
  system: "Eres un contador asistente para sociedades-IA argentinas.",
});
```

## Convenio Multilateral example

```ts
const result = computeDdjj({
  period: "2026-05",
  regime: "cm",
  filerCode: "CM",
  rateBook,
  cmCoefficients: { CABA: 0.6, BSAS: 0.4 }, // sums to 1.0
  lines: [...],
});
// result.byJurisdiction → [{ jurisdiction: "CABA", ... }, { jurisdiction: "BSAS", ... }]
// result.cmCoefficients echoes back the input.
```

## Errors

```ts
import {
  IibbError,
  IibbUnconfiguredError, // adapter not wired
  IibbValidationError,   // bad input (bad period, mismatched jurisdiction, etc.)
  IibbRateNotFoundError, // rate-book missing an (jurisdiction, activityCode) entry
} from "@ar-agents/iibb";
```

## Constraints (quick reference)

- **Centavos** for all amounts (ARS integers). No floats.
- **Rates are fractions** (0.035 = 3.5%). Never percentages.
- **Period is YYYY-MM**. The validator rejects anything else.
- **CM coefficients sum to 1.0** ±0.001 tolerance.

For LLM agents using these tools, see [AGENTS.md](./AGENTS.md).

## License

MIT — Nazareno Clemente <naza@naza.ar>
