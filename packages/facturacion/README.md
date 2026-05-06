# @ar-agents/facturacion

> AFIP/ARCA factura electrónica (WSFE) for [Vercel AI SDK 6+](https://sdk.vercel.ai) agents.

[![npm](https://img.shields.io/npm/v/@ar-agents/facturacion?color=blue)](https://npm.im/@ar-agents/facturacion) ![bundle](https://img.shields.io/badge/brotli-9%20KB-success) ![tests](https://img.shields.io/badge/tests-51%20passing-success) ![license](https://img.shields.io/badge/license-MIT-blue)

Built for SaaS argentinos that need to:

- **Emit Facturas A/B/C** with the AFIP-issued CAE (Código de Autorización Electrónico)
- **Auto-increment** comprobante numbers via `consultarUltimoAutorizado`
- **Verify** previously-issued comprobantes
- **Pre-validate** locally to catch the 10 most common AFIP rejection reasons before the round-trip

Reuses the WSAA infrastructure from `@ar-agents/identity` — same X.509 cert, same TokenCache, same `fetchWithRetry` helper. If you already have `@ar-agents/identity` wired up, adding `@ar-agents/facturacion` is one cert-authorization step away.

---

## Install

```bash
pnpm add @ar-agents/facturacion @ar-agents/identity
# peer deps: ai >=6, zod >=3
```

## Setup

1. Generate cert + register alias as documented in [`@ar-agents/identity`](https://github.com/ar-agents/ar-agents/tree/main/packages/identity).
2. In ARCA → "Administrador de Relaciones de Clave Fiscal" → "Nueva Relación" → "AFIP" → "WebServices" → **"Servicio Web de Facturación Electrónica"** → select your alias.
3. Wire the client:

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { facturacionTools, WsfeClient } from "@ar-agents/facturacion";

const wsfe = new WsfeClient({
  certPath: process.env.AFIP_CERT_PATH!,
  keyPath: process.env.AFIP_KEY_PATH!,
  cuit: process.env.AFIP_CUIT!,
  env: "prod",
});

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: facturacionTools({ wsfe, defaultPtoVta: 1 }),
  stopWhen: stepCountIs(6),
});

const { text } = await agent.generate({
  prompt:
    "Emití una Factura C de $12.100 a Juan Pérez (CUIT 23-30900000-9), servicio del 1/5 al 31/5, vencimiento 15/6.",
});
```

The agent will: (1) `consultar_ultimo_comprobante` to get the next number, (2) `emitir_factura`, (3) report the CAE.

---

## Tools

| Tool                          | Pure?    | What it does                                           |
| ----------------------------- | -------- | ------------------------------------------------------ |
| `emitir_factura`              | —        | Solicit a CAE for a new comprobante                    |
| `consultar_ultimo_comprobante`| —        | Get the last authorized number for (PtoVta, CbteTipo)  |
| `consultar_factura_emitida`   | —        | Look up a previously-issued comprobante                |
| `obtener_tipos_comprobante`   | —        | Live AFIP catalog of comprobante types                 |
| `obtener_tipos_documento`     | —        | Live AFIP catalog of document types                    |
| `obtener_alicuotas_iva`       | —        | Live AFIP catalog of IVA rates                         |
| `obtener_tipos_concepto`      | —        | Live AFIP catalog of conceptos                         |
| `obtener_tipos_moneda`        | —        | Live AFIP catalog of currencies                        |
| `obtener_cotizacion`          | —        | AFIP exchange rate for a foreign currency vs ARS       |
| `health_check_afip`           | —        | AFIP WSFE app/db/auth status                           |

All 10 tools require a `WsfeClient`. Without one, they return `{ available: false, error: <setup instructions> }` instead of crashing — drop-in safe for stub deployments.

For pure-algorithm catalogs (no network), use the exported constants:

```ts
import { CbteTipo, DocTipo, AlicuotaIva, Concepto } from "@ar-agents/facturacion";

CbteTipo.FACTURA_C       // 11
DocTipo.CUIT             // 80
AlicuotaIva.VEINTIUNO    // { id: 5, percent: 21 }
Concepto.SERVICIOS       // 2
```

---

## Pre-flight validation

The library validates your `SolicitarCaeInput` LOCALLY before sending to AFIP, catching the most common rejection reasons:

- `ImpTotal` ≠ sum of components (AFIP error 10048)
- `iva[].importe` sum ≠ `ImpIVA`
- Factura C with `ImpIVA > 0` (Monotributo can't discriminate IVA)
- Concepto = Servicios sin `fchServDesde`/`Hasta`/`VtoPago`
- Nota de Crédito/Débito sin `cbtesAsoc`
- Malformed `cbteFch` (must be `YYYYMMDD`)
- `monId` no-PES con `monCotiz = 1`
- `cbteHasta < cbteDesde`

```ts
import { validateSolicitarCae } from "@ar-agents/facturacion";

const v = validateSolicitarCae(input);
if (!v.valid) {
  // v.errors is an array of { field, message } in Spanish
  console.error(v.errors);
}
```

Saves you a network round-trip (and a CloudWatch entry) on every malformed request.

---

## Robustez

The `WsfeClient` accepts `requestTimeoutMs`, `maxRetries`, and an `onCall` observability hook — all forwarded to both the WSAA token-refresh path and the per-comprobante WSFE path:

```ts
new WsfeClient({
  certPath: "...",
  keyPath: "...",
  cuit: "20417581015",
  env: "prod",
  requestTimeoutMs: 15_000,
  maxRetries: 2,
  onCall: (e) => metrics.histogram("wsfe.duration", e.durationMs, { label: e.label }),
});
```

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
