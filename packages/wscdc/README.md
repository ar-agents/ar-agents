# @ar-agents/wscdc

Agent toolkit for AFIP **WSCDC** (Web Service Constatación de Comprobantes Destinatarios). Validate that a factura received from a supplier was actually issued by AFIP with a real CAE — before ingesting it into accounts payable.

```sh
pnpm add @ar-agents/wscdc
```

## What this package does

- **`HttpWscdcAdapter`** — real adapter that POSTs SOAP to AFIP WSCDC (homo or prod). Caller supplies a WSAA access ticket; the adapter handles envelope construction, SoapAction header, and response parsing.
- **`InMemoryWscdcAdapter`** — deterministic adapter for integration tests + cockpit demos. Pre-seed expected `(CAE, emisor, cbte)` triples; everything else returns `"N"`.
- **`UnconfiguredWscdcAdapter`** — explicit `throws on every call` default. Safe for unit tests that exercise validation primitives without AFIP creds.
- **Pure validation** — `validateConstatarRequest()` catches CUIT shape, date format, CAE length, etc. before the network round-trip so a typo doesn't cost a billable AFIP call.
- **Two Vercel AI SDK tools** — `wscdc_validate_comprobante` + `wscdc_health`.

## What this package does NOT do

- **Acquire the WSAA ticket.** The caller passes an `AccessTicket` (token + sign + cuitRepresentada) it already has. Use [`@ar-agents/identity`](../identity)'s WSAA helpers or any compatible WSAA client. The `wscdc` service requires its own AFIP authorization separate from `wsfe`.
- **Catch every AFIP wire quirk.** AFIP sometimes returns HTTP 500 with SOAP faults for legitimate-but-expired tokens; we translate those to `WscdcProtocolError` with `faultCode` set so callers can retry or surface to the operator.

## Quick start

```ts
import {
  HttpWscdcAdapter,
  type AccessTicket,
} from "@ar-agents/wscdc";

// Acquire a TA from your WSAA flow first — example:
//   const ta = await acquireWsaaTicket("wscdc", { certPem, keyPem });
const ticket: AccessTicket = /* ... */ undefined!;

const wscdc = new HttpWscdcAdapter({ env: "prod", ticket });

const result = await wscdc.validateComprobante({
  cbteModo: "CAE",
  cuitEmisor: "30-50000001-8",
  ptoVta: 1,
  cbteTipo: 11, // Factura C
  cbteNro: 1234,
  cbteFch: "20260515", // YYYYMMDD (AFIP wire format)
  impTotal: 12100.0,
  codAutorizacion: "70123456789012",
  docTipoReceptor: 80, // CUIT
  docNroReceptor: "20123456786",
});

if (result.resultado === "A") {
  // Approved — safe to ingest into AP.
} else if (result.resultado === "N") {
  // Rejected — likely forged or wrong data. Refuse the factura.
  console.error("Forged?", result.errors);
} else {
  // Observed — exists but a soft field differs. Caller decides.
  console.warn("Mismatches:", result.observaciones);
}
```

Wired as agent tools:

```ts
import { Experimental_Agent as Agent } from "ai";
import { wscdcTools, HttpWscdcAdapter } from "@ar-agents/wscdc";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new Agent({
  model: anthropic("claude-sonnet-4-7"),
  tools: wscdcTools({
    adapter: new HttpWscdcAdapter({ env: "prod", ticket }),
  }),
  system: "Eres un agente que valida facturas recibidas antes de ingestarlas en AP.",
});
```

## Result shape

```ts
interface ConstatarResult {
  resultado: "A" | "N" | "O";
  observaciones: ReadonlyArray<{ code: number; msg: string }>;
  errors: ReadonlyArray<{ code: number; msg: string }>;
  fchProceso?: string; // YYYYMMDDhhmmss as returned by AFIP
}
```

- `"A"` — every field matched what AFIP has on record. Safe.
- `"N"` — at least one hard field (CAE, emisor, cbte number) didn't match. **Treat as forged or wrong-data.** Refuse to ingest.
- `"O"` — exists, but a soft field (typically total) differs. Look at `observaciones` and decide.

## In-memory testing

```ts
import { InMemoryWscdcAdapter, wscdcTools } from "@ar-agents/wscdc";

const adapter = new InMemoryWscdcAdapter([
  {
    cuitEmisor: "30-50000001-8",
    ptoVta: 1,
    cbteTipo: 11,
    cbteNro: 1234,
    impTotal: 12100.0,
    codAutorizacion: "70123456789012",
  },
]);

const tools = wscdcTools({ adapter });
// Tests against AFIP-realistic semantics, zero credentials needed.
```

## Errors

```ts
import {
  WscdcError,
  WscdcValidationError,  // bad input — do NOT retry
  WscdcProtocolError,    // network / HTTP / SOAP fault — may retry
  WscdcUnconfiguredError,
} from "@ar-agents/wscdc";
```

A `resultado: "N"` is NOT an error — it's a valid response that says "this comprobante is forged." Switching on `resultado` is the correct flow control.

## Constraints

- **`cbteFch` is YYYYMMDD** (AFIP wire format, no hyphens).
- **`codAutorizacion` is exactly 14 digits** (CAE or CAEA).
- **`impTotal` is a number with up to 2 decimals.** The package formats it as `toFixed(2)` on the wire.
- **`docNroReceptor` is a string** (Consumidor Final = `"0"`).

For LLM agents using these tools, see [AGENTS.md](./AGENTS.md).

## License

MIT — Nazareno Clemente <naza@naza.ar>
