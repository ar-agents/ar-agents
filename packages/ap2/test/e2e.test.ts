// End-to-end AP2 v0.2 single-hop scenarios.
//
// Covers the canonical flow:
//   1. Trusted Surface signs an Open Checkout Mandate with constraints.
//   2. Agent signs a Closed Checkout Mandate carrying the merchant's
//      `checkout_jwt`.
//   3. Merchant verifies the closed checkout, evaluates open constraints,
//      issues a CheckoutReceipt.
//   4. Agent signs a Closed Payment Mandate referencing `transaction_id`
//      = closed_checkout's `checkout_hash`.
//   5. Credential Provider verifies the payment + evaluates open payment
//      constraints, issues a PaymentReceipt.

import { describe, it, expect } from "vitest";
import {
  generateAp2KeyPair,
  importPublicJwk,
  signCheckoutJwt,
  computeCheckoutHash,
  issueOpenCheckoutMandate,
  issueClosedCheckoutMandate,
  issueOpenPaymentMandate,
  issueClosedPaymentMandate,
  verifyClosedCheckoutMandate,
  verifyOpenCheckoutMandate,
  verifyClosedPaymentMandate,
  verifyOpenPaymentMandate,
  buildCheckoutReceipt,
  buildPaymentReceipt,
  verifyCheckoutReceipt,
  verifyPaymentReceipt,
  computeSdHash,
  parseSdJwt,
  type OpenCheckoutMandate,
  type ClosedCheckoutMandate,
  type OpenPaymentMandate,
  type ClosedPaymentMandate,
  type CheckoutJwtPayload,
} from "../src";

