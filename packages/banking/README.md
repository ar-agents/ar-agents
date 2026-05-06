# @ar-agents/banking

> Argentine banking primitives for [Vercel AI SDK 6+](https://sdk.vercel.ai) agents — CBU/CVU validation, bank/PSP lookup, and BCRA Central de Deudores.

[![npm](https://img.shields.io/npm/v/@ar-agents/banking?color=blue)](https://npm.im/@ar-agents/banking) ![bundle](https://img.shields.io/badge/brotli-6.2%20KB-success) ![tests](https://img.shields.io/badge/tests-45%20passing-success) ![license](https://img.shields.io/badge/license-MIT-blue)

Built for agents that need to:

- **Validate CBUs/CVUs** before initiating transfers (catch typos before they cost you a chargeback)
- **Identify the bank or PSP** behind a CBU (Galicia, Nación, Mercado Pago, Ualá, Naranja X…)
- **Check BCRA credit situation** for B2B counterparty risk (factoring, supplier onboarding)

Ships with **pure-algorithm tools that always work** (no API key, no setup) and a **pluggable BCRA adapter** for credit lookups.

---

## Install

```bash
pnpm add @ar-agents/banking
# peer deps: ai >=6, zod >=3
```

## Quick start

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { bankingTools, BcraPublicApiAdapter } from "@ar-agents/banking";

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: bankingTools({
    bcra: new BcraPublicApiAdapter(), // optional — for credit lookups
  }),
  stopWhen: stepCountIs(6),
});

const { text } = await agent.generate({
  prompt: "Validá este CBU: 0070123145678901234564",
});
// → "Es un CBU válido. Banco: Banco Galicia, sucursal 0123, cuenta 4567890123456."
```

Without a BCRA adapter, the credit-lookup tool stays callable but returns
`{ available: false, error: "<setup instructions>" }` instead of crashing.

---

## Tools

| Tool                       | Pure? | What it does                                             |
| -------------------------- | ----- | -------------------------------------------------------- |
| `validate_cbu`             | ✓     | Validate CBU/CVU + identify bank/PSP                     |
| `lookup_bank_by_code`      | ✓     | Resolve a 3-digit bank code or 7-digit CVU prefix → name |
| `list_banks`               | ✓     | Enumerate all known banks (for dropdowns)                |
| `list_psps`                | ✓     | Enumerate all known PSPs/fintechs (for dropdowns)        |
| `lookup_credit_situation`  | —     | BCRA Central de Deudores lookup (requires adapter)       |

See [AGENTS.md](./AGENTS.md) for detailed selection guidance and result schemas.

---

## CBU/CVU algorithm

CBU = Clave Bancaria Uniforme (traditional bank accounts).
CVU = Clave Virtual Uniforme (PSPs / fintechs / digital wallets).

Both are 22 digits with the BCRA dual mod-10 check-digit algorithm:

- **Block 1 (8 digits)**: `BBB-SSSS-V₁` — entity (3) + branch (4) + check (1)
- **Block 2 (14 digits)**: `<account-13>-V₂` — account (13) + check (1)

The algorithm is implemented in `src/cbu.ts` and exposed via `parseCbu()`,
`isValidCbu()`, and `computeBlockCheckDigit()`. Pure functions, sub-millisecond,
no I/O.

---

## BCRA Central de Deudores

For B2B agents that need credit-risk signal on a counterparty CUIT:

```ts
import { bankingTools, BcraPublicApiAdapter } from "@ar-agents/banking";

const tools = bankingTools({
  bcra: new BcraPublicApiAdapter({
    requestTimeoutMs: 15_000,
    maxRetries: 2,
    onCall: (e) => console.log(e), // observability hook
  }),
});
```

The default adapter hits BCRA's public REST endpoint
(`api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/{cuit}`) — no auth required,
respect their rate limits. You can swap in your own adapter for caching, NOSIS,
Equifax, or a private mirror.

Returns a normalized `BcraDeudaResult` with the worst situation code (1–6),
total outstanding debt across all entities, and per-entity breakdown.

See `BcraSituation` in [`src/types.ts`](./src/types.ts) for the situation-code
reference (1=normal, 5=irrecuperable, etc.).

---

## License

MIT © Nazareno Clemente
