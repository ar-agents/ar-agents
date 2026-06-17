# @ar-agents/iva-retenciones

IVA retention agent toolkit for the Vercel AI SDK 6+. Federal value-added tax retentions per RG 2854/10: per-payment math (rate × IVA, with mínimo + waiver checks) plus monthly SIRE DDJJ assembly.

The mirror of [`@ar-agents/iva-percepciones`](../iva-percepciones): percepción is buyer-pays-more; retención is supplier-takes-home-less.

```sh
pnpm add @ar-agents/iva-retenciones
```

## What this package does

- **Pure math** for IVA retentions. No network. Unit-testable.
- **RG 2854/10 régimen general** out of the box with current (2024-Q4) rates: 80% on cosas muebles (RI), 50% on servicios + locaciones de inmuebles (RI), 100% on no-categorizado, 0% on monotributista / exento.
- **Operation-type aware** — separate rates for `servicios` / `cosas_muebles` / `locaciones_inmuebles`.
- **Supplier-status gates** — automatic 0 with `waiverReason` for monotributistas, exentos, and suppliers with a non-retention certificate.
- **Mínimo support** — $5.000 IVA per comprobante for RI under the régimen general. Override via `RetentionInput.rateTable` for other regimes.
- **DDJJ assembly** — `buildRetentionDdjj` rolls a list of retention results into per-regime + per-supplier breakdowns ready for SIRE.

## What this package does NOT do (v0.1)

- **Submit SIRE DDJJ to AFIP/ARCA.** Adapter contract only.
- **RG 5057 (servicios digitales) baked rates.** Reserved as a regime code; caller passes own `rateTable`.
- **RG 2616 granos / RG 3411 honorarios specials.** Out of scope.
- **Provincial IIBB retentions.** Use `@ar-agents/iibb` for that.

## Quick start

```ts
import { calculateRetention } from "@ar-agents/iva-retenciones";

const r = calculateRetention({
  regime: "rg_2854_general",
  operationType: "servicios",
  supplierStatus: "responsable_inscripto",
  supplierCuit: "20-12345678-9",
  paymentDate: "2026-01-15",
  ivaCentavos: 10_000_000, // ARS 100.000 of IVA on the comprobante
});

console.log(r.retentionCentavos); // 5_000_000 = ARS 50.000 (50% of IVA)
```

Critical: `ivaCentavos` is the IVA component of the comprobante, NOT the net or total. RG 2854 retains a percentage of the IVA, not of the invoice total.

Wired as agent tools:

```ts
import { Experimental_Agent as Agent } from "ai";
import { ivaRetentionTools } from "@ar-agents/iva-retenciones";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new Agent({
  model: anthropic("claude-sonnet-4-7"),
  tools: ivaRetentionTools(), // 3 tools
  system: "Eres un contador asistente que retiene IVA en pagos a proveedores.",
});
```

## Monthly SIRE DDJJ

```ts
import {
  calculateRetention,
  asEntry,
  buildRetentionDdjj,
} from "@ar-agents/iva-retenciones";

const r1 = calculateRetention({ /* ... */ });
const r2 = calculateRetention({ /* ... */ });

const ddjj = buildRetentionDdjj({
  period: "2026-01",
  agentCuit: "20-12345678-6",
  entries: [asEntry("FA-A-001", r1), asEntry("FA-A-002", r2)],
});
```

## Errors

```ts
import {
  IvaRetentionError,
  IvaRetentionValidationError,
  IvaRetentionRateNotFoundError,
  IvaRetentionUnconfiguredError,
} from "@ar-agents/iva-retenciones";
```

## Constraints

- **Centavos** for all amounts. No floats.
- **Rates are fractions** (0.5 = 50%).
- **`paymentDate` is YYYY-MM-DD**, `period` is YYYY-MM.
- **`ivaCentavos` is IVA only**, not total. Easy to confuse with `iva-percepciones` where `netCentavos` is the net.
- **CUIT is 11 digits**.

For LLM agents using these tools, see [AGENTS.md](./AGENTS.md).

## License

MIT — Nazareno Clemente <naza@naza.ar>
