# @ar-agents/fecred

Agent toolkit for AFIP/ARCA **WSFECred** (Registro de Facturas de Credito Electronica MiPyME, RG 4367). Check if a counterparty is obligated to the FCE regime, list received FCEs, and accept or reject them within the legal window.

```sh
pnpm add @ar-agents/fecred
```

## What this package does

- **`HttpFecredAdapter`**: real adapter that POSTs SOAP to AFIP WSFECred (homo or prod). Caller supplies a WSAA access ticket for the `wsfecred` service; the adapter handles envelope construction, SOAPAction header, and response parsing.
- **`InMemoryFecredAdapter`**: deterministic adapter for integration tests + demos. Seed received FCEs and obligated CUITs; accept/reject mutate the in-memory state with AFIP-realistic semantics.
- **`UnconfiguredFecredAdapter`**: explicit throws-on-every-call default, so an agent without creds never silently lies.
- **Five Vercel AI SDK tools**: `fecred_check_obligation`, `fecred_list_received`, `fecred_accept_invoice`, `fecred_reject_invoice`, `fecred_health`.

## When to use this vs the sibling packages

| You want to...                                                  | Use                       |
| --------------------------------------------------------------- | ------------------------- |
| Issue a regular factura (A/B/C) and get a CAE                   | `@ar-agents/facturacion`  |
| Validate that a received factura's CAE is real                  | `@ar-agents/wscdc`        |
| Know if your invoice to a big buyer MUST be an FCE              | **this package**          |
| Manage FCEs you received: list, accept, reject                  | **this package**          |

The FCE regime applies when a MiPyME invoices a large company above a threshold amount (`montoDesde`). AFIP updates that threshold periodically (for example the April 2026 update to roughly ARS 5.5M); `fecred_check_obligation` returns the live value, so never hardcode it.

## Quick start

```ts
import { HttpFecredAdapter, type AccessTicket } from "@ar-agents/fecred";

// Acquire a TA from your WSAA flow first, service id "wsfecred":
//   const ta = await acquireWsaaTicket("wsfecred", { certPem, keyPem });
const ticket: AccessTicket = /* ... */ undefined!;

const fecred = new HttpFecredAdapter({ env: "prod", ticket });

// 1. Before issuing: must this invoice be an FCE?
const oblig = await fecred.checkObligation({ cuitConsultada: "30-50000001-8" });
if (oblig.obligado && invoiceTotal >= (oblig.montoDesde ?? Infinity)) {
  // Issue FCE type 201/206/211 via @ar-agents/facturacion.
}

// 2. As receptor: what is pending acceptance?
const pending = await fecred.listComprobantes({
  rol: "Receptor",
  estadoCmp: "Recepcionado",
  fechaTipo: "Emision",
});

// 3. Accept one (IRREVERSIBLE legal act):
const r = await fecred.acceptInvoice({
  idFactura: { cuitEmisor: "20-41758101-5", codTipoCmp: 201, ptoVta: 3, nroCmp: 42 },
  saldoAceptado: 8_000_000,
  codMoneda: "PES",
  cotizacionMonedaUlt: 1,
});
```

Wired as agent tools:

```ts
import { Experimental_Agent as Agent } from "ai";
import { fecredTools, HttpFecredAdapter } from "@ar-agents/fecred";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new Agent({
  model: anthropic("claude-sonnet-4-7"),
  tools: fecredTools({
    adapter: new HttpFecredAdapter({ env: "prod", ticket }),
  }),
  system: "Sos un agente que gestiona Facturas de Credito Electronica recibidas.",
});
```

## The legal window

A received FCE that is not rejected within the legal acceptance window (15 corridos days from puesta a disposicion) is **tacitly accepted** and becomes a negotiable credit title. Run `fecred_list_received` regularly and surface anything close to `fechaVenAcep`.

## In-memory testing

```ts
import { InMemoryFecredAdapter, fecredTools } from "@ar-agents/fecred";

const adapter = new InMemoryFecredAdapter({
  obligatedCuits: ["30-50000001-8"],
  montoDesde: 5_500_000, // configurable; the real value comes from AFIP
  comprobantes: [/* seeded FecredComprobante objects */],
});

const tools = fecredTools({ adapter });
```

## Errors

```ts
import {
  FecredError,
  FecredValidationError,  // bad input, do NOT retry
  FecredProtocolError,    // network / HTTP / SOAP fault, may retry
  FecredUnconfiguredError,
} from "@ar-agents/fecred";
```

A `resultado: "R"` in an accept/reject response is NOT thrown: it means AFIP refused the operation (already accepted, out of window, etc.) and the `errors[]` array explains why.

## Constraints

- **Dates are YYYY-MM-DD** (xsd:date). This differs from WSFE/WSCDC's YYYYMMDD.
- **FCE comprobante type codes**: 201 (FCE A), 206 (FCE B), 211 (FCE C), plus their nota de debito/credito variants.
- **WSAA service id is `wsfecred`** and requires its own authorization in the AFIP portal, separate from `wsfe` and `wscdc`.
- **Rejection requires at least one motivo** with `codMotivo`, `descMotivo`, and `justificacion` (max 250 chars each).

For LLM agents using these tools, see [AGENTS.md](./AGENTS.md).

## License

MIT, Nazareno Clemente <naza@naza.ar>
