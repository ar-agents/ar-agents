import { describe, expect, it } from "vitest";
import {
  RateLimitTimeoutError,
  TokenBucketRateLimiter,
} from "../src/rate-limiter";

function makeClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("TokenBucketRateLimiter", () => {
  it("acquires tokens immediately when bucket is full", async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 5, refillPerSecond: 1 });
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
    expect(limiter.getStats().tokens).toBeLessThan(0.5);
  });

  it("tryAcquire returns true while tokens available, false when empty", async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 2, refillPerSecond: 0.1 });
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it("refills over time", async () => {
    const clock = makeClock();
    const limiter = new TokenBucketRateLimiter({
      capacity: 10,
      refillPerSecond: 5,
      now: clock.now,
    });
    // Drain
    for (let i = 0; i < 10; i++) limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);
    // Advance 1s — 5 tokens refilled
    clock.advance(1000);
    expect(limiter.getStats().tokens).toBeGreaterThanOrEqual(5);
  });

  it("learnFromHeaders tightens bucket when MP says we have less remaining", async () => {
    // Inject a frozen clock: without it, getStats() refills a fraction of a
    // token from the real wall-clock elapsed between learnFromHeaders and the
    // read, making `toBe(3)` flaky in CI (e.g. 3.025). A frozen clock = 0
    // elapsed = no accrual = exactly 3.
    const clock = makeClock();
    const limiter = new TokenBucketRateLimiter({
      capacity: 50,
      refillPerSecond: 25,
      now: clock.now,
    });
    // Bucket starts at capacity (50)
    limiter.learnFromHeaders({ remaining: 3, resetSeconds: 60 });
    expect(limiter.getStats().tokens).toBe(3);
  });

  it("learnFromHeaders doesn't increase tokens when MP says more (we trust the lower)", async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 50, refillPerSecond: 25 });
    // Drain
    for (let i = 0; i < 50; i++) limiter.tryAcquire();
    expect(limiter.getStats().tokens).toBeLessThan(0.5);
    limiter.learnFromHeaders({ remaining: 100, resetSeconds: 60 });
    // Should still be ~0 because MP saying "100" doesn't override our local count
    expect(limiter.getStats().tokens).toBeLessThan(1);
  });

  it("rejects with RateLimitTimeoutError when wait exceeds budget", async () => {
    const limiter = new TokenBucketRateLimiter({
      capacity: 1,
      refillPerSecond: 0.001, // 1 token per 1000s
      acquireTimeoutMs: 10, // 10ms budget
    });
    await limiter.acquire(); // drain the 1 token
    await expect(limiter.acquire()).rejects.toBeInstanceOf(RateLimitTimeoutError);
  });
});
