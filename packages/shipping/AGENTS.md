# AGENTS.md — @ar-agents/shipping

> Runtime guidance for LLM agents that load this toolkit.

This file ships in the npm tarball so agents can read it at runtime.

---

## What this package does

6 Vercel AI SDK tools for AR shipping carriers (Andreani, OCA, Correo Argentino):

1. **`cotizar_envio`** — quote with a specific carrier
2. **`cotizar_envio_todos`** — parallel quote across all configured carriers (cheapest first)
3. **`crear_envio`** — create a real shipment, get trackingNumber + label
4. **`trackear_envio`** — current status + events
5. **`cancelar_envio`** — cancel pre-delivery (when supported)
6. **`listar_sucursales`** — branches near a CPA

All require at least one `ShippingAdapter` configured. Without any, tools return `{ available: false, error: <setup instructions> }`.

---

## Tool selection cheatsheet

| User intent                                        | Use this              |
| -------------------------------------------------- | --------------------- |
| "Cuánto sale mandar 2kg de CABA a Mendoza?"        | `cotizar_envio` (default carrier) |
| "Cuál es el envío más barato"                      | `cotizar_envio_todos` (returns cheapest first) |
| "Mandalo por Andreani"                             | `crear_envio({ carrier: 'andreani', ... })` |
| "¿Cómo va mi paquete? Tracking ABC123"             | `trackear_envio` |
| "Cancelá el envío X"                               | `cancelar_envio` (only works pre-delivery) |
| "Hay sucursal de Andreani cerca del CP 1842?"      | `listar_sucursales` |

---

## Normalized TrackingStatus

Every adapter maps its native status codes to one of these (use `currentStatus` for quick decisions):

- `label_created` — etiqueta generada, paquete no retirado todavía
- `in_transit` — el carrier tiene el paquete, en ruta
- `out_for_delivery` — en el camión para entrega HOY
- `delivered` — destinatario confirmó recepción (`deliveredAt` se popula)
- `delivery_failed` — intento fallido (ausente, rechazado)
- `returned` — devuelto al remitente
- `canceled` — el remitente lo canceló
- `exception` — perdido, dañado, en mediación
- `unknown` — el carrier devolvió algo no mapeable (raro, surface a ops)

Always show the user the full `events[]` array in chronological order — son la traza completa del recorrido.

---

## Mandatory chaining for "buscar envío más barato + crearlo"

```
1. cotizar_envio_todos({ origin, destination, packages })
   → { quotes: [...], cheapest: { carrier, productId, ... } }
2. crear_envio({
     carrier: cheapest.carrier,
     product_id: cheapest.productId,  // bloquea el precio cotizado
     origin, destination, packages,
     external_reference: order_id,
   })
   → { trackingNumber, labelUrl, costArs }
```

**Importante**: pasar `productId` del cotizador al `crear_envio` evita drift de precios (los carriers a veces tienen precios distintos según el producto exacto).

---

## Validation done locally before hitting the carrier

The tools auto-validate:

- `postalCode` (origin + destination) → must be a valid CPA (4-digit ≥1000 OR extended `B1842ZAB`)
- `state` → must resolve via `lookupProvincia` (accent-insensitive name, ISO code, or AFIP code)

When invalid, returns `{ ok: false, error }` — no network call. Saves carrier API quota.

---

## Per-carrier capability matrix (v0.1)

| Operation           | Andreani  | OCA       | Correo Argentino |
| ------------------- | --------- | --------- | ---------------- |
| cotizar             | ✓         | ✓         | ✓                |
| crear               | ✓         | throws    | throws           |
| trackear            | ✓         | throws    | ✓                |
| cancelar            | ✓         | throws    | throws           |
| listar_sucursales   | ✓         | ✓         | ✓                |

When a carrier doesn't support an operation, the tool returns `{ ok: false, error: <Spanish msg> }` — surface verbatim.

---

## Latency expectations

| Tool                      | p50      | p95      | Network call?       |
| ------------------------- | -------- | -------- | ------------------- |
| `cotizar_envio`           | ~400 ms  | ~1.5 s   | Yes (single carrier)|
| `cotizar_envio_todos`     | ~600 ms  | ~2 s     | Yes (parallel)      |
| `crear_envio`             | ~800 ms  | ~3 s     | Yes                 |
| `trackear_envio`          | ~300 ms  | ~1 s     | Yes                 |
| `cancelar_envio`          | ~500 ms  | ~1.5 s   | Yes                 |
| `listar_sucursales`       | ~250 ms  | ~800 ms  | Yes                 |
| Address validation        | <1 ms    | <2 ms    | No (pure)           |

---

## Errors

All errors extend `ShippingError` with a machine-readable `code`:

- `shipping_not_configured` — adapter for the requested carrier wasn't passed
- `shipping_invalid_input` — bad CPA or unknown provincia
- `shipping_carrier_error` — carrier API returned an error (HTTP 4xx/5xx)
- `shipping_not_supported` — carrier doesn't support this operation in v0.1
- `shipping_unknown_error` — fallback

Surface `.message` to end users; switch on `.code` for programmatic flows.
