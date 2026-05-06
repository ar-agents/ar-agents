/**
 * Token bucket rate limiter — proactive client-side rate limiting.
 *
 * # Why proactive
 *
 * The current client honors `Retry-After` after a 429 (reactive). That's
 * good but suboptimal: every 429 still costs you a network round-trip, an
 * error log, and adds latency to the retry. Proactive rate limiting reads
 * MP's `x-rate-limit-remaining` header and slows down BEFORE the next 429.
 *
 * # The token bucket model
 *
 * - The bucket holds N tokens (the burst capacity).
 * - Tokens refill at R tokens/second (the steady-state rate).
 * - Each request consumes 1 token.
 * - When the bucket is empty, requests wait until a token is available.
 *
 * Example: capacity=20, refill=10/s means "burst 20 requests, then 10/s
 * sustained". Matches MP's typical limits (precise numbers vary by endpoint
 * and aren't publicly documented).
 *
 * # Per-host vs global
 *
 * Default: one bucket per `MercadoPagoClient`. Pass a SHARED bucket to
 * multiple clients in marketplace setups so they share the rate limit
 * (otherwise each per-seller client would think it has its own quota).
 *
 * # Adaptive learning
 *
 * The bucket auto-tunes from response headers: if MP says
 * `x-rate-limit-remaining: 5` and the bucket has 50 tokens, the bucket
 * is over-spending. The `learnFromHeaders` method updates the available
 * count to the lower of (current, MP's stated remaining).
 */

export interface RateLimiterOptions {
  /** Bucket capacity (max burst). Default 50. */
  capacity?: number;
  /** Refill rate in tokens per second. Default 25. */
  refillPerSecond?: number;
  /**
   * If true, the limiter calls `learnFromHeaders` after every successful
   * request to keep its bucket in sync with MP's actual quota. Default true.
   */
  adaptive?: boolean;
  /**
   * Hard cap on how long `acquire()` will wait. If the bucket can't refill
   * in this time, `acquire()` rejects with `RateLimitTimeoutError`.
   * Default 30s — anything longer is probably better handled as an error.
   */
  acquireTimeoutMs?: number;
  /** Time provider (testing). Defaults to Date.now. */
  now?: () => number;
}

export class RateLimitTimeoutError extends Error {
  constructor(public readonly waitedMs: number) {
    super(`Rate limit acquire timed out after ${waitedMs}ms.`);
    this.name = "RateLimitTimeoutError";
  }
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly adaptive: boolean;
  private readonly acquireTimeoutMs: number;
  private readonly now: () => number;

  constructor(opts: RateLimiterOptions = {}) {
    this.capacity = opts.capacity ?? 50;
    this.refillPerSecond = opts.refillPerSecond ?? 25;
    this.adaptive = opts.adaptive ?? true;
    this.acquireTimeoutMs = opts.acquireTimeoutMs ?? 30_000;
    this.now = opts.now ?? Date.now;
    this.tokens = this.capacity;
    this.lastRefill = this.now();
  }

  /**
   * Acquire a token. Resolves immediately if tokens are available;
   * otherwise waits until one is. Rejects with `RateLimitTimeoutError`
   * if the wait exceeds `acquireTimeoutMs`.
   */
  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Compute how long until we have a token
    const tokensNeeded = 1 - this.tokens; // fractional
    const waitMs = Math.ceil((tokensNeeded / this.refillPerSecond) * 1000);

    if (waitMs > this.acquireTimeoutMs) {
      throw new RateLimitTimeoutError(waitMs);
    }

    await sleep(waitMs);
    this.refill();
    this.tokens -= 1;
  }

  /**
   * Best-effort acquire: returns true if a token was available, false
   * otherwise. Doesn't wait. Useful for "non-blocking" code paths that
   * want to fall back to a cached response or queue the request elsewhere.
   */
  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Adaptive learning hook — call after every API response with MP's
   * rate-limit headers to keep the bucket in sync with reality.
   */
  learnFromHeaders(headers: {
    remaining: number | null;
    resetSeconds: number | null;
  }): void {
    if (!this.adaptive) return;
    if (headers.remaining === null) return;
    // If MP says we have less than our local count, trust MP.
    this.refill();
    if (headers.remaining < this.tokens) {
      this.tokens = Math.max(0, headers.remaining);
    }
  }

  /** Inspect the current bucket state. */
  getStats(): { tokens: number; capacity: number; refillPerSecond: number } {
    this.refill();
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      refillPerSecond: this.refillPerSecond,
    };
  }

  private refill(): void {
    const now = this.now();
    const elapsedMs = now - this.lastRefill;
    if (elapsedMs <= 0) return;
    const refilled = (elapsedMs / 1000) * this.refillPerSecond;
    this.tokens = Math.min(this.capacity, this.tokens + refilled);
    this.lastRefill = now;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
