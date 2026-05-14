# Recipe 09 — Distributed rate limiter (multi-region) with Upstash Redis

The bundled `TokenBucketRateLimiter` is **in-process**: each Vercel Edge isolate / Lambda container has its own bucket. For a single-region app with a few thousand requests per minute, that's fine — your isolates rarely all hit MELI in the same 100ms window.

For **multi-region production** (Vercel Functions deployed to all regions, Cloudflare Workers, Lambda@Edge) you need a distributed bucket so the global throughput stays within MELI's per-seller ceiling regardless of which region accepts the request.

## The pattern

Implement the `RateLimiter` interface against [`@upstash/ratelimit`](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview), which uses a Lua script to do atomic GCRA token-bucket arithmetic in Redis.

```bash
pnpm add @upstash/ratelimit @upstash/redis @ar-agents/mercadolibre
```

```ts
// lib/meli-rate-limiter.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { RateLimiter } from "@ar-agents/mercadolibre";

const redis = Redis.fromEnv(); // reads UPSTASH_REDIS_REST_URL + _TOKEN

export class UpstashMeliRateLimiter implements RateLimiter {
  // One Ratelimit instance per scope. Cached so we don't allocate on every
  // call; map size is bounded by distinct sellers seen in this isolate.
  private readonly limiters = new Map<string, Ratelimit>();

  private getLimiter(scope: string): Ratelimit {
    let limiter = this.limiters.get(scope);
    if (!limiter) {
      limiter = new Ratelimit({
        redis,
        // MELI documents 1500 req/min/seller (~25 r/s). 24 r/s burst 60
        // mirrors the in-process default. The token bucket smooths spikes.
        limiter: Ratelimit.tokenBucket(24, "1 s", 60),
        prefix: `meli:rl:${scope}`,
        analytics: true,
      });
      this.limiters.set(scope, limiter);
    }
    return limiter;
  }

  async acquire(scope: string): Promise<void> {
    while (true) {
      const { success, reset } = await this.getLimiter(scope).limit(scope);
      if (success) return;
      // Sleep until the bucket refills (or 1s, whichever is shorter).
      const waitMs = Math.min(1000, Math.max(0, reset - Date.now()));
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}
```

## Wire it into MeliClient

```ts
import { MeliClient } from "@ar-agents/mercadolibre";
import { UpstashMeliRateLimiter } from "./lib/meli-rate-limiter";

const sharedLimiter = new UpstashMeliRateLimiter();

export const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
  rateLimiter: sharedLimiter,
  telemetry: {
    onRateLimitWait: ({ scope, waitMs }) => {
      // Most observability platforms accept this shape directly.
      console.log("meli.rl.wait", { scope, waitMs });
    },
  },
});
```

The `onRateLimitWait` hook fires whenever the bucket gates a request. Wire it to OpenTelemetry/Datadog/Sentry to track when you're hitting the ceiling — and on which sellers.

## Why GCRA, not classic token bucket

Upstash's `tokenBucket` is implemented as **GCRA (Generic Cell Rate Algorithm)** — same primitive Cloudflare uses for their own rate limiter. It avoids the "thundering herd" problem of classic token-bucket implementations where N pods all see "0 tokens" and all sleep until the next refill, then all wake up simultaneously and stampede the rate limit again.

GCRA gives each waiter a different `reset` time based on its position in the queue, so they unblock in sequence. For multi-region MELI clients this is the right algorithm.

## Cost

Each `acquire()` is one Lua script execution = one Redis round-trip. At 1500 r/min/seller (MELI's ceiling), that's at most 90k Redis ops/hour per seller. Upstash free tier covers ~10k/day — fine for a single-seller test deployment. Pay-per-request kicks in around $0.20/100k ops, so the math even at scale is trivial.

## Testing locally

For dev/staging, swap to the in-process limiter — Redis is overkill when there's only one isolate:

```ts
import { TokenBucketRateLimiter } from "@ar-agents/mercadolibre";

const limiter =
  process.env.NODE_ENV === "production"
    ? new UpstashMeliRateLimiter()
    : new TokenBucketRateLimiter();
```

The interface is the same. The MELI client doesn't care.
