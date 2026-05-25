# `@ar-agents/banking-bcra` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools for **BCRA Central de Deudores** — the canonical credit-history lookup for Argentine CUITs. Read-only, public, no auth required.

## When to use which tool

| Goal                                          | Tool                          | Notes                                         |
| --------------------------------------------- | ----------------------------- | --------------------------------------------- |
| Should we extend credit to this CUIT?         | `bcra_get_debt_summary`       | One-shot summary + risk band. Default choice. |
| Detailed per-entidad debt breakdown           | `bcra_get_debt`               | Raw entries when the agent does its own scoring. |
| Has this CUIT been deteriorating over time?   | `bcra_get_historical_debt`    | 24-month trend.                                |
| Bounced checks (independent signal)           | `bcra_get_bounced_checks`     | Bad signal even if debt record looks clean.   |

## The single most important rule

**A 404 response (`BcraNotFoundError`) means the taxpayer has NEVER been reported as a debtor. This is the BEST POSSIBLE outcome of a credit check.** Treat it as "clean", not as an error. Most agents will want to catch and translate:

```ts
try {
  const r = await tools.bcra_get_debt_summary.execute({ cuit });
  // …
} catch (err) {
  if (err.code === "not_found") return { riskBand: "clean" };
  throw err;
}
```

## Constraints

- **CUIT is 11 digits** (hyphens optional; adapter strips them).
- **`montoEnMiles`** in the raw response is in ARS thousands per BCRA convention. The summary helper converts to centavos.
- **`situacion` is 1-6, lower is better** (1 = normal, 6 = irrecuperable).
- **No auth.** Public API.

## Decision tree on the risk band

- `clean` → no records OR all entidades reporting situación 1 with no flags. Default-approve.
- `low` → worst situación ≤ 2, no judicial/fraude flags. Approve with normal terms.
- `watch` → situación = 3 OR has refinanciaciones. Approve with shorter terms / collateral / co-signer.
- `high` → situación ≥ 4 OR proceso judicial OR situación de fraude. Default-refuse; escalate to operator if business needs override.

## Confirmation gates (HITL)

None. All four tools are read-only.

## Error model

- `BcraValidationError` — bad CUIT shape. Do NOT retry the same call.
- `BcraNotFoundError` — 404. **NOT a failure** — taxpayer is unreported. Treat as "clean".
- `BcraApiError` — non-404 non-2xx. `retryable: true` for 5xx + 429. Backoff and retry.
- `BcraUnconfiguredError` — adapter not wired. Surface to operator.

## AR context (for non-AR agents)

- **BCRA = Banco Central de la República Argentina** (the Argentine central bank). The Central de Deudores is their public registry of every CUIT that's been reported as a debtor by any regulated financial entity.
- **Entidad ids** are stable across time and well-known. 11 = Banco Nación, 14 = Banco Provincia, etc. The list lives at <https://www.bcra.gob.ar/SistemasFinancierosYdePagos/Entidades_financieras.asp>.
- **Reporting cadence is monthly**. Periodo `202601` means "as of January 2026 month-end report".

## What this package does NOT cover (v0.1)

- **Sub-CUIL lookup** (individuals via CUIL, not CUIT). The BCRA endpoint takes only CUITs in v0.1; sub-CUIL needs the AFIP / Central de Deudores cross-reference.
- **Estado de Cheques** (positive payment record). The package only exposes bounced cheques; the "cheques al día" endpoint is a separate BCRA API.
- **BCRA's other public endpoints** (variables económicas, COMA tasas, etc.). Different package surface; out of scope.
- **Rate limiting against BCRA's edge.** Bring a `withRetry` from `@ar-agents/core` if you're bulk-checking.
