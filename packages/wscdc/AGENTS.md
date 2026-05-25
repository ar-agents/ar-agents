# `@ar-agents/wscdc` — agent guide

Runtime guide for LLM agents that load these tools. Read once.

## What this package is

Typed tools for **AFIP WSCDC** — the web service that validates whether a factura received from a supplier was actually issued by AFIP with a real CAE. Critical guard for AP-automation agents: before ingesting any received factura into accounts payable, call this.

## When to use which tool

| Goal                                              | Tool                            | Notes                                          |
| ------------------------------------------------- | ------------------------------- | ---------------------------------------------- |
| Validate a received factura before AP ingest      | `wscdc_validate_comprobante`    | Returns A / N / O — switch on the resultado.   |
| Confirm WSCDC is reachable                        | `wscdc_health`                  | Use before a batch validation flow.            |

## Decision tree on the `resultado`

- **`"A"` (Aprobado)** → every field matched. Safe to ingest.
- **`"N"` (No aprobado)** → at least one hard field (CAE, emisor, cbte number, date) didn't match. **Refuse to ingest.** Surface to the operator with the `errors[]` array — this is the forged-invoice signal.
- **`"O"` (Observado)** → exists in AFIP, but a soft field (typically `impTotal`) differs slightly. Decide based on the operator's risk tolerance; surface `observaciones[]`.

## Constraints

- **All amounts as numbers** (not strings, not centavos integers). `impTotal: 12100.0`, formatted as `toFixed(2)` on the wire.
- **`cbteFch` is YYYYMMDD** — AFIP's wire format, no hyphens, no `T`. Convert from ISO if needed.
- **`codAutorizacion` is exactly 14 digits** (CAE or CAEA).
- **`docTipoReceptor`** is a code: 80=CUIT, 86=CUIL, 87=CDI, 96=DNI, 99=Consumidor Final.
- **`docNroReceptor`** is a string. `"0"` for Consumidor Final.

## Common comprobante type codes

| Code | Tipo |
|------|------|
| 1    | Factura A |
| 2    | Nota de Débito A |
| 3    | Nota de Crédito A |
| 6    | Factura B |
| 7    | Nota de Débito B |
| 8    | Nota de Crédito B |
| 11   | Factura C |
| 12   | Nota de Débito C |
| 13   | Nota de Crédito C |
| 51   | Factura M |

## Error model

- `WscdcValidationError` — agent passed bad input (wrong CUIT shape, malformed date). Do NOT retry the same call.
- `WscdcProtocolError` — network / HTTP / SOAP-fault talking to AFIP. May retry with backoff. `faultCode` distinguishes "TA expired" (refresh and retry) from "service down".
- `WscdcUnconfiguredError` — no adapter wired. Surface to the operator.

A `resultado: "N"` is NOT an error — it's a valid response.

## Confirmation gates (HITL)

None required. Validation is read-only by definition.

## AR context (for non-AR agents)

- **WSCDC ≠ WSFE.** WSFE issues facturas (you're the emisor); WSCDC validates facturas you've received (you're the destinatario). Different AFIP service, different authorization step, different SOAP envelope. Both use WSAA tickets but the service name is different (`wscdc` vs `wsfe`).
- **AFIP rebranded to ARCA in 2025.** Service names did not change.

## What this package does NOT cover (v0.1)

- Acquiring the WSAA ticket. Caller passes an `AccessTicket`; use `@ar-agents/identity`'s wsaa helpers or any compatible client.
- Caching of validation results. Idempotent at the network layer (calling twice = same answer), but the caller is responsible for storage.
