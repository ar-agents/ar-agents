# 02 — ARCA Factura A/B/C/E auto-emission on every order

When the bridge confirms an order, automatically emit an Argentine
electronic invoice via AFIP/ARCA WSFE and embed the CAE in
`order.metadata`. The agent receives the CAE in the ACP order webhook;
your bookkeeping reconciles automatically.

```ts
import { createFacilitator } from "@ar-agents/agentic-commerce-bridge";
import { createFacturacionHook } from "@ar-agents/agentic-commerce-bridge";
import { WsfeClient } from "@ar-agents/facturacion";
import { createArcaPadronAdapter } from "@ar-agents/identity";

const wsfe = new WsfeClient({
  cuit: "20417581015",
  cert: process.env.AFIP_CERT_PEM!,
  key: process.env.AFIP_KEY_PEM!,
  env: "prod",
});
const arcaPadron = createArcaPadronAdapter({
  cuit: "20417581015",
  cert: process.env.AFIP_CERT_PEM!,
  key: process.env.AFIP_KEY_PEM!,
  env: "prod",
  service: "ws_sr_constancia_inscripcion",
});

const fiscalHook = createFacturacionHook({
  seller: {
    cuit: "20417581015",
    punto_venta: 1,
    regime: "monotributo", // or "responsable_inscripto" / "exento"
    legal_name: "Naza Clemente",
  },
  wsfe,
  arcaPadronLookup: (cuit) => arcaPadron.lookup(cuit),
  onEmission: ({ success, cae, factura_type, error }) => {
    // Telemetry hook — wire to Sentry / Datadog / your telemetry stack.
    console.log("[factura]", { success, cae, factura_type, error });
  },
});

const facilitator = createFacilitator({
  state, catalog, paymentProviders, paymentHandlers,
  webhookSecret: process.env.ACP_WEBHOOK_SECRET!,
  hooks: fiscalHook,
});
```

## Factura type matrix (per AFIP rules)

| Seller regime | Buyer condition | Factura |
|---|---|---|
| `monotributo` | any | **C** |
| `responsable_inscripto` | `responsable_inscripto` / `monotributista` | **A** |
| `responsable_inscripto` | `consumidor_final` / other | **B** |
| any | `extranjero` (cross-border) | **E** |

The matrix is implemented in `selectFacturaType` (export from the bridge)
— override it via `createFacturacionHook({ selectFacturaType: yourFn })`
for special cases.

## What ends up in `order.metadata`

```json
{
  "factura_type": "C",
  "factura_cae": "70123456789012",
  "factura_cae_vencimiento": "20260520",
  "factura_numero": 42,
  "factura_punto_venta": 1,
  "factura_cuit_emisor": "20417581015",
  "factura_importe_total": 1210,
  "factura_importe_iva": 0,
  "factura_importe_neto": 1210,
  "factura_buyer_legal_name": "Tere Lopez",
  "factura_buyer_doc": "27123456780"
}
```

The agent receives this on the ACP `order_create` webhook. Your accounting
software downloads it via the same channel — no separate invoice export
job, no handwritten reconciliation.

## Failure mode: WSFE rejects

If WSFE returns `resultado: "R"` (rejected) or the call throws (network
issues, expired cert, AFIP outage), the order STILL persists. The hook
attaches `factura_error` to `order.metadata`:

```json
{
  "factura_type": "C",
  "factura_error": "WSFE rejected: Servicio no disponible momentáneamente"
}
```

Your retry job picks up these orders by querying for
`metadata.factura_error IS NOT NULL` and re-emits out-of-band. The
payment was already authorized — only the invoice failed.

Pair with [03 — AP2 verification in processPayment](./03-ap2-verification.md)
for the cryptographic version of this story.
