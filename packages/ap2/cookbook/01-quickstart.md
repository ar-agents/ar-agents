# 01 — Quickstart

Sign and verify your first AP2 v0.2 Closed Checkout Mandate in ~30 lines of TypeScript.

```ts
import {
  generateAp2KeyPair,
  signCheckoutJwt,
  computeCheckoutHash,
  issueClosedCheckoutMandate,
  verifyClosedCheckoutMandate,
} from "@ar-agents/ap2";

// 1. Generate keys (in production, persist via your secret manager).
const merchant = await generateAp2KeyPair("ES256");
const agent = await generateAp2KeyPair("ES256");

// 2. Merchant signs the inner checkout_jwt with ES256.
const checkoutJwt = await signCheckoutJwt(
  {
    order_id: "ord_123",
    merchant: { id: "merchant_1", name: "Demo" },
    line_items: [
      {
        id: "li_1",
        product: {
          id: "shoe_red",
          title: "Red Shoe",
          price: 199,
          currency: "USD",
        },
        quantity: 1,
      },
    ],
    total_price: 199,
    currency: "USD",
  },
  merchant.privateKey,
);
const checkoutHash = await computeCheckoutHash(checkoutJwt);

// 3. Agent issues the Closed Checkout Mandate (SD-JWT VC presentation).
const presentation = await issueClosedCheckoutMandate({
  mandate: {
    vct: "mandate.checkout.1",
    checkout_jwt: checkoutJwt,
    checkout_hash: checkoutHash,
  },
  signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
});

// 4. Merchant verifies.
const result = await verifyClosedCheckoutMandate(presentation, {
  issuerKey: agent.publicJwk,
  checkoutJwtKey: merchant.publicJwk,
});
if (!result.ok) throw new Error(result.reason);

console.log("verified order_id:", result.mandate.checkout.order_id);
console.log("sdHash for receipt reference:", result.sdHash);
```

## What just happened

1. `signCheckoutJwt` enforces the AP2 spec rule: the inner `checkout_jwt`
   MUST use a non-deterministic algorithm (ECDSA family). Trying to pass
   `alg: "EdDSA"` throws `CheckoutJwtAlgError` — Ed25519 leaks no signature
   entropy, leaving `checkout_hash` open to rainbow-table attacks.
2. `computeCheckoutHash` returns `base64url(sha-256(checkout_jwt))`.
3. `issueClosedCheckoutMandate` wraps the closed mandate as an SD-JWT VC
   compact presentation with `vct: "mandate.checkout.1"` and selectively
   discloses the `checkout_jwt` field.
4. `verifyClosedCheckoutMandate` walks the canonical AP2 §C verification
   order: signature → time claims → schema → `checkout_hash` recompute →
   inner `checkout_jwt` signature.

## Where to go next

- [02 — Multi-hop chains](./02-multi-hop.md) — delegated mandates
- [03 — Budget tracking](./03-budget-tracking.md) — stateful evaluator
- [04 — Vercel AI SDK integration](./04-ai-sdk.md) — drop-in tools for `Experimental_Agent`
- [05 — MELI + ARCA full flow](./05-meli-arca.md) — Argentine fiscal end-to-end
