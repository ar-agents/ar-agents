# 03 — AP2 verification in `processPayment`

When the agent submits an AP2 Closed Checkout Mandate as the payment
credential, the bridge's `PaymentProvider` should verify the mandate
*before* authorizing the actual payment downstream (MP, x402, card rails).

This recipe wires the AP2 helper inside a custom `PaymentProvider`.

```ts
import {
  verifyAp2CheckoutCredential,
  signAp2CheckoutReceipt,
} from "@ar-agents/agentic-commerce-bridge";
import type { PaymentProvider } from "@ar-agents/agentic-commerce-bridge";

const ap2MpProvider: PaymentProvider = {
  handlerId: "ap2-mp",
  async processPayment({ session, paymentData }) {
    const cred = paymentData.instrument?.credential;

    if (cred?.type === "ap2_mandate") {
      // 1. Verify the AP2 mandate.
      const verified = await verifyAp2CheckoutCredential({
        credentialToken: cred.token,
        agentPublicJwk: AGENT_PUBLIC_JWK,
        merchantPublicJwk: MERCHANT_PUBLIC_JWK,
      });
      if (!verified.ok) {
        return { success: false, code: verified.code, message: verified.reason };
      }

      // 2. Cross-check that the AP2 inner checkout_jwt matches the ACP session.
      // (defense-in-depth — agents shouldn't pass mismatched mandates).
      if (verified.checkout.merchant.id !== "your_merchant_id") {
        return {
          success: false,
          code: "validation_failed",
          message: `AP2 mandate's merchant.id ('${verified.checkout.merchant.id}') does not match this merchant`,
        };
      }
      const sessionTotalMinor = session.totals.find((t) => t.type === "total")?.amount ?? 0;
      const mandateTotalMajor = verified.checkout.total_price;
      const mandateTotalMinor = Math.round(mandateTotalMajor * 100);
      if (Math.abs(mandateTotalMinor - sessionTotalMinor) > 1) {
        return {
          success: false,
          code: "validation_failed",
          message: `AP2 mandate total (${mandateTotalMinor} minor) does not match ACP session total (${sessionTotalMinor} minor)`,
        };
      }

      // 3. Authorize the actual payment downstream.
      const mpResult = await mpProvider.processPayment({ session, paymentData });
      if (!mpResult.success) return mpResult;

      // 4. Sign an AP2 CheckoutReceipt and attach.
      const receiptJwt = await signAp2CheckoutReceipt({
        merchantPrivateKey: MERCHANT_PRIVATE_KEY,
        issuer: "your_merchant_id",
        sdHash: verified.sdHash,
        orderId: mpResult.paymentId,
      });
      return {
        ...mpResult,
        metadata: {
          ...(mpResult.metadata ?? {}),
          ap2_receipt: receiptJwt,
          ap2_sd_hash: verified.sdHash,
          ap2_verified: true,
        },
      };
    }

    // Non-AP2 credential — fall through to plain MP processing.
    return mpProvider.processPayment({ session, paymentData });
  },
};
```

## Why defense-in-depth on the inner checkout

ACP and AP2 are separate protocols. ACP's `CheckoutSession.totals` is set
by the merchant; AP2's `checkout_jwt.total_price` is signed by the
merchant separately. They MUST match — if they don't, the agent has
constructed an inconsistent payload and we should refuse.

Same defense applies to:

- `merchant.id` (must match the bridge's configured merchant)
- `currency` (must match between ACP session and AP2 inner)
- `line_items[*].product.id` (should match what's in the ACP cart)

Your bridge mounts behind the merchant's domain, but AP2 mandates can be
constructed by anyone. Always cross-check session ↔ mandate.

## Error code mapping

`verifyAp2CheckoutCredential` returns AP2 error codes; the helper maps them
to ACP's `processing_error` codes for `PaymentResult`:

| AP2 code | ACP code |
|---|---|
| `invalid_credential` | `invalid_payment_token` |
| `invalid_mandate` | `validation_failed` |
| `unresolved_constraint` | `validation_failed` |
| `mandates_not_supported` | `unsupported_capability` |

The agent sees the ACP code in the `400/402` response body and can branch
on it to decide whether to retry, escalate to a human, or abandon.

## Receipt verification

Issue receipts using `signAp2CheckoutReceipt`. Verify them downstream
using `@ar-agents/ap2`'s `verifyCheckoutReceipt` against the merchant's
public JWK. Agents MUST persist receipts as evidence — they're the
non-repudiable proof that the merchant accepted the agent's mandate.

Pair with [02 — ARCA factura](./02-arca-factura.md) for the legal
counterpart: AFIP-signed CAE alongside the AP2-signed receipt in the
same `order.metadata`.
