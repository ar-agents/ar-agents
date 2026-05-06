# AGENTS.md — @ar-agents/facturacion

> Runtime guidance for LLM agents that load this toolkit. Convention per [agents.md](https://agents.md/).

This file ships in the npm tarball so agents can read it at runtime.

---

## What this package does

10 Vercel AI SDK tools for AFIP/ARCA factura electrónica (WSFE):

1. **`emitir_factura`** — solicit a CAE for a new comprobante
2. **`consultar_ultimo_comprobante`** — get the next available number
3. **`consultar_factura_emitida`** — verify a previously-issued comprobante
4. **`obtener_tipos_comprobante`** — live AFIP catalog
5. **`obtener_tipos_documento`** — live AFIP catalog
6. **`obtener_alicuotas_iva`** — live AFIP catalog
7. **`obtener_tipos_concepto`** — live AFIP catalog
8. **`obtener_tipos_moneda`** — live AFIP catalog
9. **`obtener_cotizacion`** — exchange rate for non-PES currencies
10. **`health_check_afip`** — WSFE health probe

All 10 require a `WsfeClient` configured at app boot. Without one, they return `{ available: false, error: <setup instructions> }`.

---

## Tool selection cheatsheet

| User intent                                              | Use this                       |
| -------------------------------------------------------- | ------------------------------ |
| "Emití una factura por X pesos a CUIT Y"                 | `consultar_ultimo_comprobante` then `emitir_factura` |
| "Cuál es el próximo número de Factura C que voy a emitir" | `consultar_ultimo_comprobante` (returns `proximoNumero`) |
| "Verificá la factura número X"                           | `consultar_factura_emitida`    |
| "Qué tipos de factura puedo emitir"                      | `obtener_tipos_comprobante` (or use `CbteTipo` const) |
| "Cuál es el dólar AFIP de hoy"                           | `obtener_cotizacion("DOL")`    |
| "AFIP está caído?"                                       | `health_check_afip`            |

---

## Mandatory chaining for emisión

**ALWAYS** call `consultar_ultimo_comprobante` BEFORE `emitir_factura`:

```
1. consultar_ultimo_comprobante({ cbteTipo: 11 })
   → returns { cbteNro: 42, proximoNumero: 43 }
2. emitir_factura({ cbteDesde: 43, ... })
```

If you skip step 1 and pick a wrong number, AFIP rejects with error 10016 ("Número de comprobante incorrecto").

For Notas de Crédito/Débito, also include `cbtesAsoc` referencing the original Factura.

---

## emitir_factura — input schema (memorize)

**Required for all comprobantes:**
- `cbteTipo` — see CbteTipo constants below
- `concepto` — 1 (Productos), 2 (Servicios), 3 (P+S)
- `docTipo` — 80 (CUIT), 96 (DNI), 99 (Consumidor Final)
- `docNro` — receiver's document number (0 for Cons. Final)
- `cbteFch` — YYYYMMDD, must be ±5 days of today (servicios: ±10)
- `impTotal`, `impNeto`, `impIVA` — see consistency rules below
- `cbteDesde` — `consultarUltimoAutorizado() + 1`

**Required when concepto ∈ {2, 3} (Servicios):**
- `fchServDesde`, `fchServHasta`, `fchVtoPago` — all YYYYMMDD

**Required when emitting Factura A/B with IVA:**
- `iva: [{ id: 5, baseImp: 100, importe: 21 }, ...]` — sum of `importe` MUST equal `impIVA`

**Required when emitting Notas:**
- `cbtesAsoc: [{ tipo, ptoVta, nro, cuit?, fecha? }]`

**Required when emitting non-PES:**
- `monId: "DOL"` (or other) + `monCotiz: <rate from obtener_cotizacion>`

---

## CbteTipo cheatsheet

The choice depends on the issuer's tax condition × receiver's tax condition:

| Issuer ↓ / Receiver →    | RI    | Mono  | Cons. Final | Exterior |
| ------------------------ | ----- | ----- | ----------- | -------- |
| Responsable Inscripto    | 1 (A) | 1 (A) | 6 (B)       | 19 (E)   |
| Monotributista           | 11 (C)| 11 (C)| 11 (C)      | 19 (E)   |

For Notas: same letter as the original. Crédito: 3/8/13. Débito: 2/7/12.

---

## DocTipo cheatsheet

- 80 → CUIT (B2B, the most common)
- 86 → CUIL
- 96 → DNI (consumer)
- 94 → Pasaporte (extranjero)
- 99 → Consumidor Final (sale below threshold, pair with `docNro: 0`)

---

## Result schemas

### `emitir_factura` returns:

```ts
{
  available: true,
  ok: boolean,                 // true iff resultado === "A"
  resultado: "A" | "R" | "P",
  cae: string | null,          // 14 digits when ok; PRINT THIS on the comprobante
  caeFchVto: string | null,    // YYYYMMDD; comprobante must be reported before this
  ptoVta, cbteTipo, cbteDesde, cbteHasta, cbteFch, fchProceso,
  observaciones: { code, msg }[], // per-detail issues
  errors: { code, msg }[],     // top-level request issues
  eventos: { code, msg }[],    // AFIP info messages (maintenance windows, etc.)
  tipoComprobanteDescripcion: string,  // e.g. "Factura C"
}
```

### `consultar_ultimo_comprobante` returns:

```ts
{
  available: true,
  ptoVta: number,
  cbteTipo: number,
  cbteNro: number,             // 0 if never issued
  proximoNumero: number,       // cbteNro + 1 — pass this to emitir_factura.cbteDesde
  tipoComprobanteDescripcion: string,
}
```

---

## Common AFIP rejection codes (in observaciones)

| Code  | Meaning                                                      | Fix                                                             |
| ----- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| 10016 | Número de comprobante incorrecto                             | Use `consultarUltimoAutorizado() + 1`                           |
| 10048 | ImpTotal != suma de componentes                              | `impTotal = impTotConc + impNeto + impIVA + impOpEx + impTrib`  |
| 10049 | Suma de Iva.Importe != ImpIVA                                | Make sure `iva[].importe` sums to `impIVA`                      |
| 10054 | Factura C no admite IVA                                      | Set `impIVA: 0`, omit `iva` array                              |
| 10063 | Servicios requiere fchServDesde/Hasta/VtoPago                | Add the three fchServ fields                                    |
| 10070 | Tipo de cambio no es válido                                  | Use `obtener_cotizacion(monId)` to get the current rate         |
| 600   | Auth invalid (token/sign)                                    | Library auto-refreshes; if persistent, re-check cert auth in ARCA |
| 602   | No existe el comprobante (en consulta)                       | Verify ptoVta + cbteTipo + cbteNro                              |

The lib's `validateSolicitarCae()` catches most of these (10048, 10049, 10054, 10063, 10070) BEFORE the network round-trip.

---

## Latency expectations

| Tool                          | p50      | p95       | Network call?  |
| ----------------------------- | -------- | --------- | -------------- |
| pure-constant lookups         | <1 ms    | <2 ms     | No             |
| `health_check_afip`           | ~150 ms  | ~500 ms   | Yes (AFIP)     |
| `consultar_ultimo_comprobante`| ~250 ms  | ~1 s      | Yes (AFIP)     |
| `emitir_factura`              | ~600 ms  | ~3 s      | Yes (AFIP)     |
| `consultar_factura_emitida`   | ~350 ms  | ~1.5 s    | Yes (AFIP)     |
| `obtener_*` catalogs          | ~200 ms  | ~800 ms   | Yes (AFIP)     |

Cache catalog responses aggressively — they change once or twice a year.

---

## Errors

All errors extend `FacturacionError` with a machine-readable `code`:

- `wsfe_not_configured` — no `WsfeClient` passed
- `wsfe_validation_error` — local pre-flight failed (see `validateSolicitarCae`)
- `wsfe_authentication_failed` — WSAA cert / service authorization issue
- `wsfe_request_rejected` — AFIP returned `Resultado: R`
- `wsfe_service_unavailable` — AFIP 5xx or network error
- `wsfe_unknown_error` — fallback

Surface `.message` to end users; switch on `.code` for programmatic flows.
