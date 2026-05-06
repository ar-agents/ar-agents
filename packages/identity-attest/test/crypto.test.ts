import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { hmacSha256Hex, randomUuid, timingSafeEqualHex } from "../src/crypto";

/**
 * Regression tests for the v0.3.0 Web Crypto migration.
 *
 * The old implementation used `node:crypto`. If the new Web Crypto path
 * produces different output for the same input, every previously-issued
 * attestation silently fails signature verification — a silent breakage
 * with no test signal would be catastrophic. These golden vectors lock
 * the migration in place.
 */

describe("hmacSha256Hex — golden vectors against node:crypto", () => {
  // Match the actual signAttestation payload format from client.ts:322:
  //   `${requestId}|${verifier}|${method}|${trustLevel}|${type}:${value}|${verifiedAt}|${expiresAt}`
  const cases = [
    {
      name: "typical attestation payload",
      secret: "test-secret-deadbeefdeadbeefdeadbeefdeadbeef",
      message:
        "req-001|whatsapp_otp_verifier|whatsapp_otp|0.3|phone:5491112345678|2026-05-06T12:00:00.000Z|2026-06-05T12:00:00.000Z",
    },
    { name: "empty message", secret: "k", message: "" },
    { name: "single-char message", secret: "k", message: "x" },
    {
      name: "long message",
      secret: "x".repeat(64),
      message: "a".repeat(1024),
    },
    {
      name: "unicode message",
      secret: "secret-ñ",
      message: "factura: ñoñería á é í ó ú ü ¿? ¡!",
    },
  ];

  for (const tc of cases) {
    it(`matches node:crypto output (${tc.name})`, async () => {
      const expected = createHmac("sha256", tc.secret).update(tc.message, "utf8").digest("hex");
      const actual = await hmacSha256Hex(tc.secret, tc.message);
      expect(actual).toBe(expected);
      expect(actual).toMatch(/^[0-9a-f]{64}$/);
    });
  }
});

describe("timingSafeEqualHex", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqualHex("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(timingSafeEqualHex("abc123", "abc124")).toBe(false);
  });

  it("returns false for different lengths (early exit)", () => {
    expect(timingSafeEqualHex("abc", "abcd")).toBe(false);
    expect(timingSafeEqualHex("abcd", "abc")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(timingSafeEqualHex("", "")).toBe(true);
  });

  it("does not short-circuit on first-byte mismatch (smoke check)", () => {
    // Both strings differ only in the LAST byte; if the function
    // short-circuited on first-mismatch this would still return false
    // but the behavior we're verifying is FALSE-correctness, not timing.
    expect(timingSafeEqualHex("aaa", "aab")).toBe(false);
  });
});

describe("randomUuid", () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it("returns a valid UUID v4", () => {
    expect(randomUuid()).toMatch(UUID_V4);
  });

  it("returns different UUIDs across calls", () => {
    const ids = new Set([
      randomUuid(),
      randomUuid(),
      randomUuid(),
      randomUuid(),
      randomUuid(),
    ]);
    expect(ids.size).toBe(5);
  });
});