describe("AP2 single-hop end-to-end", () => {
  it("issues + verifies + receipts a full Direct flow", async () => {
    // ---------- Setup keys ----------
    const merchantKeys = await generateAp2KeyPair("ES256");
    const agentKeys = await generateAp2KeyPair("ES256");
    const mppKeys = await generateAp2KeyPair("ES256");
    const merchantPublic = await importPublicJwk(merchantKeys.publicJwk, "ES256");
    const agentPublic = await importPublicJwk(agentKeys.publicJwk, "ES256");
    const mppPublic = await importPublicJwk(mppKeys.publicJwk, "ES256");

    // ---------- Step 1: Merchant signs the inner checkout_jwt ----------
    const checkoutPayload: CheckoutJwtPayload = {
      order_id: "ord_e2e_1",
      merchant: { id: "merchant_e2e", name: "E2E Demo" },
      line_items: [
        {
          id: "li_1",
          product: { id: "shoe_red", title: "Red Shoe", price: 199.0, currency: "USD" },
          quantity: 1,
        },
      ],
      total_price: 199.0,
      currency: "USD",
    };
    const checkoutJwt = await signCheckoutJwt(checkoutPayload, merchantKeys.privateKey);
    const checkoutHash = await computeCheckoutHash(checkoutJwt);

    // ---------- Step 2: Trusted Surface signs Open Checkout Mandate ----------
    const openCheckout: OpenCheckoutMandate = {
      vct: "mandate.checkout.open.1",
      constraints: [
        {
          type: "checkout.allowed_merchants",
          allowed: [{ id: "merchant_e2e" }],
        },
        {
          type: "checkout.line_items",
          items: [
            {
              id: "c_shoes",
              acceptable_items: [{ id: "shoe_red" }, { id: "shoe_blue" }],
              quantity: 1,
            },
          ],
        },
      ],
      cnf: { jwk: agentKeys.publicJwk },
      iat: Math.floor(Date.now() / 1000),
    };
    const openCheckoutPresentation = await issueOpenCheckoutMandate({
      mandate: openCheckout,
      signingCtx: { privateKey: merchantKeys.privateKey, alg: "ES256" },
    });

    // ---------- Step 3: Agent signs Closed Checkout Mandate ----------
    const closedCheckout: ClosedCheckoutMandate = {
      vct: "mandate.checkout.1",
      checkout_jwt: checkoutJwt,
      checkout_hash: checkoutHash,
      iat: Math.floor(Date.now() / 1000),
    };
    const closedCheckoutPresentation = await issueClosedCheckoutMandate({
      mandate: closedCheckout,
      signingCtx: { privateKey: agentKeys.privateKey, alg: "ES256" },
    });

    // ---------- Step 4: Merchant verifies Closed Checkout Mandate ----------
    const verifyClosedResult = await verifyClosedCheckoutMandate(
      closedCheckoutPresentation,
      {
        issuerKey: agentKeys.publicJwk,
        checkoutJwtKey: merchantKeys.publicJwk,
      },
    );
    expect(verifyClosedResult.ok).toBe(true);
    if (!verifyClosedResult.ok) throw new Error("expected ok");
    expect(verifyClosedResult.mandate.checkout.order_id).toBe("ord_e2e_1");
    expect(verifyClosedResult.mandate.checkout.merchant.id).toBe("merchant_e2e");
    const closedSdHash = verifyClosedResult.sdHash;

    // ---------- Step 5: Merchant evaluates Open Checkout Mandate ----------
    const verifyOpenResult = await verifyOpenCheckoutMandate(
      openCheckoutPresentation,
      {
        issuerKey: merchantKeys.publicJwk,
        closedCheckout: verifyClosedResult.mandate.checkout,
        closedMandate: verifyClosedResult.mandate.closed,
      },
    );
    expect(verifyOpenResult.ok).toBe(true);

    // ---------- Step 6: Merchant issues CheckoutReceipt ----------
    const checkoutReceiptJwt = await buildCheckoutReceipt({
      receipt: {
        status: "Success",
        iss: "merchant_e2e",
        iat: Math.floor(Date.now() / 1000),
        reference: closedSdHash,
        order_id: "ord_e2e_1",
      },
      signingKey: merchantKeys.privateKey,
    });
    const verifiedCheckoutReceipt = await verifyCheckoutReceipt(
      checkoutReceiptJwt,
      merchantPublic,
      { expectedIssuer: "merchant_e2e", expectedReference: closedSdHash },
    );
    expect(verifiedCheckoutReceipt.status).toBe("Success");

    // ---------- Step 7: Agent signs Open + Closed Payment Mandate ----------
    // Compute the digest of the Open Checkout Mandate presentation for
    // payment.reference linkage.
    const openCheckoutParts = parseSdJwt(openCheckoutPresentation);
    const openCheckoutDigest = await computeSdHash({
      issuerJwt: openCheckoutParts.issuerJwt,
      disclosures: openCheckoutParts.disclosures,
    });

    const openPayment: OpenPaymentMandate = {
      vct: "mandate.payment.open.1",
      constraints: [
        {
          type: "payment.reference",
          conditional_transaction_id: openCheckoutDigest,
        },
        {
          type: "payment.amount_range",
          currency: "USD",
          max: 50000, // 500 USD cap, well above 199 USD
        },
        {
          type: "payment.allowed_payees",
          allowed: [{ id: "merchant_e2e" }],
        },
      ],
      cnf: { jwk: agentKeys.publicJwk },
    };
    const openPaymentPresentation = await issueOpenPaymentMandate({
      mandate: openPayment,
      signingCtx: { privateKey: merchantKeys.privateKey, alg: "ES256" },
    });

    const closedPayment: ClosedPaymentMandate = {
      vct: "mandate.payment.1",
      transaction_id: checkoutHash, // === Closed Checkout's checkout_hash
      payee: { id: "merchant_e2e" },
      payment_amount: { amount: 19900, currency: "USD" }, // $199.00
      payment_instrument: { id: "card_x", type: "card" },
    };
    const closedPaymentPresentation = await issueClosedPaymentMandate({
      mandate: closedPayment,
      signingCtx: { privateKey: agentKeys.privateKey, alg: "ES256" },
    });

    // ---------- Step 8: Credential Provider verifies Closed Payment Mandate ----------
    const verifyClosedPaymentResult = await verifyClosedPaymentMandate(
      closedPaymentPresentation,
      {
        issuerKey: agentKeys.publicJwk,
        expectedTransactionId: checkoutHash,
      },
    );
    expect(verifyClosedPaymentResult.ok).toBe(true);
    if (!verifyClosedPaymentResult.ok) throw new Error("expected ok");

    // ---------- Step 9: Credential Provider evaluates Open Payment Mandate ----------
    const verifyOpenPaymentResult = await verifyOpenPaymentMandate(
      openPaymentPresentation,
      {
        issuerKey: merchantKeys.publicJwk,
        closedMandate: verifyClosedPaymentResult.mandate.closed,
        linkedCheckoutMandateDigest: openCheckoutDigest,
      },
    );
    expect(verifyOpenPaymentResult.ok).toBe(true);

    // ---------- Step 10: MPP issues PaymentReceipt ----------
    const paymentReceiptJwt = await buildPaymentReceipt({
      receipt: {
        status: "Success",
        iss: "mpp.acme",
        iat: Math.floor(Date.now() / 1000),
        reference: verifyClosedPaymentResult.mandate.sdHash,
        payment_id: "PAY-e2e-001",
        psp_confirmation_id: "psp-7c2f8e",
      },
      signingKey: mppKeys.privateKey,
    });
    const verifiedPaymentReceipt = await verifyPaymentReceipt(
      paymentReceiptJwt,
      mppPublic,
      {
        expectedIssuer: "mpp.acme",
        expectedReference: verifyClosedPaymentResult.mandate.sdHash,
      },
    );
    expect(verifiedPaymentReceipt.status).toBe("Success");
    expect(verifiedPaymentReceipt.payment_id).toBe("PAY-e2e-001");
  });

  it("verifyClosedCheckoutMandate fails when merchant key is wrong", async () => {
    const merchantKeys = await generateAp2KeyPair("ES256");
    const wrongMerchantKeys = await generateAp2KeyPair("ES256");
    const agentKeys = await generateAp2KeyPair("ES256");

    const checkoutPayload: CheckoutJwtPayload = {
      order_id: "x",
      merchant: { id: "m", name: "M" },
      line_items: [
        {
          id: "li",
          product: { id: "p", title: "T", price: 1, currency: "USD" },
          quantity: 1,
        },
      ],
      total_price: 1,
      currency: "USD",
    };
    const checkoutJwt = await signCheckoutJwt(checkoutPayload, merchantKeys.privateKey);
    const checkoutHash = await computeCheckoutHash(checkoutJwt);

    const closedCheckoutPresentation = await issueClosedCheckoutMandate({
      mandate: {
        vct: "mandate.checkout.1",
        checkout_jwt: checkoutJwt,
        checkout_hash: checkoutHash,
      },
      signingCtx: { privateKey: agentKeys.privateKey, alg: "ES256" },
    });

    // Verify with the WRONG merchant key.
    const r = await verifyClosedCheckoutMandate(closedCheckoutPresentation, {
      issuerKey: agentKeys.publicJwk,
      checkoutJwtKey: wrongMerchantKeys.publicJwk,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_credential");
  });

  it("verifyOpenCheckoutMandate fails when allowed_merchants doesn't include the actual merchant", async () => {
    const merchantKeys = await generateAp2KeyPair("ES256");
    const agentKeys = await generateAp2KeyPair("ES256");

    const checkoutPayload: CheckoutJwtPayload = {
      order_id: "x",
      merchant: { id: "actual_merchant" },
      line_items: [
        {
          id: "li",
          product: { id: "p", title: "T", price: 1, currency: "USD" },
          quantity: 1,
        },
      ],
      total_price: 1,
      currency: "USD",
    };
    const checkoutJwt = await signCheckoutJwt(checkoutPayload, merchantKeys.privateKey);
    const checkoutHash = await computeCheckoutHash(checkoutJwt);

    const closedCheckout: ClosedCheckoutMandate = {
      vct: "mandate.checkout.1",
      checkout_jwt: checkoutJwt,
      checkout_hash: checkoutHash,
    };
    const closedPres = await issueClosedCheckoutMandate({
      mandate: closedCheckout,
      signingCtx: { privateKey: agentKeys.privateKey, alg: "ES256" },
    });
    const closedVerify = await verifyClosedCheckoutMandate(closedPres, {
      issuerKey: agentKeys.publicJwk,
      checkoutJwtKey: merchantKeys.publicJwk,
    });
    if (!closedVerify.ok) throw new Error("expected ok");

    const openPres = await issueOpenCheckoutMandate({
      mandate: {
        vct: "mandate.checkout.open.1",
        constraints: [
          {
            type: "checkout.allowed_merchants",
            allowed: [{ id: "OTHER_merchant" }],
          },
        ],
        cnf: { jwk: agentKeys.publicJwk },
      },
      signingCtx: { privateKey: merchantKeys.privateKey, alg: "ES256" },
    });
    const r = await verifyOpenCheckoutMandate(openPres, {
      issuerKey: merchantKeys.publicJwk,
      closedCheckout: closedVerify.mandate.checkout,
      closedMandate: closedVerify.mandate.closed,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_mandate");
  });

  it("verifyClosedPaymentMandate fails on transaction_id mismatch", async () => {
    const agentKeys = await generateAp2KeyPair("ES256");
    const presentation = await issueClosedPaymentMandate({
      mandate: {
        vct: "mandate.payment.1",
        transaction_id: "actual_hash",
        payee: { id: "m" },
        payment_amount: { amount: 100, currency: "USD" },
        payment_instrument: { id: "c", type: "card" },
      },
      signingCtx: { privateKey: agentKeys.privateKey, alg: "ES256" },
    });
    const r = await verifyClosedPaymentMandate(presentation, {
      issuerKey: agentKeys.publicJwk,
      expectedTransactionId: "DIFFERENT_hash",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_mandate");
  });
});
