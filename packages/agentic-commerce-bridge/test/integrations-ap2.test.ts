// Smoke test for the AP2 mandate integration helper in the bridge.
// Issues a real AP2 closed checkout mandate via @ar-agents/ap2 and verifies
// it through the bridge's helper, end-to-end.

import { describe, it, expect } from "vitest";
import {
  generateAp2KeyPair,
  signCheckoutJwt,
  computeCheckoutHash,
  issueClosedCheckoutMandate,
  importPublicJwk,
} from "@ar-agents/ap2";
import {
  verifyAp2CheckoutCredential,
  signAp2CheckoutReceipt,
  signAp2PaymentReceipt,
} from "../src/integrations/ap2";

const sampleCheckout = {
  order_id: "ord_bridge_ap2",
  merchant: { id: "merchant_x", name: "Bridge X" },
  line_items: [
    {
      id: "li_1",
      product: {
        id: "p1",
        title: "Widget",
        price: 100,
        currency: "USD",
      },
      quantity: 1,
    },
  ],
  total_price: 100,
  currency: "USD",
};

describe("verifyAp2CheckoutCredential", () => {
  it("verifies an AP2 closed checkout mandate end-to-end", async () => {
    const merchant = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");

    const checkoutJwt = await signCheckoutJwt(sampleCheckout, merchant.privateKey);
    const checkoutHash = await computeCheckoutHash(checkoutJwt);
    const presentation = await issueClosedCheckoutMandate({
      mandate: {
        vct: "mandate.checkout.1",
        checkout_jwt: checkoutJwt,
        checkout_hash: checkoutHash,
      },
      signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
    });

    const result = await verifyAp2CheckoutCredential({
      credentialToken: presentation,
      agentPublicJwk: agent.publicJwk,
      merchantPublicJwk: merchant.publicJwk,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.checkout.order_id).toBe("ord_bridge_ap2");
    expect(result.sdHash).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.closed.checkout_hash).toBe(checkoutHash);
  });

  it("returns failure with mapped ACP error code when verification fails", async () => {
    const merchant = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");
    const wrongAgent = await generateAp2KeyPair("ES256");

    const checkoutJwt = await signCheckoutJwt(sampleCheckout, merchant.privateKey);
    const checkoutHash = await computeCheckoutHash(checkoutJwt);
    const presentation = await issueClosedCheckoutMandate({
      mandate: {
        vct: "mandate.checkout.1",
        checkout_jwt: checkoutJwt,
        checkout_hash: checkoutHash,
      },
      signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
    });

    const result = await verifyAp2CheckoutCredential({
      credentialToken: presentation,
      // WRONG agent key — verification should fail.
      agentPublicJwk: wrongAgent.publicJwk,
      merchantPublicJwk: merchant.publicJwk,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected fail");
    expect(result.code).toBe("invalid_payment_token");
    expect(result.reason).toBeTruthy();
  });
});

describe("signAp2CheckoutReceipt", () => {
  it("produces a JWT receipt with reference = sdHash", async () => {
    const merchant = await generateAp2KeyPair("ES256");
    const merchantPublic = await importPublicJwk(merchant.publicJwk, "ES256");
    const sdHash = "fake-sd-hash-for-test";
    const jwt = await signAp2CheckoutReceipt({
      merchantPrivateKey: merchant.privateKey,
      issuer: "merchant_x",
      sdHash,
      orderId: "ord_xyz",
    });
    expect(jwt.split(".").length).toBe(3);

    // Verify via the AP2 package directly.
    const { verifyCheckoutReceipt } = await import("@ar-agents/ap2");
    const verified = await verifyCheckoutReceipt(jwt, merchantPublic, {
      expectedIssuer: "merchant_x",
      expectedReference: sdHash,
    });
    expect(verified.order_id).toBe("ord_xyz");
    expect(verified.status).toBe("Success");
  });
});

describe("signAp2PaymentReceipt", () => {
  it("produces a JWT payment receipt with payment_id + sdHash reference", async () => {
    const mpp = await generateAp2KeyPair("ES256");
    const mppPublic = await importPublicJwk(mpp.publicJwk, "ES256");
    const sdHash = "payment-sd-hash";
    const jwt = await signAp2PaymentReceipt({
      mppPrivateKey: mpp.privateKey,
      issuer: "mpp.test",
      sdHash,
      paymentId: "PAY-123",
      pspConfirmationId: "psp-456",
    });
    expect(jwt.split(".").length).toBe(3);

    const { verifyPaymentReceipt } = await import("@ar-agents/ap2");
    const verified = await verifyPaymentReceipt(jwt, mppPublic, {
      expectedIssuer: "mpp.test",
      expectedReference: sdHash,
    });
    expect(verified.payment_id).toBe("PAY-123");
    expect(verified.psp_confirmation_id).toBe("psp-456");
  });
});
