import { describe, it, expect } from "vitest";
import {
  signWebhook,
  verifyWebhook,
  verifyAndParseWebhook,
  WebhookVerificationError,
} from "../src/webhook";
import { WebhookEvent } from "../src/schemas/webhook";

const SECRET = "whsec_test_2026_04_17_naza";

const sampleEvent = {
  type: "order_update",
  data: {
    type: "order",
    id: "ord_abc",
    checkout_session_id: "cs_xyz",
    permalink_url: "https://example.com/o/ord_abc",
    status: "shipped",
  },
};

describe("signWebhook", () => {
  it("produces a Merchant-Signature in t=…,v1=… format", async () => {
    const signed = await signWebhook({
      secret: SECRET,
      rawBody: JSON.stringify(sampleEvent),
      timestamp: 1717000000,
    });
    expect(signed.signature).toMatch(/^t=1717000000,v1=[a-f0-9]{64}$/);
    expect(signed.timestamp).toBe(1717000000);
  });

  it("defaults timestamp to wall clock", async () => {
    const before = Math.floor(Date.now() / 1000);
    const signed = await signWebhook({
      secret: SECRET,
      rawBody: "{}",
    });
    const after = Math.floor(Date.now() / 1000);
    expect(signed.timestamp).toBeGreaterThanOrEqual(before);
    expect(signed.timestamp).toBeLessThanOrEqual(after);
  });
});

describe("verifyWebhook", () => {
  it("verifies a freshly-signed webhook within tolerance", async () => {
    const rawBody = JSON.stringify(sampleEvent);
    const timestamp = 1717000000;
    const { signature } = await signWebhook({
      secret: SECRET,
      rawBody,
      timestamp,
    });
    const result = await verifyWebhook({
      secret: SECRET,
      rawBody,
      signatureHeader: signature,
      now: timestamp + 10,
    });
    expect(result.timestamp).toBe(timestamp);
    expect(result.payload).toEqual(sampleEvent);
  });

  it("throws on missing signature header", async () => {
    await expect(
      verifyWebhook({
        secret: SECRET,
        rawBody: "{}",
        signatureHeader: null,
      }),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("throws on malformed signature header", async () => {
    await expect(
      verifyWebhook({
        secret: SECRET,
        rawBody: "{}",
        signatureHeader: "garbage",
      }),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("throws when timestamp is older than tolerance window (default 300s)", async () => {
    const rawBody = JSON.stringify(sampleEvent);
    const { signature } = await signWebhook({
      secret: SECRET,
      rawBody,
      timestamp: 1700000000,
    });
    await expect(
      verifyWebhook({
        secret: SECRET,
        rawBody,
        signatureHeader: signature,
        now: 1700001000,
      }),
    ).rejects.toMatchObject({
      detail: { code: "timestamp_out_of_window" },
    });
  });

  it("respects custom tolerance window", async () => {
    const rawBody = JSON.stringify(sampleEvent);
    const { signature } = await signWebhook({
      secret: SECRET,
      rawBody,
      timestamp: 1700000000,
    });
    const r = await verifyWebhook({
      secret: SECRET,
      rawBody,
      signatureHeader: signature,
      now: 1700001000,
      toleranceSeconds: 2000,
    });
    expect(r.timestamp).toBe(1700000000);
  });

  it("throws on signature mismatch (wrong secret)", async () => {
    const rawBody = JSON.stringify(sampleEvent);
    const { signature } = await signWebhook({
      secret: SECRET,
      rawBody,
      timestamp: 1717000000,
    });
    await expect(
      verifyWebhook({
        secret: "different-secret",
        rawBody,
        signatureHeader: signature,
        now: 1717000010,
      }),
    ).rejects.toMatchObject({
      detail: { code: "signature_mismatch" },
    });
  });

  it("throws on signature mismatch (tampered body)", async () => {
    const rawBody = JSON.stringify(sampleEvent);
    const { signature } = await signWebhook({
      secret: SECRET,
      rawBody,
      timestamp: 1717000000,
    });
    await expect(
      verifyWebhook({
        secret: SECRET,
        rawBody: rawBody + " ", // single trailing space tampering
        signatureHeader: signature,
        now: 1717000010,
      }),
    ).rejects.toMatchObject({
      detail: { code: "signature_mismatch" },
    });
  });

  it("returns null payload on non-JSON body but verifies signature", async () => {
    const rawBody = "this-is-not-json";
    const { signature } = await signWebhook({
      secret: SECRET,
      rawBody,
      timestamp: 1717000000,
    });
    const r = await verifyWebhook({
      secret: SECRET,
      rawBody,
      signatureHeader: signature,
      now: 1717000010,
    });
    expect(r.payload).toBeNull();
  });
});

describe("verifyAndParseWebhook", () => {
  it("parses through Zod schema on success", async () => {
    const rawBody = JSON.stringify(sampleEvent);
    const { signature } = await signWebhook({
      secret: SECRET,
      rawBody,
      timestamp: 1717000000,
    });
    const r = await verifyAndParseWebhook(
      {
        secret: SECRET,
        rawBody,
        signatureHeader: signature,
        now: 1717000010,
      },
      WebhookEvent,
    );
    expect(r.event.type).toBe("order_update");
    expect(r.event.data.id).toBe("ord_abc");
  });
});
