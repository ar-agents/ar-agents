# @ar-agents/suss

SUSS / payroll agent toolkit for the Vercel AI SDK 6+. Pure calculator for employer-side contributions (jubilación, INSSJP, asignaciones familiares, ART, obra social) per **F.931 / SICOSS**. Per-employee math + monthly DDJJ aggregation. No AR-payroll-agent lib exists today; this is v0.1 of that.

```sh
pnpm add @ar-agents/suss
```

## What's inside

- **`calculateEmployeeMonth(args)`** — per-employee monthly aportes + contribuciones with the F.931 vector breakdown (Seguridad Social / Obra Social / ART).
- **`buildSicossDdjj({ period, employerCuit, employees })`** — monthly DDJJ assembly with totals + per-vector + per-employee detail.
- **Two régimenes baked in**: `general` (Decreto 814/01, ~18% SS) and `grandes_empleadores` (Decreto 1009/01, ~20.4% SS). `promocion_empleo` is reserved as a regime code; the caller applies external reductions on top.
- **Three Vercel AI SDK tools**: `suss_calculate_employee_month`, `suss_build_ddjj`, `suss_submit_ddjj` (adapter contract, v0.1 stub).

## Quick start

```ts
import { calculateEmployeeMonth, buildSicossDdjj } from "@ar-agents/suss";

// Per-employee
const r = calculateEmployeeMonth({
  employee: {
    cuil: "20-11111111-0",
    period: "2026-01",
    remuneracionBrutaCentavos: 100_000_000, // ARS 1.000.000 brutos
  },
});

console.log(r.contribuciones.total); // 28_310_000 = ARS 283.100 (régimen general 28.31%)
//   jubilación:               10_170_000 (10.17%)
//   inssjp:                    1_500_000 (1.5%)
//   asignaciones familiares:   4_700_000 (4.7%)
//   fne:                         940_000 (0.94%)
//   obra social:               6_000_000 (6%)
//   art:                       5_000_000 (5% default)

// Monthly DDJJ
const ddjj = buildSicossDdjj({
  period: "2026-01",
  employerCuit: "30-50000001-8",
  employees: [
    { cuil: "20-11111111-0", period: "2026-01", remuneracionBrutaCentavos: 100_000_000 },
    { cuil: "20-22222222-0", period: "2026-01", remuneracionBrutaCentavos:  50_000_000 },
  ],
});

console.log(ddjj.totals.remitirCentavos); // what the employer remits this month
console.log(ddjj.byVector);              // { seguridadSocial, obraSocial, art }
```

Wired as agent tools:

```ts
import { Experimental_Agent as Agent } from "ai";
import { sussTools } from "@ar-agents/suss";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new Agent({
  model: anthropic("claude-sonnet-4-7"),
  tools: sussTools(), // 3 tools
  system: "Sos un agente de payroll para SaaS argentino.",
});
```

## ART rate

ART rates are NOT a fixed % — they're negotiated per employer / per activity with the ART provider. The default is 5%; override per-employee or per-DDJJ via `artRate` / `defaultArtRate`:

```ts
calculateEmployeeMonth({
  employee: { /* ... */ },
  artRate: 0.072, // 7.2% from your ART contract
});
```

## What this package does NOT do (v0.1)

- **SICOSS file generation + submission.** The actual fixed-width F.931 / SI.AP.RE upload needs a WSAA-authenticated XML pipeline. v0.1 ships the math + DDJJ assembly; v0.2 plans the upload adapter.
- **Asignaciones Familiares per-employee calc.** AAFF is delegated to ANSES (not paid by employer; the employer just reports). The 4.7% / 5.4% in this package is the EMPLOYER contribution that funds the FUSA, not the per-employee benefit.
- **Promoción de empleo reductions.** Ley 27.430 + posteriores. The `promocion_empleo` regime code is reserved but the v0.1 surface doesn't model the reduction matrix — apply external bonificación on top.
- **Régimen de Casas Particulares** (Ley 26.844). Different rate matrix; out of scope for v0.1.
- **Régimen rural**. Same — out of scope.

## Errors

```ts
import {
  SussError,
  SussValidationError,    // bad input
  SussUnconfiguredError,  // adapter not wired
} from "@ar-agents/suss";
```

## Constraints

- **Centavos** for all amounts.
- **`period` is YYYY-MM**.
- **CUIL is 11 digits** (hyphens optional).
- **Rates as fractions** (0.1017 = 10.17%).

For LLM agents using these tools, see [AGENTS.md](./AGENTS.md).

## License

MIT — Nazareno Clemente <naza@naza.ar>
