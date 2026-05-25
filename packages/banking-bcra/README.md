# @ar-agents/banking-bcra

BCRA Central de Deudores agent toolkit for the Vercel AI SDK 6+. Read-only credit-history lookup for Argentine CUITs against BCRA's public Central de Deudores + ChequesRechazados endpoints. **The B2B credit-check default before extending any non-trivial line of credit.**

```sh
pnpm add @ar-agents/banking-bcra
```

## What's inside

- **`HttpBcraAdapter`** — real adapter against the public BCRA host (`api.bcra.gob.ar`). No auth, no key, no token. BCRA enforces ~100 req/min at their edge — use middleware to throttle if you're bulk-checking.
- **`InMemoryBcraAdapter`** — deterministic seeded adapter for tests. Returns `BcraNotFoundError` for unseeded CUITs (BCRA-realistic semantics).
- **`UnconfiguredBcraAdapter`** — explicit throwing default.
- **`summarizeDebt` + `riskBand`** — pure helpers that turn the multi-row BCRA response into a single risk band ready to gate on.
- **4 Vercel AI SDK tools** — `bcra_get_debt`, `bcra_get_debt_summary` (the one you want), `bcra_get_historical_debt`, `bcra_get_bounced_checks`.

## Quick start

```ts
import { HttpBcraAdapter, bcraTools, riskBand, summarizeDebt } from "@ar-agents/banking-bcra";

const bcra = new HttpBcraAdapter();

// Direct: one CUIT, one risk band.
const raw = await bcra.getDebt("30-50000001-8");
const summary = summarizeDebt(raw);
const band = riskBand(summary);
//   "clean" → no records or zero entidades
//   "low"   → worst situación ≤ 2, no flags
//   "watch" → situación = 3 OR refinanciaciones
//   "high"  → situación ≥ 4 OR proceso judicial / fraude

if (band === "high") refuseCredit();

// As agent tools:
import { Experimental_Agent as Agent } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new Agent({
  model: anthropic("claude-sonnet-4-7"),
  tools: bcraTools({ adapter: bcra }),
  system: "Eres un agente de credit underwriting para SaaS B2B argentino.",
});
```

## The situación scale (BCRA convention)

| situación | meaning |
|----------:|---------|
| 1 | Normal |
| 2 | Riesgo bajo / con seguimiento especial |
| 3 | Problemas potenciales |
| 4 | Con alto riesgo de insolvencia |
| 5 | Irrecuperable |
| 6 | Irrecuperable por disposición técnica |

Lower is better. Each entidad reports independently; the BCRA aggregates monthly. The `worstSituacion` field in `DebtSummary` is the max across all reporting entidades — the right number to gate on.

## Important: 404 = "clean", not an error

BCRA returns HTTP 404 for CUITs they have no records on. **This is the BEST possible answer for a credit check** — the taxpayer has never been reported as a debtor. The adapter translates 404 into `BcraNotFoundError` so it's distinguishable from a 5xx, but in your business logic treat it as the "clean" branch:

```ts
try {
  const summary = await bcra.getDebt(cuit);
  return riskBand(summarizeDebt(summary));
} catch (err) {
  if (err instanceof BcraNotFoundError) return "clean";
  throw err;
}
```

## Errors

```ts
import {
  BcraError,
  BcraValidationError,    // bad CUIT shape, do NOT retry
  BcraNotFoundError,      // 404 — treat as "clean", NOT a failure
  BcraApiError,           // non-404 non-2xx — 5xx/429 are retryable
  BcraUnconfiguredError,
} from "@ar-agents/banking-bcra";
```

## Constraints

- **`montoEnMiles`** is in ARS thousands per BCRA convention. `entryAmountCentavos()` + `summarizeDebt().totalCentavos` convert to centavos for unit-consistent math.
- **`periodo` is YYYYMM** (BCRA wire format).
- **No auth** — the API is public. Don't add an Authorization header; the adapter doesn't.

## License

MIT — Nazareno Clemente <naza@naza.ar>
