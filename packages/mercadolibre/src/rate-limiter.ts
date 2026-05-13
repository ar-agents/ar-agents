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
  /** Evict buckets idle for more than this many ms. Default 600_000 (10 min).
   *  Set to 0 to disable GC (useful in tests). */
  idleEvictMs?: number;
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
  private readonly idleEvictMs: number;
  /** Counter — every N acquires we sweep idle buckets. */
  private acquireSinceLastSweep = 0;
  private static readonly SWEEP_EVERY_N_ACQUIRES = 256;

  constructor(options: TokenBucketOptions = {}) {
    this.refillPerSecond = options.refillPerSecond ?? 24;
    this.burst = options.burst ?? 60;
    this.now = options.now ?? (() => Date.now());
    this.idleEvictMs = options.idleEvictMs ?? 600_000;
  }

  async acquire(scope: string): Promise<void> {
    this.maybeSweep();
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

  /** Number of currently-tracked buckets. Diagnostics only. */
  bucketCount(): number {
    return this.buckets.size;
  }

  /** Force-evict buckets that have been idle longer than `idleEvictMs`.
   *  We don't bother checking token count — recreating an idle bucket
   *  later is essentially free (one Map.set + one allocation), and any
   *  bucket that's been idle for >10 min has long since refilled to burst
   *  anyway. */
  sweepIdleBuckets(now = this.now()): number {
    if (this.idleEvictMs === 0) return 0;
    let evicted = 0;
    for (const [scope, bucket] of this.buckets) {
      if (now - bucket.lastRefillMs > this.idleEvictMs) {
        this.buckets.delete(scope);
        evicted++;
      }
    }
    return evicted;
  }

  private maybeSweep(): void {
    if (this.idleEvictMs === 0) return;
    this.acquireSinceLastSweep++;
    if (this.acquireSinceLastSweep < TokenBucketRateLimiter.SWEEP_EVERY_N_ACQUIRES) return;
    this.acquireSinceLastSweep = 0;
    this.sweepIdleBuckets();
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
