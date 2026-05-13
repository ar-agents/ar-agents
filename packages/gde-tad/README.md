# @ar-agents/gde-tad

[![npm version](https://img.shields.io/npm/v/@ar-agents/gde-tad.svg)](https://www.npmjs.com/package/@ar-agents/gde-tad)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![SLSA](https://img.shields.io/badge/SLSA-v1-success)](https://slsa.dev)

> TAD (Trámites a Distancia) + GDE (Gestión Documental Electrónica) primitives for the Vercel AI SDK. The **4th pieza** for sociedades-IA — RFC-001 § 3.4.

## What this is

[Trámites a Distancia](https://tramitesadistancia.gob.ar) is the AR national portal where citizens and businesses file federal-government forms — IGJ inscriptions, AFIP padron updates, ministry-level authorizations, etc.

GDE (Gestión Documental Electrónica) is the back-office system that holds the resulting expediente. From an agent's POV the relevant surfaces are:

- **Domicilio Electrónico Constituido (DEC)** — every legally-registered AR business has a DEC. Notifications from any federal organism (ARCA, IGJ, AFIP, Aduana, Trabajo, ANSES) are delivered here.
- **Mis Trámites** — read-only listing of all expedientes the authenticated identity is a party to.
- **Pre-flight schemas** — local validation of IGJ inscription payloads, catching the ~30% of rejections that are mechanical.

## What this is NOT (yet)

Write-side operations (filing trámites programmatically) are intentionally NOT exposed yet. The legal liability surface is too large until RFC-001 § 3.4 lands. This package is the moat: nobody else has even shipped this much.

## Install

```bash
pnpm add @ar-agents/gde-tad
```

## Quick start

```ts
import { Experimental_Agent as Agent } from "ai";
import { gdeTadTools } from "@ar-agents/gde-tad";

const agent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  tools: { ...gdeTadTools() },
});

await agent.generate({
  prompt:
    "Validá esta inscripción IGJ antes de mandarla: SAS llamada 'ACME-AI', " +
    "sede en Florida 100 CABA C1005AAA, capital 200000, objeto 'desarrollo " +
    "de software propio', un constituyente con CUIT 20-12345678-9 que aporta 200000.",
});
```

The `validate_igj_inscription` tool runs locally — no network, no auth. It catches:

- Reserved words in the denominación (e.g., "Nacional", "Estatal")
- Capital below the legal minimum for the chosen tipo societario
- Aportes that don't sum to the capital social
- Malformed CUITs
- Missing sede fields
- Genérico-style objetos that IGJ rejects

## Reading the DEC inbox

When you have a TAD-issued cert + the appropriate per-organism contract:

```ts
import { gdeTadTools } from "@ar-agents/gde-tad";
import { MyDomicilioAdapter, MyTramitesAdapter } from "./my-adapters";

const tools = gdeTadTools({
  domicilio: new MyDomicilioAdapter({ cert, key }),
  tramites: new MyTramitesAdapter({ cert, key }),
});

await agent.generate({
  prompt: "Cuáles son las notificaciones críticas que necesito responder esta semana?",
});
```

Built-in `computeSeverity` heuristic flags:

- **critical** — intimaciones, baja de inscripción, clausura, multa, sanción, audiencia, traslado
- **important** — resoluciones, providencias, vencimientos próximos
- **info** — acuse de recibo, notificaciones de cortesía, circulares

## Testing

```ts
import { MockDomicilioAdapter, mockCriticalIntimacionArca } from "@ar-agents/gde-tad/testing";
import { gdeTadTools } from "@ar-agents/gde-tad";

const domicilio = new MockDomicilioAdapter().seedNotifications("20111111119", [
  mockCriticalIntimacionArca(),
]);

const tools = gdeTadTools({ domicilio });
```

## RFC-001 reference

Full pieza-4 governance plan in [RFC-001 § 3.4](https://ar-agents.ar/rfcs/001).

## License

MIT © Nazareno Clemente
