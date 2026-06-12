# `@ar-agents/fecred` agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools for **AFIP/ARCA WSFECred**, the web service behind the Factura de Credito Electronica MiPyME regime (RG 4367). It serves two roles:

- **Emisor side (pre-issuing check):** before invoicing a large buyer, ask whether the invoice MUST be an FCE.
- **Receptor side (lifecycle):** list FCEs received, then accept or reject them within the legal window.

## When to use which tool

| Goal                                                        | Tool                      | Notes                                              |
| ------------------------------------------------------------ | ------------------------- | -------------------------------------------------- |
| Check if an invoice must be an FCE for a given buyer        | `fecred_check_obligation` | Pure read. Returns `obligado` + live `montoDesde`. |
| List FCEs awaiting acceptance                               | `fecred_list_received`    | Pure read. `estadoCmp: "Recepcionado"`.            |
| Accept a received FCE                                       | `fecred_accept_invoice`   | IRREVERSIBLE. Confirm with the user first.         |
| Reject a received FCE                                       | `fecred_reject_invoice`   | IRREVERSIBLE. Needs justified motivos.             |
| Confirm WSFECred is reachable                               | `fecred_health`           | Use before a batch flow.                           |

## When NOT to use this package

- **Issuing a regular factura (A/B/C) and getting a CAE:** that is `@ar-agents/facturacion` (WSFE). FCE comprobantes themselves (types 201/206/211) are also issued through WSFE; this package only manages the obligation check and the receptor-side lifecycle.
- **Validating that a received factura's CAE is genuine:** that is `@ar-agents/wscdc`. WSCDC answers "is this comprobante real?"; WSFECred answers "what do I do with this FCE?".

## The obligation threshold

`fecred_check_obligation` returns `montoDesde`, the ARS amount from which the FCE regime applies for the consulted CUIT. AFIP updates it periodically (the April 2026 update put it around ARS 5.5M). **Always use the returned value; never assume a hardcoded threshold.** If `obligado` is true and the invoice total is at or above `montoDesde`, the emisor must issue an FCE type instead of a regular factura.

## The legal window (critical)

A received FCE not rejected within the legal acceptance window (15 corridos days from puesta a disposicion) is **tacitly accepted**. After tacit or explicit acceptance the FCE becomes a negotiable credit title the supplier can transfer or discount. Consequences for agents:

- Surface anything with a near `fechaVenAcep` to the operator with urgency.
- Rejection after the window will come back with `resultado: "R"` and an error code; do not retry.

## Confirmation gates (HITL)

`fecred_accept_invoice` and `fecred_reject_invoice` are **irreversible legal acts**. Before calling either:

1. Restate the emisor CUIT, comprobante key (codTipoCmp / ptoVta / nroCmp), and the saldoAceptado or the rejection motivos.
2. Ask for explicit confirmation ("si, acepta" / "si, rechaza" or equivalent).
3. Only then call the tool.

The reads (`fecred_check_obligation`, `fecred_list_received`, `fecred_health`) need no confirmation.

## Result semantics

Accept/reject return `OperacionFECredResult`:

- **`resultado: "A"`** AFIP processed the operation. Done.
- **`resultado: "O"`** processed with observations; surface `observaciones[]`.
- **`resultado: "R"`** AFIP refused (already settled, out of window, bad saldo). `errors[]` explains. NOT an exception; switch on the field.

`fecred_list_received` paginates: when `hayMas` is true, call again with `nroPagina + 1`.

## Constraints

- **Dates are YYYY-MM-DD** (xsd:date). NOT the YYYYMMDD wire format used by WSFE and WSCDC.
- **FCE comprobante type codes:** 201 = FCE A, 206 = FCE B, 211 = FCE C (plus nota de debito/credito variants 202/203, 207/208, 212/213).
- **Amounts as numbers** (`saldoAceptado: 8000000`), formatted `toFixed(2)` on the wire.
- **Motivos de rechazo:** `codMotivo` is a code from AFIP's catalog (consultarTiposMotivosRechazo); `descMotivo` and `justificacion` max 250 chars each.

## Error model

- `FecredValidationError` bad input (CUIT shape, date format, empty motivos). Do NOT retry the same call.
- `FecredProtocolError` network / HTTP / SOAP fault talking to AFIP. May retry with backoff; `faultCode` distinguishes "TA expired" (refresh ticket, retry) from "service down".
- `FecredUnconfiguredError` no adapter wired. Surface to the operator.

## AR context (for non-AR agents)

- **WSAA service id is `wsfecred`**: a separate authorization in the AFIP portal from `wsfe` and `wscdc`, same token+sign mechanics. Caller passes an `AccessTicket`; use `@ar-agents/identity`'s WSAA helpers.
- **AFIP rebranded to ARCA in 2025.** Service names did not change.
- Endpoints: prod `serviciosjava.afip.gob.ar/wsfecred/FECredService`, homo `fwshomo.afip.gov.ar/wsfecred/FECredService`.

## What this package does NOT cover (v0.1)

- Acquiring the WSAA ticket.
- Issuing FCE comprobantes (that is WSFE / `@ar-agents/facturacion`).
- The agente de deposito colectivo flows (informarFacturaAgtDptoCltv etc.), nota de debito/credito confirmation arrays, retenciones/ajustes arrays on acceptance, and cancellation reporting (informarCancelacionTotalFECred). The SOAP layer is extensible if you need them.
