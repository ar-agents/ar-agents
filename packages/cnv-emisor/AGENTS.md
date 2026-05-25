# `@ar-agents/cnv-emisor` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools for **CNV** (Comisión Nacional de Valores) issuer
disclosures — the "Argentine SEC EDGAR" for any agent tracking listed
companies' filings.

## When to use which tool

| Goal | Tool |
|---|---|
| Confirm an issuer exists + what sector / categoría | `cnv_get_issuer` |
| What did this issuer publish in AIF recently? | `cnv_list_hechos_relevantes` |
| Surface this issuer's last N quarterly / annual filings | `cnv_list_financial_statements` |

## Issuer codes

CNV-assigned stable codes (e.g. `YPF`, `GGAL`, `TXAR`, `PAMP`). Distinct
from BYMA tickers, though for the largest issuers they coincide. When
in doubt, search via the AIF web UI first to confirm the code.

## Hechos relevantes categories

Stable enumeration for branching:
- `asamblea` — meeting calls
- `dividendo` — dividend declarations / payment dates
- `estado_financiero` — periodic financials
- `oferta_publica` — public offerings / OPAs
- `cambio_control` — control changes / mergers
- `garantia` — guarantees / pledges
- `otro` — catch-all

## Financial statement kinds

`anual`, `trimestral_q1`, `trimestral_q2`, `trimestral_q3`, `intermedio`.

Q4 numbers are reported as `anual` (Argentine practice).

## Confirmation gates (HITL)

None — v0.1 is read-only.

## Error model

- `CnvValidationError` — bad input
- `CnvUnconfiguredError` — adapter not wired
- `CnvApiError` — non-2xx; `retryable: true` for 5xx + 429

## What this package does NOT cover (v0.1)

- Submitting filings (requires CNV portal account + digital signature)
- Real-time price quotes (BYMA / MAE, separate packages)
- Investor classification (Inversor Calificado, etc.)
- Public-offering prospectus full-text parsing (use `boletin-oficial` or a PDF tool downstream)
