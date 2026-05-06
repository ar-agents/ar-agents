/**
 * Benchmarks for the crypto primitives. Run with `pnpm bench`.
 *
 * # Why benchmarks for crypto
 *
 * Webhook handlers are hot path: 1 HMAC verify per request, scales linearly
 * with traffic. Idempotency key derivation is also called per-tool-call.
 * If either is slow, agent latency suffers. We track p50 + ops/sec to
 * catch regressions.
 *
 * # Targets (Web Crypto on Node 20+)
 *
 * - hmacSha256Hex: > 50,000 ops/sec
 * - sha256Hex (40-byte input): > 100,000 ops/sec
 * - timingSafeEqualHex (64-char): > 5,000,000 ops/sec
 */

import { bench, describe } from "vitest";
import {
  hmacSha256Hex,
  sha256Hex,
  timingSafeEqualHex,
} from "../../src/crypto";

describe("crypto.hmacSha256Hex", () => {
  const secret = "shhh-this-is-the-webhook-secret";
  const manifest = "id:1234567890;request-id:request-id-abc;ts:1700000000;";

  bench("hmacSha256Hex (typical webhook manifest)", async () => {
    await hmacSha256Hex(secret, manifest);
  });
});

describe("crypto.sha256Hex", () => {
  const small = "create_payment|order-123|100|visa|tok_abc";
  const large = "x".repeat(1024);

  bench("sha256Hex (40-byte input — typical idempotency key derivation)", async () => {
    await sha256Hex(small);
  });

  bench("sha256Hex (1KB input)", async () => {
    await sha256Hex(large);
  });
});

describe("crypto.timingSafeEqualHex", () => {
  const a = "a".repeat(64);
  const b = "a".repeat(64);
  const c = "b".repeat(64);

  bench("timingSafeEqualHex (64 chars, equal)", () => {
    timingSafeEqualHex(a, b);
  });

  bench("timingSafeEqualHex (64 chars, different)", () => {
    timingSafeEqualHex(a, c);
  });
});
