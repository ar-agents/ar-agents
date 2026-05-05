# @ar-agents/identity

> Argentine identity validation (CUIT/CUIL) + AFIP padrón lookup as drop-in tools for the [Vercel AI SDK](https://ai-sdk.dev/).

[![npm version](https://img.shields.io/npm/v/@ar-agents/identity.svg)](https://www.npmjs.com/package/@ar-agents/identity)
[![npm downloads](https://img.shields.io/npm/dm/@ar-agents/identity.svg)](https://www.npmjs.com/package/@ar-agents/identity)
[![license](https://img.shields.io/npm/l/@ar-agents/identity.svg)](./LICENSE)
[![CI](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/ar-agents/ar-agents/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@ar-agents/identity.svg)](https://bundlephobia.com/package/@ar-agents/identity)

Validates Argentine taxpayer identifiers in pure-algorithm mode out of the box (no setup, no API call, sub-millisecond), and looks them up against AFIP's padrón webservice through a pluggable adapter when you wire one. Built for the Vercel AI SDK 6 `Experimental_Agent` and any caller of `tool()`.

> **Reading this as an agent?** Skip to [AGENTS.md](./AGENTS.md) — it's targeted at LLM consumption with explicit tool-selection rules and error patterns.

## At a glance

| What | Value |
| --- | --- |
| Tools shipped | `validate_cuit`, `lookup_cuit_afip` |
| External dependencies | None for `validate_cuit`. AFIP cert + your `AfipPadronAdapter` impl for `lookup_cuit_afip`. |
| Latency | <1ms for `validate_cuit`. 200–800ms for `lookup_cuit_afip` (AFIP SOAP). |
| Cost | $0 — no AFIP API charges, no third-party fees. |
| Side effects | None — both tools are read-only. |
| Sites supported | MLA (Argentina). The CUIT/CUIL algorithm is AR-only by definition. |

## Install

```bash
pnpm add @ar-agents/identity
# peer deps
pnpm add ai zod
```

## Quick start (algorithm-only, zero config)

The `lookup_cuit_afip` tool returns a clear "not configured" message until you wire an AFIP adapter, but `validate_cuit` works end-to-end with no setup whatsoever.

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { identityTools } from "@ar-agents/identity";

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6", // routed via Vercel AI Gateway
  tools: identityTools(), // both tools — AFIP one returns setup steps
  stopWhen: stepCountIs(6),
});

const result = await agent.generate({
  prompt: "Validá el CUIT 20-41758101-5 y decime qué sabés de él.",
});
console.log(result.text);
// → The agent calls validate_cuit (returns valid + persona física masculina)
//   then lookup_cuit_afip (returns "not configured" + setup steps),
//   then explains the validation result + the AFIP-not-configured note in argentino.
```

## Quick start (with AFIP padrón lookup)

To unlock `lookup_cuit_afip`, implement the `AfipPadronAdapter` interface and pass it to the factory:

```ts
import {
  identityTools,
  type AfipPadronAdapter,
  type AfipPadronResult,
} from "@ar-agents/identity";

class WsaaWscdcAdapter implements AfipPadronAdapter {
  async lookup(cuit: string): Promise<AfipPadronResult> {
    const ta = await this.getOrRefreshTa(); // WSAA TRA → CMS sign → LoginCms
    const persona = await this.wscdcClient.getPersona(ta, cuit);
    return {
      cuit,
      available: true,
      error: null,
      data: {
        nombre: persona.nombre,
        condicion: persona.tipoClave, // "MONOTRIBUTO" | "RESPONSABLE INSCRIPTO" | ...
        monotributoCategoria: persona.monotributo?.categoria ?? null,
        fechaInscripcion: persona.fechaInscripcion ?? null,
        domicilioFiscal: persona.domicilio?.direccion ?? null,
        actividades: persona.actividades?.map((a) => a.descripcion) ?? [],
      },
    };
  }
}

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: identityTools({ afip: new WsaaWscdcAdapter() }),
  stopWhen: stepCountIs(6),
});
```

## AFIP cert setup (required for `lookup_cuit_afip`)

To call AFIP's padrón webservice you need an X.509 cert registered with AFIP and authorized for the `ws_sr_padron_a5` service. Steps:

```bash
# 1. Generate keypair + CSR
openssl genrsa -out afip-key.pem 2048
openssl req -new -key afip-key.pem \
  -subj "/C=AR/O=YourOrg/CN=ar-agents/serialNumber=CUIT YYYYYYYYYY" \
  -out afip.csr
```

2. Log into [AFIP with Clave Fiscal](https://auth.afip.gob.ar/) → "Administración de Certificados Digitales" → "Agregar Alias" → upload `afip.csr`. AFIP issues `afip.crt`; download it.
3. In the same panel → "Administrador de Relaciones de Clave Fiscal" → "Adherir Servicio" → choose `WS_SR_PADRON_A5` (homologación for sandbox, producción for live).
4. Implement `AfipPadronAdapter` using your favorite SOAP client (`node-soap`) + a CMS signer (`node-forge`, `pkcs7`). The full flow is: build TRA XML → sign as PKCS#7 detached CMS → POST to WSAA `LoginCms` → cache the returned TA → use TA in WSCDC `getPersona_v2` calls.
5. Wire the adapter into your app:

```ts
identityTools({ afip: new WsaaWscdcAdapter({ certPath, keyPath, env: "homo" }) });
```

## Standalone API (no agent)

If you don't need the agent layer at all (e.g., a Next.js form-handler), import and use the algorithm functions directly:

```ts
import { parseCuit, isValidCuit, computeCheckDigit } from "@ar-agents/identity";

const result = parseCuit("20-41758101-5");
// {
//   valid: true,
//   normalized: "20417581015",
//   formatted: "20-41758101-5",
//   prefix: "20",
//   body: "41758101",
//   checkDigit: "5",
//   personType: "fisica_masculina",
//   error: null,
// }
```

| Function | Returns | Purpose |
| --- | --- | --- |
| `parseCuit(input)` | `CuitParseResult` | Full structured parse + validation. The primary entrypoint. |
| `isValidCuit(input)` | `boolean` | Convenience boolean. Use `parseCuit` when you need WHY a CUIT failed. |
| `computeCheckDigit(first10)` | `number \| null` | The AFIP modulo-11 algorithm exposed for advanced use. |
| `normalizeCuit(input)` | `string` | Strip non-digit characters. Same step `parseCuit` does internally. |
| `describePersonType(type)` | `string` | Spanish description of a `CuitPersonType` for end-user surfacing. |

## CUIT algorithm summary

CUIT/CUIL = 11 digits structured as `PP-DDDDDDDD-V`. The check digit `V` is computed via modulo-11:

1. Multiply each of the first 10 digits by the weights `[5, 4, 3, 2, 7, 6, 5, 4, 3, 2]` and sum.
2. Take `sum mod 11`. If 0 → check digit is `0`. If 1 → check digit is `9` (per AFIP spec). Otherwise → `11 - remainder`.
3. The 2-digit prefix encodes person type: `20`/`27` = persona física masc/fem, `23`/`24` = persona física extranjera or special, `30`/`33`/`34` = persona jurídica.

## Test cases

| CUIT | Expected | Notes |
| --- | --- | --- |
| `20-41758101-5` | valid, fisica_masculina | Real CUIT (Naza) |
| `30-70750012-9` | valid, juridica | Synthetic juridical (correct check digit) |
| `00-12345678-9` | invalid, prefix unknown | Prefix `00` not in lookup table |
| `20-41758101-9` | invalid, check digit | Wrong check (should be 5) |
| `20417581` | invalid, length | Too short |
| `20.41758101.5` | valid | Dots accepted; normalized internally |
| `20 41758101 5` | valid | Spaces accepted |

## Errors

All errors extend `IdentityError` and carry a machine-readable `code`:

| Class | Code | When |
| --- | --- | --- |
| `IdentityError` | various | Base class for programmatic catch. |
| `AfipNotConfiguredError` | `afip_not_configured` | Thrown by adapters when cert/env vars are missing. The `UnconfiguredAfipPadronAdapter` returns this as a structured `{ available: false, error }` instead of throwing. |
| `AfipCuitNotFoundError` | `afip_cuit_not_found` | AFIP responded that the CUIT isn't in the padrón. |

## Compatibility

- Node.js 20+
- Vercel AI SDK 6+
- Zod 3+
- Pairs cleanly with [`@ar-agents/mercadopago`](../mercadopago) (validate buyer CUITs before creating subscriptions) and [Vercel AI Gateway](https://vercel.com/ai-gateway) for model routing.

## License

MIT — see [LICENSE](./LICENSE).
