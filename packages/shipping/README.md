# @ar-agents/shipping

> Argentine shipping carriers (Andreani, OCA, Correo Argentino) for [Vercel AI SDK 6+](https://sdk.vercel.ai) agents.

[![npm version](https://img.shields.io/npm/v/@ar-agents/shipping.svg)](https://www.npmjs.com/package/@ar-agents/shipping)
[![npm downloads](https://img.shields.io/npm/dm/@ar-agents/shipping.svg)](https://www.npmjs.com/package/@ar-agents/shipping)
[![license](https://img.shields.io/npm/l/@ar-agents/shipping.svg)](./LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@ar-agents/shipping.svg)](https://bundlephobia.com/package/@ar-agents/shipping)

> **Reading this as an agent?** Skip to [AGENTS.md](./AGENTS.md) for carrier comparison rules, normalized status tables, and AR provincia/CPA context.

## At a glance

| What | Value |
| --- | --- |
| Tools shipped | 6: `cotizar_envio`, `crear_envio`, `consultar_tracking`, `cancelar_envio`, `listar_codigos_postales`, `validar_codigo_postal` |
| Carriers | **Andreani** (full impl), **OCA** (stub: needs corporate API creds), **Correo Argentino** (stub) |
| Status normalization | Carrier-specific status codes mapped to a single lifecycle: `creado` → `en_transito` → `en_distribucion` → `entregado` (or `devuelto` / `cancelado`) |
| AR provincia normalizer | `Buenos Aires` → `B`, `CABA` → `C`, `Tucumán` → `T`, etc.: handles every common spelling |
| Test coverage | 34 unit tests including provincia normalization edge cases |
| Bundle | 6.9 KB ESM brotli'd |
| Runtime | Edge Runtime + Node 18+ |

Built for AR e-commerce agents that need to:

- **Cotizar envíos** comparando Andreani / OCA / Correo en paralelo
- **Crear envíos** y obtener trackingNumber + label PDF
- **Trackear** con normalized lifecycle status across carriers
- **Listar sucursales** cerca de un CPA para dropoff/pickup

Pluggable adapter pattern: el agent no necesita saber con qué carrier está hablando: pasa origen/destino/paquetes y la lib normaliza.

---

## Install

```bash
pnpm add @ar-agents/shipping
# peer deps: ai >=6, zod >=3
```

## Quick start

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import {
  shippingTools,
  AndreaniAdapter,
  OcaAdapter,
  CorreoAdapter,
  MockShippingAdapter,
} from "@ar-agents/shipping";

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: shippingTools({
    adapters: {
      andreani: new AndreaniAdapter({
        username: process.env.ANDREANI_USERNAME!,
        password: process.env.ANDREANI_PASSWORD!,
        clientNumber: process.env.ANDREANI_CLIENT_NUMBER!,
        env: "prod",
      }),
      oca: new OcaAdapter({
        cuit: process.env.OCA_CUIT!,
        operativa: process.env.OCA_OPERATIVA!,
      }),
      correo_argentino: new CorreoAdapter(),
    },
    defaultCarrier: "andreani",
  }),
  stopWhen: stepCountIs(6),
});

const { text } = await agent.generate({
  prompt:
    "Cuál es el envío más barato de un paquete de 2kg desde CABA a Mendoza? Después creálo.",
});
```

The agent will: (1) `cotizar_envio_todos` to compare carriers, (2) `crear_envio` with the cheapest, (3) report tracking number + label URL.

## Without credentials (dev mode)

Use `MockShippingAdapter` for local development:

```ts
import { shippingTools, MockShippingAdapter } from "@ar-agents/shipping";

const agent = new Agent({
  tools: shippingTools({
    adapters: {
      andreani: new MockShippingAdapter("andreani"),
    },
    defaultCarrier: "andreani",
  }),
});
```

The mock returns deterministic responses (cost based on weight, lifecycle based on the last digit of the trackingNumber), perfect for tests + demos.

---

## Tools

| Tool                   | Pure?  | What it does                                              |
| ---------------------- | ------ | --------------------------------------------------------- |
| `cotizar_envio`        |:      | Quote an envío via a specific carrier                     |
| `cotizar_envio_todos`  |:      | Quote in parallel across all configured carriers          |
| `crear_envio`          |:      | Create a real shipment, get trackingNumber + label PDF    |
| `trackear_envio`       |:      | Get current status + event history for a trackingNumber   |
| `cancelar_envio`       |:      | Cancel a non-delivered shipment (when carrier supports)   |
| `listar_sucursales`    |:      | List drop-off / pickup branches near a CPA                |

See [AGENTS.md](./AGENTS.md) for tool selection guidance, normalized status codes, and per-carrier coverage.

---

## Carrier coverage matrix (v0.1)

| Operation           | Andreani  | OCA       | Correo Argentino |
| ------------------- | --------- | --------- | ---------------- |
| `cotizar`           | ✓ REST    | ✓ REST    | ✓ REST           |
| `crear`             | ✓ REST    | ✗ SOAP\*  | ✗ Portal-only\*  |
| `trackear`          | ✓ REST    | ✗ SOAP\*  | ✓ REST           |
| `cancelar`          | ✓ REST    | ✗ SOAP\*  | ✗ Portal-only\*  |
| `listar_sucursales` | ✓ REST    | ✓ REST    | ✓ REST           |

\* OCA E-Pak SOAP support + Correo Argentino "Mi Correo Empresas" portal flow are coming in v0.2. The unsupported operations throw `ShippingNotSupportedError` with a clear message.

For Andreani: the most common AR e-commerce carrier: every operation is wired.

---

## Provincias + CPA helpers (pure, no setup)

```ts
import { lookupProvincia, isValidCPA } from "@ar-agents/shipping";

lookupProvincia("CABA")       // → { iso: "C", afipCode: 0, name: "Ciudad..." }
lookupProvincia("córdoba")    // → Córdoba (accent-insensitive)
lookupProvincia(8)            // → La Pampa (by AFIP code)

isValidCPA("1842")            // → true
isValidCPA("B1842ZAB")        // → true (extended CPA)
isValidCPA("0000")            // → false
```

The tools auto-validate `postalCode` and `state` on every input: invalid inputs return `{ ok: false, error }` instead of hitting the carrier.

---

## License

MIT © Nazareno Clemente

## Stability

This package is **pre-1.0**. Per [npm convention](https://docs.npmjs.com/about-semantic-versioning), **0.x minor versions may include breaking changes**. We document every breaking change in `CHANGELOG.md` under the corresponding minor bump and flag it explicitly. To avoid surprises:

```bash
# Pin to exact version (recommended for production):
pnpm add @ar-agents/<package>@<exact-version>
```

We commit to **no breaking changes within a patch version**, and we publish `1.0.0` once the public API has stabilized across at least two consecutive minor releases.
