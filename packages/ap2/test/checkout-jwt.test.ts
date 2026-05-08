import { describe, it, expect } from "vitest";
import {
  signCheckoutJwt,
  verifyCheckoutJwt,
  computeCheckoutHash,
  decodeCheckoutJwt,
  CheckoutJwtAlgError,
  generateAp2KeyPair,
  importPublicJwk,
} from "../src";

const samplePayload = {
  order_id: "order_1",
  merchant: { id: "merchant_1", name: "Demo" },
  line_items: [
    {
      id: "line_1",
      product: { id: "p1", title: "T", price: 100, currency: "USD" },
      quantity: 1,
    },
  ],
  total_price: 100,
  currency: "USD",
};

describe("signCheckoutJwt + verifyCheckoutJwt", () => {
  it("signs and verifies a checkout payload round-trip with ES256", async () => {
    const { privateKey, publicJwk } = await generateAp2KeyPair("ES256");
    const publicKey = await importPublicJwk(publicJwk, "ES256");
    const checkoutJwt = await signCheckoutJwt(samplePayload, privateKey);
    const result = await verifyCheckoutJwt(checkoutJwt, publicKey);
    expect((result.payload as { order_id: string }).order_id).toBe("order_1");
    expect(result.alg).toBe("ES256");
  });

  it("rejects EdDSA at signing time", async () => {
    const { privateKey } = await generateAp2KeyPair("EdDSA");
    await expect(
      signCheckoutJwt(samplePayload, privateKey, {
        alg: "EdDSA" as never,
      }),
    ).rejects.toThrow(CheckoutJwtAlgError);
  });

  it("rejects 'none' algorithm", async () => {
    const { privateKey } = await generateAp2KeyPair("ES256");
    await expect(
      signCheckoutJwt(samplePayload, privateKey, {
        alg: "none" as never,
      }),
    ).rejects.toThrow(CheckoutJwtAlgError);
  });
});

describe("computeCheckoutHash", () => {
  it("returns a stable base64url sha-256", async () => {
    const { privateKey } = await generateAp2KeyPair();
    const jwt = await signCheckoutJwt(samplePayload, privateKey);
    const hash = await computeCheckoutHash(jwt);
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
    const again = await computeCheckoutHash(jwt);
    expect(again).toBe(hash);
  });

  it("differs when the JWT changes", async () => {
    const { privateKey } = await generateAp2KeyPair();
    const a = await signCheckoutJwt(samplePayload, privateKey);
    const b = await signCheckoutJwt(
      { ...samplePayload, total_price: 200 },
      privateKey,
    );
    const hashA = await computeCheckoutHash(a);
    const hashB = await computeCheckoutHash(b);
    expect(hashA).not.toBe(hashB);
  });
});

describe("decodeCheckoutJwt", () => {
  it("decodes header + payload without verifying signature", async () => {
    const { privateKey } = await generateAp2KeyPair();
    const jwt = await signCheckoutJwt(samplePayload, privateKey);
    const { header, payload } = decodeCheckoutJwt(jwt);
    expect(header.alg).toBe("ES256");
    expect(header.typ).toBe("JWT");
    expect((payload as { order_id: string }).order_id).toBe("order_1");
  });
});
