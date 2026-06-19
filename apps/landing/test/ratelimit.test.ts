import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the KV client. kvRateLimit is the only thing here that touches it; the
// in-memory rateLimit is pure. We assert the counter logic and the fail-open.
const incr = vi.fn();
const expire = vi.fn();
vi.mock("@vercel/kv", () => ({
  kv: {
    incr: (k: string) => incr(k),
    expire: (k: string, s: number) => expire(k, s),
  },
}));

import { kvRateLimit, rateLimit } from "../src/lib/ratelimit";

afterEach(() => {
  incr.mockReset();
  expire.mockReset();
});

describe("kvRateLimit", () => {
  it("allows the first hit and sets the TTL exactly once", async () => {
    incr.mockResolvedValueOnce(1);
    expect(await kvRateLimit("auto-incorporate", "1.2.3.4", 10, 3600)).toBe(true);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith(expect.any(String), 3601); // windowSec + 1
  });

  it("does NOT re-set the TTL on subsequent hits of the same window", async () => {
    incr.mockResolvedValueOnce(5);
    expect(await kvRateLimit("auto-incorporate", "1.2.3.4", 10, 3600)).toBe(true);
    expect(expire).not.toHaveBeenCalled();
  });

  it("allows exactly at the max (inclusive)", async () => {
    incr.mockResolvedValueOnce(10);
    expect(await kvRateLimit("auto-incorporate", "1.2.3.4", 10, 3600)).toBe(true);
  });

  it("blocks once the count exceeds the max", async () => {
    incr.mockResolvedValueOnce(11);
    expect(await kvRateLimit("auto-incorporate", "1.2.3.4", 10, 3600)).toBe(false);
  });

  it("namespaces the key by scope + id + window bucket", async () => {
    incr.mockResolvedValueOnce(1);
    await kvRateLimit("scopeX", "ip9", 10, 60);
    const key = incr.mock.calls[0]![0];
    expect(key).toMatch(/^rl:scopeX:ip9:\d+$/);
  });

  it("fails OPEN on a KV error (availability over strictness)", async () => {
    incr.mockRejectedValueOnce(new Error("kv unreachable"));
    expect(await kvRateLimit("auto-incorporate", "1.2.3.4", 10, 3600)).toBe(true);
  });
});

describe("rateLimit (in-memory) still works alongside it", () => {
  it("allows up to max then blocks within the window", () => {
    const id = "ip-test-burst";
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("t", id, 3, 60_000)).toBe(true);
    }
    expect(rateLimit("t", id, 3, 60_000)).toBe(false);
  });
});
