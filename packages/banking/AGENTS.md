# AGENTS.md: @ar-agents/banking

> Runtime guidance for LLM agents that load this toolkit. Convention per [agents.md](https://agents.md/).

This file is shipped in the npm tarball so agents can read it at runtime.
Keep it short, deterministic, and oriented toward tool-selection decisions.

---

## What this package does

Provides 5 Vercel AI SDK tools for Argentine banking operations:

1. **`validate_cbu`**: pure-algorithm CBU/CVU validation
2. **`lookup_bank_by_code`**: entity-code → bank/PSP name lookup
3. **`list_banks`**: enumerate known traditional banks
4. **`list_psps`**: enumerate known fintechs (Mercado Pago, Ualá, etc.)
5. **`lookup_credit_situation`**: BCRA Central de Deudores (adapter-required)

Tools 1–4 are pure functions (no I/O, no setup, sub-millisecond, free).
Tool 5 hits an external service via a pluggable adapter.

---

## Tool selection cheatsheet

| User intent                                          | Use this                  |
| ---------------------------------------------------- | ------------------------- |
| "Validá este CBU"                                    | `validate_cbu`            |
| "¿De qué banco es esta cuenta?"                      | `validate_cbu` (returns bank inline) |
| "¿Qué banco es el código 011?"                       | `lookup_bank_by_code`     |
| "Mostrame todos los bancos"                          | `list_banks`              |
| "¿Qué fintechs están disponibles?"                   | `list_psps`               |
| "Tiene este CUIT antecedentes en BCRA?"              | `lookup_credit_situation` |

---

## Result schemas (memorize these)

### `validate_cbu` returns:

```ts
{
  valid: boolean,           // bottom line
  normalized: string,       // 22 bare digits
  formatted: string | null, // "BBBSSSSV-AAAAAAAAAAAAA V" with hyphen
  entityCode: string | null,    // "007", "011", "000", etc.
  branchCode: string | null,    // "0123": sucursal
  accountNumber: string | null, // 13-digit account number
  block1CheckDigit: string | null,
  block2CheckDigit: string | null,
  kind: "cbu" | "cvu" | "unknown",
  bank: { code, name, shortName, kind } | null,
  error: string | null      // Spanish, surface verbatim if invalid
}
```

When invalid, `error` explains WHY (typo in block 1 vs block 2, wrong length,
empty input). Surface this to the user verbatim: it's actionable.

### `lookup_credit_situation` returns:

```ts
{
  cuit: string,
  available: boolean,       // false when not configured or CUIT not in BCRA
  error: string | null,     // Spanish, surface verbatim
  data: {
    name: string,
    period: string,         // "YYYYMM"
    worstSituation: 0|1|2|3|4|5|6,  // headline risk score
    totalAmount: number,    // ARS
    entities: Array<{
      entity: string,
      situation: 0|1|2|3|4|5|6,
      amount: number,
      daysOverdue: number,
      refinanced: boolean,
      inReview: boolean,
      inLitigation: boolean,
    }>,
  } | null,
  worstSituationDescription: string | null,  // Spanish helper
}
```

**BCRA situation codes**:

- **0** → no debt reported in this period
- **1** → normal (al día)
- **2** → riesgo bajo (<90 days overdue)
- **3** → riesgo medio (90–180 days)
- **4** → riesgo alto (180–365 days)
- **5** → irrecuperable (365+ days)
- **6** → irrecuperable por disposición técnica (rare admin write-off)

---

## When to chain tools

- **Always** call `validate_cbu` before initiating any transfer-related action.
  An invalid CBU costs you a chargeback or hard rejection downstream.

- For credit checks, **always** call `validate_cuit` (from `@ar-agents/identity`)
  before `lookup_credit_situation`: BCRA returns 404 for malformed CUITs and
  you wasted a network round-trip.

- For CVU lookups, the entity code 000 doesn't tell you which fintech: but
  `validate_cbu` already calls `lookupCvuByPrefix` internally and returns
  `bank.shortName = "Mercado Pago"` (or whichever PSP). Don't call
  `lookup_bank_by_code` separately.

---

## Latency expectations

| Tool                       | p50      | p95       | Network call?  |
| -------------------------- | -------- | --------- | -------------- |
| `validate_cbu`             | <1 ms    | <2 ms     | No             |
| `lookup_bank_by_code`      | <1 ms    | <2 ms     | No             |
| `list_banks`               | <1 ms    | <2 ms     | No             |
| `list_psps`                | <1 ms    | <2 ms     | No             |
| `lookup_credit_situation`  | ~600 ms  | ~2.5 s    | Yes (BCRA)     |

The pure tools are essentially free: call them liberally. The credit lookup
is rate-limited by BCRA's public infra; cache results when you can.

---

## Argentina context (for agents not built around AR)

- **CBU vs CVU**: CBU = traditional bank account, CVU = digital wallet
  (Mercado Pago, Ualá, etc.). Format is identical; the entity-code prefix
  distinguishes them. Both can receive transfers from any other CBU/CVU.
- **Alias CBU**: 6–20 character human-readable aliases (e.g.,
  `naza.galicia.ahorro`) that map to a CBU. NOT validated by this lib;
  alias lookups require a bank-side API and aren't part of v0.1.
- **BCRA Central de Deudores**: monthly snapshot of every credit obligation
  in the AR financial system. Public, no auth. Updates ~1 month delayed.

---

## Errors

All errors extend `BankingError` with a machine-readable `code`:

- `bcra_not_configured`: adapter wasn't passed to `bankingTools()`
- `bcra_cuit_not_found`: BCRA has no record (CUIT may be valid but unused)
- `bcra_service_unavailable`: BCRA endpoint returned 5xx
- `bcra_rate_limited`: BCRA returned 429
- `bcra_unknown_error`: fallback

Surface the `.message` to end users; switch on `.code` for programmatic flows.
