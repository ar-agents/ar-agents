import { describe, expect, it, vi } from "vitest";
import { InMemoryIdempotencyCache } from "../src/state";
import { WebhookDedup } from "../src/webhook-dedup";

describe("WebhookDedup", () => {
  it("first sight returns shouldProcess=true", async () => {
    const dedup = new WebhookDedup({ cache: new InMemoryIdempotencyCache() });
    const r = await dedup.check({
      topic: "payment",
      dataId: "12345",
      requestId: "req-1",
    });
    expect(r.shouldProcess).toBe(true);
    expect(r.deliveryKey).toContain("payment");
    expect(r.deliveryKey).toContain("12345");
    expect(r.deliveryKey).toContain("req-1");
  });

  it("second sight (same key) returns shouldProcess=false", async () => {
    const dedup = new WebhookDedup({ cache: new InMemoryIdempotencyCache() });
    await dedup.check({
      topic: "payment",
      dataId: "12345",
      requestId: "req-1",
    });
    const second = await dedup.check({
      topic: "payment",
      dataId: "12345",
      requestId: "req-1",
    });
    expect(second.shouldProcess).toBe(false);
  });

  it("different requestId is treated as a new delivery", async () => {
    const dedup = new WebhookDedup({ cache: new InMemoryIdempotencyCache() });
    await dedup.check({
      topic: "payment",
      dataId: "12345",
      requestId: "req-1",
    });
    const r = await dedup.check({
      topic: "payment",
      dataId: "12345",
      requestId: "req-2",
    });
    expect(r.shouldProcess).toBe(true);
  });

  it("calls onDuplicate hook on duplicate", async () => {
    const onDuplicate = vi.fn();
    const dedup = new WebhookDedup({
      cache: new InMemoryIdempotencyCache(),
      onDuplicate,
    });
    await dedup.check({ topic: "payment", dataId: "1", requestId: "r" });
    await dedup.check({ topic: "payment", dataId: "1", requestId: "r" });
    expect(onDuplicate).toHaveBeenCalledOnce();
  });

  it("peekIsDuplicate doesn't mark — at-least-once mode", async () => {
    const dedup = new WebhookDedup({ cache: new InMemoryIdempotencyCache() });
    const r1 = await dedup.peekIsDuplicate({
      topic: "payment",
      dataId: "1",
      requestId: "r",
    });
    expect(r1.shouldProcess).toBe(true);
    const r2 = await dedup.peekIsDuplicate({
      topic: "payment",
      dataId: "1",
      requestId: "r",
    });
    // Still shouldProcess=true because peek doesn't mark
    expect(r2.shouldProcess).toBe(true);

    // Now mark
    await dedup.markProcessed({ topic: "payment", dataId: "1", requestId: "r" });
    const r3 = await dedup.peekIsDuplicate({
      topic: "payment",
      dataId: "1",
      requestId: "r",
    });
    expect(r3.shouldProcess).toBe(false);
  });
});
