import { describe, it, expect } from "vitest";
import {
  validateIdempotencyKey,
  hashBody,
  canonicalize,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} from "../src/idempotency";

describe("canonicalize", () => {
  it("sorts object keys for stable hashing", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("recurses into nested objects", () => {
    expect(canonicalize({ outer: { z: 1, a: 2 } })).toBe(
      '{"outer":{"a":2,"z":1}}',
    );
  });

  it("handles arrays without sorting (order is meaningful)", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("drops undefined values like JSON.stringify", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("serializes primitives", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize("hi")).toBe('"hi"');
  });
});

describe("hashBody", () => {
  it("produces 64-char hex (SHA-256)", async () => {
    const h = await hashBody({ a: 1 });
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns the same hash regardless of object key order", async () => {
    const h1 = await hashBody({ a: 1, b: 2 });
    const h2 = await hashBody({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it("returns different hashes for different bodies", async () => {
    const h1 = await hashBody({ a: 1 });
    const h2 = await hashBody({ a: 2 });
    expect(h1).not.toBe(h2);
  });
});

describe("validateIdempotencyKey", () => {
  it("returns AcpError when header is missing", async () => {
    const r = await validateIdempotencyKey(undefined, "{}");
    expect("code" in r && r.code).toBe("idempotency_key_required");
  });

  it("returns AcpError when header is empty string", async () => {
    const r = await validateIdempotencyKey("", "{}");
    expect("code" in r && r.code).toBe("idempotency_key_required");
  });

  it(`returns AcpError when header exceeds ${MAX_IDEMPOTENCY_KEY_LENGTH} chars`, async () => {
    const r = await validateIdempotencyKey(
      "x".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1),
      "{}",
    );
    expect("code" in r && r.code).toBe("idempotency_key_required");
  });

  it("returns key + bodyHash on success", async () => {
    const r = await validateIdempotencyKey("550e8400-e29b-41d4-a716-446655440000", "{}");
    expect("key" in r && r.key).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect("bodyHash" in r && r.bodyHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
