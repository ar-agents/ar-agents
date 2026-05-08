# 05 — MercadoLibre + ARCA full flow

The Argentine moat: end-to-end agentic checkout where ChatGPT (or any
ACP/AP2-compliant agent) buys from a MercadoLibre seller, the bridge
verifies the AP2 mandate, MercadoPago authorizes the payment, and AFIP
emits a Factura A/B/C/E automatically — all signed, all auditable.

```
                                    ┌────────────────────────┐
[ChatGPT Buyer Agent]               │  @ar-agents/...        │
  ↓ AP2 mandate (SD-JWT VC)         │                        │
[ACP /checkout_sessions/:id/complete]│  agentic-commerce-     │
  ↓ payment_data.credential          │  bridge                │
[verifyAp2CheckoutCredential] <─────│   ↓                    │
  ↓ pass                             │  ap2 (verify)          │
[MercadoPago Payment lookup]   <────│   ↓                    │
  ↓ status=approved                  │  mercadopago           │
[onOrderConfirmed hook]        <────│   ↓                    │
  ↓ FacturacionHook                  │  facturacion +          │
[ARCA WSFE solicitarCAE]       <────│  identity               │
  ↓ CAE returned                     │   ↓                    │
[signAp2CheckoutReceipt]       <────│  ap2 (sign)            │
  ↓ JWT receipt                      │                        │
[Order persisted, agent gets        └────────────────────────┘
 ACP order_create webhook with
 metadata.factura_cae +
 metadata.ap2_receipt]
```

## Wire the bridge

```ts
import { createFacilitator, InMemoryStateAdapter } from "@ar-agents/agentic-commerce-bridge";
import { createMercadoPagoPaymentProvider, mercadoPagoPaymentHandler } from "@ar-agents/agentic-commerce-bridge";
import { createMeliCatalogProvider } from "@ar-agents/agentic-commerce-bridge";
import { createFacturacionHook } from "@ar-agents/agentic-commerce-bridge";
import {
  verifyAp2CheckoutCredential,
  signAp2CheckoutReceipt,
} from "@ar-agents/agentic-commerce-bridge";

const mp = createMercadoPagoPaymentProvider({
  createPreference: (p) => mpClient.preferences.create({ body: p }),
  lookupPayment: (id) => mpClient.payments.get({ id }),
});

// Wrap MP provider so it AP2-verifies the credential before processing.
const ap2EnforcedProvider = {
  ...mp,
  async processPayment(args) {
    if (args.paymentData.instrument?.credential?.type === "ap2_mandate") {
      const verified = await verifyAp2CheckoutCredential({
        credentialToken: args.paymentData.instrument.credential.token,
        agentPublicJwk: AGENT_PUBLIC_JWK,
        merchantPublicJwk: MERCHANT_PUBLIC_JWK,
      });
      if (!verified.ok) {
        return { success: false, code: verified.code, message: verified.reason };
      }
      // Hand off to MP processing with verified context attached.
      const mpResult = await mp.processPayment(args);
      if (mpResult.success) {
        const receiptJwt = await signAp2CheckoutReceipt({
          merchantPrivateKey: MERCHANT_PRIVATE_KEY,
          issuer: "merchant_1",
          sdHash: verified.sdHash,
          orderId: mpResult.paymentId,
        });
        return {
          ...mpResult,
          metadata: {
            ...(mpResult.metadata ?? {}),
            ap2_receipt: receiptJwt,
            ap2_sd_hash: verified.sdHash,
          },
        };
      }
      return mpResult;
    }
    // Non-AP2 credential — fall through.
    return mp.processPayment(args);
  },
};

const facilitator = createFacilitator({
  state: new InMemoryStateAdapter(),
  catalog: createMeliCatalogProvider({
    getItem: (id) => fetch(`https://api.mercadolibre.com/items/${id}`).then(r => r.ok ? r.json() : null),
  }),
  paymentProviders: { [ap2EnforcedProvider.handlerId]: ap2EnforcedProvider },
  paymentHandlers: [mercadoPagoPaymentHandler({})],
  webhookSecret: process.env.ACP_WEBHOOK_SECRET,
  hooks: createFacturacionHook({
    seller: {
      cuit: "20417581015",
      punto_venta: 1,
      regime: "monotributo",
    },
    wsfe: wsfeClient, // from @ar-agents/facturacion
    arcaPadronLookup: arcaPadron.lookup, // from @ar-agents/identity
  }),
});
```

## What the agent sees

```
1. Agent calls POST /api/acp/checkout_sessions
   → Returns ACP CheckoutSession with capabilities listing the AP2 credential type.

2. Agent constructs Open + Closed Checkout Mandates per AP2 v0.2.

3. Agent calls POST /api/acp/checkout_sessions/:id/complete with:
   payment_data: {
     handler_id: "mercadopago",
     instrument: {
       type: "card",
       credential: { type: "ap2_mandate", token: "<SD-JWT VC>" }
     }
   }

4. Bridge:
   a. Verifies AP2 mandate (signature, checkout_hash, inner checkout_jwt).
   b. Looks up the linked MP payment (existing flow).
   c. Calls onOrderConfirmed → FacturacionHook → AFIP WSFE.
   d. Signs an AP2 CheckoutReceipt with sdHash + order_id.

5. Agent receives ACP CheckoutSessionWithOrder where:
   order.metadata.factura_cae = "70123456789012"
   order.metadata.factura_type = "C"
   order.metadata.factura_numero = 42
   order.metadata.ap2_receipt = "<JWT>"
   order.metadata.ap2_sd_hash = "<base64url>"
```

## Why this is the moat

Every other ACP/AP2 stack in the world stops at "verify the mandate".
This one continues:

- ARCA-padrón-aware buyer fiscal classification (CUIT → IVA condition)
- AFIP-signed Factura A/B/C/E for every transaction
- AP2-signed CheckoutReceipt + AFIP CAE in the same `order.metadata`
- Cryptographic audit trail readable by any AP2-compliant verifier
  PLUS legally-binding electronic invoice readable by any Argentine
  tax authority

A monotributista seller using this stack stops emitting facturas by hand.
Their books reconcile automatically. Their accountant downloads CSV.

That's "Tere talks to ChatGPT, ChatGPT buys her yerba on MELI, AFIP gets
its receipt the same second" — without Tere thinking about it.
