// Per-seller token-bucket rate limiter.
//
// MELI documents 1500 req/min/seller (≈25 req/s). We default to 24/s with
// a burst of 60 to leave headroom for retries + concurrent requests.
// Each acquire() returns a promise that resolves when a token is available.
//
// In-memory only. Cross-process deployments should swap with a Redis-
// backed token bucket (the interface is intentionally tiny so a Redis
// adapter is ~30 LOC).

export interface RateLimiter {
  /**
   * Acquire 1 token. Resolves when granted (immediately if burst capacity
   * is available, otherwise after a delay).
   *
   * @param scope Independently-throttled bucket key (typically `seller:${id}`).
   */
  acquire(scope: string): Promise<void>;
}

export interface TokenBucketOptions {
  /** Tokens per second refill. Default 24 (≈1440 req/min). */
  refillPerSecond?: number;
  /** Max burst (bucket capacity). Default 60. */
  burst?: number;
  /** Override "now" for tests. Returns ms. */
  now?: () => number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class TokenBucketRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly refillPerSecond: number;
  private readonly burst: number;
  private readonly now: () => number;

  constructor(options: TokenBucketOptions = {}) {
    this.refillPerSecond = options.refillPerSecond ?? 24;
    this.burst = options.burst ?? 60;
    this.now = options.now ?? (() => Date.now());
  }

  async acquire(scope: string): Promise<void> {
    while (true) {
      const ms = this.now();
      const bucket = this.refill(scope, ms);
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return;
      }
      const deficitTokens = 1 - bucket.tokens;
      const waitMs = Math.ceil((deficitTokens / this.refillPerSecond) * 1000);
      await sleep(waitMs);
    }
  }

  /** Inspect tokens (for tests/diagnostics). */
  inspect(scope: string): { tokens: number } {
    const bucket = this.refill(scope, this.now());
    return { tokens: bucket.tokens };
  }

  private refill(scope: string, ms: number): Bucket {
    let bucket = this.buckets.get(scope);
    if (!bucket) {
      bucket = { tokens: this.burst, lastRefillMs: ms };
      this.buckets.set(scope, bucket);
      return bucket;
    }
    const elapsedSeconds = (ms - bucket.lastRefillMs) / 1000;
    bucket.tokens = Math.min(
      this.burst,
      bucket.tokens + elapsedSeconds * this.refillPerSecond,
    );
    bucket.lastRefillMs = ms;
    return bucket;
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** No-op limiter for tests / when you want to bypass throttling entirely. */
export class NoopRateLimiter implements RateLimiter {
  async acquire(): Promise<void> {}
}
