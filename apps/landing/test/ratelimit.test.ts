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

import { clientIp, kvRateLimit, rateLimit } from "../src/lib/ratelimit";

const reqWith = (headers: Record<string, string>) => new Request("https://x/", { headers });

describe("clientIp (spoof-resistant)", () => {
  it("prefers x-vercel-forwarded-for (platform-trusted, unspoofable)", () => {
    expect(
      clientIp(reqWith({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 1.2.3.4" })),
    ).toBe("1.2.3.4");
  });
  it("never returns the attacker-controlled leftmost x-forwarded-for hop", () => {
    // attacker prepends a fake hop; the real client is the rightmost (trusted proxy)
    expect(clientIp(reqWith({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(reqWith({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }))).not.toBe("6.6.6.6");
  });
  it("uses x-real-ip before the x-forwarded-for fallback", () => {
    expect(clientIp(reqWith({ "x-real-ip": "5.5.5.5", "x-forwarded-for": "6.6.6.6" }))).toBe("5.5.5.5");
  });
  it("returns 'unknown' with no proxy headers", () => {
    expect(clientIp(reqWith({}))).toBe("unknown");
  });
});

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

  it("fails OPEN on a KV error by default (availability over strictness)", async () => {
    incr.mockRejectedValueOnce(new Error("kv unreachable"));
    expect(await kvRateLimit("auto-incorporate", "1.2.3.4", 10, 3600)).toBe(true);
  });

  it("fails CLOSED on a KV error when failClosed is set (durable-write paths)", async () => {
    incr.mockRejectedValueOnce(new Error("kv unreachable"));
    expect(
      await kvRateLimit("incorporate-attested", "1.2.3.4", 5, 3600, { failClosed: true }),
    ).toBe(false);
  });

  it("failClosed does NOT change the happy path (still allows under the cap)", async () => {
    incr.mockResolvedValueOnce(1);
    expect(
      await kvRateLimit("incorporate-attested", "1.2.3.4", 5, 3600, { failClosed: true }),
    ).toBe(true);
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
