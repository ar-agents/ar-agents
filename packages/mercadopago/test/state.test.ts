import { describe, expect, it } from "vitest";
import { InMemoryStateAdapter } from "../src";

describe("InMemoryStateAdapter", () => {
  it("returns null for unknown ids", async () => {
    const adapter = new InMemoryStateAdapter();
    expect(await adapter.get("nope")).toBeNull();
  });

  it("merges partial updates instead of overwriting", async () => {
    const adapter = new InMemoryStateAdapter();
    await adapter.set("sub1", {
      status: "pending",
      payerEmail: "buyer@test.com",
      amount: 100,
    });
    await adapter.set("sub1", {
      lastWebhookStatus: "authorized",
      lastWebhookAt: "2026-05-05T13:00:00Z",
    });
    const stored = await adapter.get("sub1");
    expect(stored).toEqual({
      status: "pending",
      payerEmail: "buyer@test.com",
      amount: 100,
      lastWebhookStatus: "authorized",
      lastWebhookAt: "2026-05-05T13:00:00Z",
    });
  });

  it("list returns all stored ids", async () => {
    const adapter = new InMemoryStateAdapter();
    await adapter.set("a", { status: "pending" });
    await adapter.set("b", { status: "authorized" });
    const list = (await adapter.list?.()) ?? [];
    expect(list.sort()).toEqual(["a", "b"]);
  });

  it("reset() drops everything", async () => {
    const adapter = new InMemoryStateAdapter();
    await adapter.set("a", { status: "pending" });
    adapter.reset();
    expect(await adapter.get("a")).toBeNull();
  });
});
