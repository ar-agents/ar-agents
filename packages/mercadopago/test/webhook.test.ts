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

describe("verifyWebhookSignature (async, Web Crypto)", () => {
  const secret = "shhh-this-is-the-secret";
  const dataId = "preapproval-id-xyz";
  const requestId = "request-id-abc";
  // ts must be recent — verifier rejects stale timestamps as replay attempts
  const freshTs = () => String(Math.floor(Date.now() / 1000));

  function sign(ts: string): string {
    return createHmac("sha256", secret)
      .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
      .digest("hex");
  }

  it("returns true for a valid fresh signature", async () => {
    const ts = freshTs();
    const v1 = sign(ts);
    await expect(
      verifyWebhookSignature({
        requestId,
        dataId,
        signatureHeader: `ts=${ts},v1=${v1}`,
        secret,
      }),
    ).resolves.toBe(true);
  });

  it("returns false for a tampered signature", async () => {
    const ts = freshTs();
    const original = sign(ts);
    // Flip last hex char to a guaranteed-different one so the test is
    // deterministic regardless of what the original last char is.
    const last = original.slice(-1);
    const flipped = last === "0" ? "f" : "0";
    const v1 = original.slice(0, -1) + flipped;
    await expect(
      verifyWebhookSignature({
        requestId,
        dataId,
        signatureHeader: `ts=${ts},v1=${v1}`,
        secret,
      }),
    ).resolves.toBe(false);
  });

  it("returns false when signatureHeader missing", async () => {
    await expect(
      verifyWebhookSignature({
        requestId,
        dataId,
        signatureHeader: null,
        secret,
      }),
    ).resolves.toBe(false);
  });

  it("returns false when requestId missing", async () => {
    const ts = freshTs();
    await expect(
      verifyWebhookSignature({
        requestId: null,
        dataId,
        signatureHeader: `ts=${ts},v1=${sign(ts)}`,
        secret,
      }),
    ).resolves.toBe(false);
  });

  it("returns false when secret is wrong", async () => {
    const ts = freshTs();
    const v1 = sign(ts);
    await expect(
      verifyWebhookSignature({
        requestId,
        dataId,
        signatureHeader: `ts=${ts},v1=${v1}`,
        secret: "different-secret",
      }),
    ).resolves.toBe(false);
  });

  it("rejects stale timestamps as replay attempts (default 5min)", async () => {
    const staleTs = String(Math.floor(Date.now() / 1000) - 600); // 10 min ago
    const v1 = sign(staleTs);
    await expect(
      verifyWebhookSignature({
        requestId,
        dataId,
        signatureHeader: `ts=${staleTs},v1=${v1}`,
        secret,
      }),
    ).resolves.toBe(false);
  });

  it("respects custom replay tolerance", async () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600); // 1h ago
    const v1 = sign(oldTs);
    // With 2h tolerance the 1h-old signature is accepted
    await expect(
      verifyWebhookSignature({
        requestId,
        dataId,
        signatureHeader: `ts=${oldTs},v1=${v1}`,
        secret,
        replayToleranceSeconds: 7200,
      }),
    ).resolves.toBe(true);
  });

  it("rejects malformed timestamp", async () => {
    await expect(
      verifyWebhookSignature({
        requestId,
        dataId,
        signatureHeader: `ts=NOTANUMBER,v1=00`,
        secret,
      }),
    ).resolves.toBe(false);
  });
});
