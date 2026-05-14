import { describe, it, expect } from "vitest";
import { TokenBucketRateLimiter } from "../src";

describe("TokenBucketRateLimiter", () => {
  it("burst allows immediate acquires up to capacity", async () => {
    const rl = new TokenBucketRateLimiter({ refillPerSecond: 1, burst: 5 });
    for (let i = 0; i < 5; i++) await rl.acquire("seller:1");
    expect(rl.inspect("seller:1").tokens).toBeLessThan(1);
  });

  it("isolates scopes (one tenant doesn't drain another)", async () => {
    const rl = new TokenBucketRateLimiter({ refillPerSecond: 1, burst: 3 });
    for (let i = 0; i < 3; i++) await rl.acquire("seller:1");
    expect(rl.inspect("seller:1").tokens).toBeLessThan(1);
    expect(rl.inspect("seller:2").tokens).toBeCloseTo(3, 0);
  });

  it("sweepIdleBuckets evicts buckets idle past the threshold", async () => {
    let now = 0;
    const rl = new TokenBucketRateLimiter({
      refillPerSecond: 1000,
      burst: 10,
      idleEvictMs: 100,
      now: () => now,
    });
    await rl.acquire("seller:1");
    await rl.acquire("seller:2");
    expect(rl.bucketCount()).toBe(2);

    // Advance time past the idle threshold + enough refill to top up.
    now = 10_000;
    const evicted = rl.sweepIdleBuckets();
    expect(evicted).toBe(2);
    expect(rl.bucketCount()).toBe(0);
  });

  it("auto-sweep fires every N acquires", async () => {
    let now = 0;
    const rl = new TokenBucketRateLimiter({
      refillPerSecond: 10_000,
      burst: 100,
      idleEvictMs: 50,
      now: () => now,
    });
    // Fill 300 unique scopes so we cross the SWEEP_EVERY_N_ACQUIRES (256) threshold.
    for (let i = 0; i < 300; i++) {
      await rl.acquire(`seller:${i}`);
      now += 1; // micro-advance so each bucket isn't fresh
    }
    // Advance well past idle threshold and trigger one more acquire.
    now += 10_000;
    await rl.acquire("seller:final");
    // After auto-sweep, only the freshly-touched bucket(s) remain.
    expect(rl.bucketCount()).toBeLessThan(300);
  });

  it("idleEvictMs=0 disables GC (back-compat)", async () => {
    let now = 0;
    const rl = new TokenBucketRateLimiter({
      refillPerSecond: 1,
      burst: 1,
      idleEvictMs: 0,
      now: () => now,
    });
    await rl.acquire("seller:1");
    now = 1_000_000;
    expect(rl.sweepIdleBuckets()).toBe(0);
    expect(rl.bucketCount()).toBe(1);
  });
});
