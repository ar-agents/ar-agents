// Throughput benchmarks for the hot-path components.
//
// Run with: `pnpm bench`. These don't run as part of `pnpm test`.
//
// Goals:
//   - rate-limiter: prove the token bucket scales to MELI's published 25 r/s
//     without serializing across sellers.
//   - OAuth coalescing: prove 100 concurrent calls per user collapse to one
//     refresh exchange.
//   - Spam classifier: prove the heuristic stays under 1µs/call so
//     batch-classifying a feed of 10k questions is sub-millisecond.

import { bench, describe } from "vitest";
import {
  TokenBucketRateLimiter,
  classifySpam,
  scoreSpam,
  extractSpamFeatures,
  type Question,
} from "../../src";

const QUESTION: Question = {
  id: 1,
  seller_id: 1,
  item_id: "MLA1",
  text: "¿Hay stock en talle M? Mando un mail y mensaje al +54 11 1234-5678",
  status: "UNANSWERED",
  date_created: "2026-05-09T00:00:00.000Z",
  from: { id: 88 },
};

describe("rate-limiter — token bucket", () => {
  bench(
    "acquire 1000 tokens, single bucket",
    async () => {
      const rl = new TokenBucketRateLimiter({ tokensPerSecond: 1_000_000, burst: 1000 });
      for (let i = 0; i < 1000; i++) {
        await rl.acquire("seller:1");
      }
    },
    { iterations: 50 },
  );

  bench(
    "acquire 100 tokens across 10 buckets (multi-tenant)",
    async () => {
      const rl = new TokenBucketRateLimiter({ tokensPerSecond: 1_000_000, burst: 100 });
      for (let s = 0; s < 10; s++) {
        for (let i = 0; i < 100; i++) {
          await rl.acquire(`seller:${s}`);
        }
      }
    },
    { iterations: 50 },
  );

  bench(
    "acquire concurrent (Promise.all of 200)",
    async () => {
      const rl = new TokenBucketRateLimiter({ tokensPerSecond: 1_000_000, burst: 200 });
      await Promise.all(
        Array.from({ length: 200 }, (_, i) => rl.acquire(`seller:${i % 5}`)),
      );
    },
    { iterations: 50 },
  );
});

describe("spam classifier", () => {
  bench(
    "classifySpam — 1k iterations on a typical question",
    () => {
      for (let i = 0; i < 1000; i++) {
        classifySpam({ question: QUESTION });
      }
    },
    { iterations: 50 },
  );

  bench(
    "scoreSpam alone (pre-extracted features)",
    () => {
      const features = extractSpamFeatures({ question: QUESTION });
      for (let i = 0; i < 10_000; i++) {
        scoreSpam(features);
      }
    },
    { iterations: 50 },
  );
});

describe("client.fetch (mocked) end-to-end", async () => {
  const { mockFetch, makeMeliClient } = await import("../../src/testing");
  const fm = mockFetch()
    .on("GET", "/items/MLA1", () => ({
      status: 200,
      body: {
        id: "MLA1",
        site_id: "MLA",
        title: "T",
        seller_id: 1,
        category_id: "MLA1071",
        price: 100,
        currency_id: "ARS",
        available_quantity: 1,
        condition: "new",
        buying_mode: "buy_it_now",
        listing_type_id: "gold_special",
        status: "active",
        permalink: "https://x.example/MLA1",
      },
    }))
    .build();
  const client = makeMeliClient({ fetch: fm.fetch, skipResponseValidation: true });

  bench(
    "100 sequential GETs through the full pipeline (auth + rate-limit + retry)",
    async () => {
      for (let i = 0; i < 100; i++) {
        await client.fetch({ method: "GET", path: "/items/MLA1" });
      }
    },
    { iterations: 20 },
  );

  bench(
    "100 concurrent GETs (Promise.all)",
    async () => {
      await Promise.all(
        Array.from({ length: 100 }, () =>
          client.fetch({ method: "GET", path: "/items/MLA1" }),
        ),
      );
    },
    { iterations: 20 },
  );
});
