/**
 * Property-based tests with fast-check.
 *
 * Each `fc.assert` runs N random scenarios — verifies INVARIANTS instead of
 * single examples. Uses plain `fast-check` + `vitest` (not @fast-check/vitest)
 * to avoid version-coupling.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hmacSha256Hex, sha256Hex, timingSafeEqualHex } from "../src/crypto";
import { computeMarketplaceFee, explainPaymentStatus } from "../src/helpers";
import { verifyWebhookSignature } from "../src/webhook";

describe("HMAC + signature verification — invariants", () => {
  it("a fresh signature with the right secret is ALWAYS accepted", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 64 }),
        async (secret, dataId, requestId) => {
          const ts = String(Math.floor(Date.now() / 1000));
          const v1 = await hmacSha256Hex(
            secret,
            `id:${dataId};request-id:${requestId};ts:${ts};`,
          );
          const verified = await verifyWebhookSignature({
            requestId,
            dataId,
            signatureHeader: `ts=${ts},v1=${v1}`,
            secret,
          });
          return verified === true;
        },
      ),
      { numRuns: 50 },
    );
  });

  it("a signature signed with WRONG secret is ALWAYS rejected", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 64 }),
        fc.string({ minLength: 8, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 64 }),
        fc.string({ minLength: 1, maxLength: 64 }),
        async (secret, wrongSecret, dataId, requestId) => {
          if (secret === wrongSecret) return true;
          const ts = String(Math.floor(Date.now() / 1000));
          const v1 = await hmacSha256Hex(
            wrongSecret,
            `id:${dataId};request-id:${requestId};ts:${ts};`,
          );
          const verified = await verifyWebhookSignature({
            requestId,
            dataId,
            signatureHeader: `ts=${ts},v1=${v1}`,
            secret,
          });
          return verified === false;
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("timingSafeEqualHex — invariants", () => {
  it("always equal to itself", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9a-f]{4,64}$/), (s) => {
        return timingSafeEqualHex(s, s) === true;
      }),
      { numRuns: 100 },
    );
  });

  it("returns false for different-length inputs", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9a-f]{4,64}$/),
        fc.stringMatching(/^[0-9a-f]{4,64}$/),
        (a, b) => {
          if (a.length === b.length) return true;
          return timingSafeEqualHex(a, b) === false;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("sha256Hex — invariants", () => {
  it("deterministic: same input → same output", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (input) => {
        const a = await sha256Hex(input);
        const b = await sha256Hex(input);
        return a === b;
      }),
      { numRuns: 50 },
    );
  });

  it("output is always 64 hex chars (256-bit)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (input) => {
        const out = await sha256Hex(input);
        return /^[0-9a-f]{64}$/.test(out);
      }),
      { numRuns: 50 },
    );
  });

  it("different inputs produce different outputs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        async (a, b) => {
          if (a === b) return true;
          return (await sha256Hex(a)) !== (await sha256Hex(b));
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("computeMarketplaceFee — invariants", () => {
  it("fee is monotone in percent", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 50 }),
        (amount, percent) => {
          const lower = computeMarketplaceFee(amount, { percent });
          const higher = computeMarketplaceFee(amount, { percent: percent + 5 });
          return higher >= lower;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("fee never exceeds min/max bounds when both set", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (amount, minArs, range) => {
          const maxArs = minArs + range;
          const fee = computeMarketplaceFee(amount, {
            percent: 50,
            minArs,
            maxArs,
          });
          return fee >= Math.min(minArs, amount) && fee <= maxArs;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("fee never exceeds the transaction amount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (amount, percent, flatArs) => {
          const fee = computeMarketplaceFee(amount, { percent, flatArs });
          return fee <= amount;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("zero rule produces zero fee", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (amount) => {
        return computeMarketplaceFee(amount, {}) === 0;
      }),
      { numRuns: 50 },
    );
  });
});

describe("explainPaymentStatus — invariants", () => {
  it("never throws for any status / status_detail combination", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "approved",
          "authorized",
          "in_process",
          "in_mediation",
          "rejected",
          "cancelled",
          "refunded",
          "charged_back",
          "pending",
          "some_unknown_future_status",
        ),
        fc.option(
          fc.constantFrom(
            "accredited",
            "pending_contingency",
            "pending_review_manual",
            "pending_waiting_payment",
            "pending_challenge",
            "cc_rejected_bad_filled_card_number",
            "cc_rejected_bad_filled_security_code",
            "cc_rejected_call_for_authorize",
            "cc_rejected_blacklist",
            "by_collector",
            null,
          ),
        ),
        (status, statusDetail) => {
          const explanation = explainPaymentStatus({
            id: "1",
            status,
            status_detail: statusDetail,
            transaction_amount: 100,
            currency_id: "ARS",
          } as never);
          return (
            typeof explanation.summary === "string" &&
            explanation.summary.length > 0 &&
            typeof explanation.recommendedAction === "string" &&
            explanation.recommendedAction.length > 0 &&
            typeof explanation.final === "boolean" &&
            typeof explanation.paid === "boolean" &&
            typeof explanation.retryable === "boolean" &&
            (explanation.paid ? status === "approved" : true)
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Bridge: at least one expect() call so vitest doesn't flag empty file
describe("property tests sanity", () => {
  it("fast-check is loaded", () => {
    expect(typeof fc.assert).toBe("function");
  });
});
