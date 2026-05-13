// Property-based tests via fast-check.
//
// These don't replace the example-based tests — they exercise broad input
// spaces (random strings, prices, integer combos, attribute orderings) to
// catch edge cases the seed-style tests can't. Each property runs the
// fast-check default of 100 random samples.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  classifySpam,
  scoreSpam,
  extractSpamFeatures,
  partitionByPack,
  parseWebhook,
  extractResourceId,
  type Order,
} from "../src";
import { MeliWebhookError } from "../src/errors";

// ---------------------------------------------------------------------------
// Spam classifier
// ---------------------------------------------------------------------------

describe("property: spam classifier", () => {
  const questionFixture = (text: string) => ({
    id: 1,
    seller_id: 1,
    item_id: "MLA1",
    text,
    status: "UNANSWERED" as const,
    date_created: "2026-05-09T00:00:00.000Z",
    from: { id: 88 },
  });

  it("score is always within [0, 1]", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 5000 }), (text) => {
        const features = extractSpamFeatures({ question: questionFixture(text) });
        const score = scoreSpam(features);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("label is consistent with score thresholds", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 1000 }), (text) => {
        const r = classifySpam({ question: questionFixture(text) });
        if (r.score >= 0.7) expect(r.label).toBe("spam");
        else if (r.score <= 0.3) expect(r.label).toBe("ham");
        else expect(r.label).toBe("borderline");
      }),
    );
  });

  it("any text containing http://… or https://… flags external contact", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.string({ minLength: 0, maxLength: 50 }),
        (before, after) => {
          const text = `${before} https://malicious.example/path ${after}`;
          const features = extractSpamFeatures({ question: questionFixture(text) });
          expect(features.contains_external_contact).toBe(true);
        },
      ),
    );
  });

  it("bare digit-runs (order ids, tracking codes) are NOT flagged as phones", () => {
    const orderIds = [
      "2000003508510037", // typical MELI order id
      "1234567890",
      "AND1234567890123",
      "MLA1402155766",
    ];
    for (const text of orderIds) {
      const features = extractSpamFeatures({
        question: { ...questionFixture(text), text: `¿Pedido ${text}?` },
      });
      expect(features.contains_external_contact).toBe(false);
    }
  });

  it("real phone formats ARE flagged", () => {
    const phones = [
      "+54 11 1234-5678",
      "+34 695 632 237",
      "(011) 1234 5678",
      "11 1234.5678",
      "+5491145678901",
    ];
    for (const text of phones) {
      const features = extractSpamFeatures({
        question: { ...questionFixture(text), text: `Llamame al ${text}` },
      });
      expect(features.contains_external_contact).toBe(true);
    }
  });

  it("repetition >= 2 always sets cross_listing_repetition", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.integer({ min: 2, max: 10 }),
        (text, repeats) => {
          const recent = Array.from({ length: repeats }, () => text);
          const features = extractSpamFeatures({
            question: questionFixture(text),
            recentQuestionsByThisAsker: recent,
          });
          expect(features.cross_listing_repetition).toBe(true);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// partitionByPack
// ---------------------------------------------------------------------------

describe("property: partitionByPack", () => {
  function makeOrder(id: number, packId: number | null): Order {
    return {
      id,
      date_created: "2026-05-09T00:00:00.000Z",
      status: "paid",
      total_amount: 100,
      currency_id: "ARS",
      pack_id: packId,
      order_items: [
        {
          item: { id: "MLA1", title: "x" },
          quantity: 1,
          unit_price: 100,
          currency_id: "ARS",
        },
      ],
      buyer: { id: 1, nickname: "n" },
    } as Order;
  }

  it("input length = singles + sum of pack sizes", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.integer({ min: 1, max: 100_000 }), fc.option(fc.integer({ min: 1, max: 100 }), { nil: null })),
          { maxLength: 50 },
        ),
        (raw) => {
          // Dedupe order ids so we don't construct two with same id.
          const seen = new Set<number>();
          const orders: Order[] = [];
          for (const [id, packId] of raw) {
            if (seen.has(id)) continue;
            seen.add(id);
            orders.push(makeOrder(id, packId));
          }
          const r = partitionByPack(orders);
          const packTotal = Array.from(r.packs.values()).reduce(
            (acc, list) => acc + list.length,
            0,
          );
          expect(r.singleOrders.length + packTotal).toBe(orders.length);
        },
      ),
    );
  });

  it("every order in a pack bucket shares that pack_id", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 1, maxLength: 30 }),
        (packIds) => {
          const orders = packIds.map((pid, i) => makeOrder(i + 1, pid));
          const r = partitionByPack(orders);
          for (const [packId, list] of r.packs) {
            for (const o of list) {
              expect(o.pack_id).toBe(packId);
            }
          }
        },
      ),
    );
  });

  it("single-orders bucket contains only orders with pack_id == null", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.option(fc.integer({ min: 1, max: 50 }), { nil: null }),
          { maxLength: 30 },
        ),
        (raw) => {
          const orders = raw.map((pid, i) => makeOrder(i + 1, pid));
          const r = partitionByPack(orders);
          for (const o of r.singleOrders) {
            expect(o.pack_id).toBeNull();
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Webhook parser
// ---------------------------------------------------------------------------

describe("property: webhook parser", () => {
  it("rejects any non-object payload", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.array(fc.anything()),
        ),
        (bad) => {
          expect(() => parseWebhook(bad)).toThrow(MeliWebhookError);
        },
      ),
    );
  });

  it("extractResourceId returns the trailing path segment", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("/")), { minLength: 1, maxLength: 6 }),
        (segments) => {
          const resource = "/" + segments.join("/");
          const evt = parseWebhook({
            _id: "x",
            resource,
            user_id: 1,
            topic: "orders_v2",
            application_id: 1,
            attempts: 1,
            sent: "2026-05-09T00:00:00.000Z",
          });
          expect(extractResourceId(evt)).toBe(segments[segments.length - 1]);
        },
      ),
    );
  });

  it("respects expectedTopics filter", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("orders_v2", "claims", "questions", "messages"),
        fc.constantFrom("orders_v2", "claims", "questions", "messages"),
        (actual, expected) => {
          const body = {
            _id: "x",
            resource: "/orders/1",
            user_id: 1,
            topic: actual,
            application_id: 1,
            attempts: 1,
            sent: "2026-05-09T00:00:00.000Z",
          };
          if (actual === expected) {
            expect(() => parseWebhook(body, { expectedTopics: [expected] })).not.toThrow();
          } else {
            expect(() => parseWebhook(body, { expectedTopics: [expected] })).toThrow(MeliWebhookError);
          }
        },
      ),
    );
  });
});
