import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWebhookEvent, verifyWebhookSignature } from "../src";

describe("parseWebhookEvent", () => {
  it("parses topic + id from query params", () => {
    const event = parseWebhookEvent(
      {},
      new URLSearchParams("topic=preapproval&id=abc123"),
    );
    expect(event).toEqual({
      topic: "preapproval",
      dataId: "abc123",
      action: null,
      raw: {},
    });
  });

  it("parses topic + id from body when query absent", () => {
    const event = parseWebhookEvent(
      {
        type: "preapproval",
        action: "updated",
        data: { id: "abc456" },
      },
      new URLSearchParams(),
    );
    expect(event).toEqual({
      topic: "preapproval",
      dataId: "abc456",
      action: "updated",
      raw: {
        type: "preapproval",
        action: "updated",
        data: { id: "abc456" },
      },
    });
  });

  it("query takes precedence over body when both present", () => {
    const event = parseWebhookEvent(
      { type: "fromBody", data: { id: "fromBody" } },
      new URLSearchParams("topic=fromQuery&id=fromQuery"),
    );
    expect(event?.topic).toBe("fromQuery");
    expect(event?.dataId).toBe("fromQuery");
  });

  it("returns null when topic is missing", () => {
    expect(
      parseWebhookEvent({}, new URLSearchParams("id=abc")),
    ).toBeNull();
  });

  it("returns null when id is missing", () => {
    expect(
      parseWebhookEvent({}, new URLSearchParams("topic=preapproval")),
    ).toBeNull();
  });

  it("coerces numeric data.id to string", () => {
    const event = parseWebhookEvent({ topic: "payment", data: { id: 12345 } });
    expect(event?.dataId).toBe("12345");
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "shhh-this-is-the-secret";
  const dataId = "preapproval-id-xyz";
  const requestId = "request-id-abc";
  const ts = "1234567890";

  function sign(): string {
    return createHmac("sha256", secret)
      .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
      .digest("hex");
  }

  it("returns true for a valid signature", () => {
    const v1 = sign();
    expect(
      verifyWebhookSignature({
        requestId,
        dataId,
        signatureHeader: `ts=${ts},v1=${v1}`,
        secret,
      }),
    ).toBe(true);
  });

  it("returns false for a tampered signature", () => {
    const v1 = sign().replace(/.$/, "0"); // flip last char
    expect(
      verifyWebhookSignature({
        requestId,
        dataId,
        signatureHeader: `ts=${ts},v1=${v1}`,
        secret,
      }),
    ).toBe(false);
  });

  it("returns false when signatureHeader missing", () => {
    expect(
      verifyWebhookSignature({
        requestId,
        dataId,
        signatureHeader: null,
        secret,
      }),
    ).toBe(false);
  });

  it("returns false when requestId missing", () => {
    expect(
      verifyWebhookSignature({
        requestId: null,
        dataId,
        signatureHeader: `ts=${ts},v1=${sign()}`,
        secret,
      }),
    ).toBe(false);
  });

  it("returns false when secret is wrong", () => {
    const v1 = sign();
    expect(
      verifyWebhookSignature({
        requestId,
        dataId,
        signatureHeader: `ts=${ts},v1=${v1}`,
        secret: "different-secret",
      }),
    ).toBe(false);
  });
});
