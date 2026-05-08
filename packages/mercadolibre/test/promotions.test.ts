import { describe, it, expect } from "vitest";
import { mockFetch, makeMeliClient } from "../src/testing";
import {
  listPromotionCandidates,
  optInPromotion,
  autoOptInPromotions,
} from "../src";

const CANDIDATE = {
  promotion_id: "PROMO_2026_05",
  promotion_type: "DEAL" as const,
  start_date: "2026-05-10T00:00:00.000Z",
  finish_date: "2026-05-20T00:00:00.000Z",
  suggested_discount_percentage: 20,
  max_discount_percentage: 30,
  min_discount_percentage: 10,
  items: [
    {
      id: "MLA1",
      original_price: 1000,
      suggested_price: 800, // 20% off
      max_price: 900,
      min_price: 700,
      currency_id: "ARS" as const,
    },
    {
      id: "MLA2",
      original_price: 500,
      suggested_price: 400, // 20% off
      currency_id: "ARS" as const,
    },
  ],
};

describe("promotions API", () => {
  it("listPromotionCandidates hits /seller-promotions/users/{id}/candidates", async () => {
    const fm = mockFetch()
      .on("GET", "/seller-promotions/users/12345/candidates", () => ({
        status: 200,
        body: { results: [CANDIDATE] },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await listPromotionCandidates(client, 12345);
    expect(r.results).toHaveLength(1);
    expect(new URL(fm.requests[0]!.url).searchParams.get("app_version")).toBe("v2");
  });

  it("optInPromotion POSTs to /seller-promotions/items/{id}", async () => {
    const fm = mockFetch()
      .on("POST", "/seller-promotions/items/MLA1", (req) => ({
        status: 200,
        body: {
          id: "MLA1",
          status: "started",
          deal_price: (req.body as { deal_price: number }).deal_price,
        },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await optInPromotion(client, "MLA1", {
      promotion_id: "PROMO",
      promotion_type: "DEAL",
      deal_price: 800,
    });
    expect(r.status).toBe("started");
    expect(r.deal_price).toBe(800);
  });

  describe("autoOptInPromotions margin guard", () => {
    function makeFm(optInOk: (itemId: string) => boolean = () => true) {
      return mockFetch()
        .on("GET", "/seller-promotions/users/12345/candidates", () => ({
          status: 200,
          body: { results: [CANDIDATE] },
        }))
        .onRegex("POST", /\/seller-promotions\/items\/MLA\d+$/, (req) => {
          const url = new URL(req.url);
          const itemId = url.pathname.split("/").pop() ?? "";
          if (!optInOk(itemId)) {
            return { status: 400, body: { error: "promo_rejected" } };
          }
          return {
            status: 200,
            body: {
              id: itemId,
              status: "started",
              deal_price: (req.body as { deal_price: number }).deal_price,
            },
          };
        })
        .build();
    }

    it("opts in to candidates with sufficient margin", async () => {
      const fm = makeFm();
      const client = makeMeliClient({ fetch: fm.fetch });
      const r = await autoOptInPromotions(client, 12345, {
        cogsByItem: { MLA1: 600, MLA2: 300 }, // 25% margin at suggested
        defaultMinimumMargin: 0.2,
      });
      expect(r.optedIn).toHaveLength(2);
      expect(r.skipped).toHaveLength(0);
    });

    it("skips candidates below margin floor", async () => {
      const fm = makeFm();
      const client = makeMeliClient({ fetch: fm.fetch });
      const r = await autoOptInPromotions(client, 12345, {
        cogsByItem: { MLA1: 750, MLA2: 380 }, // <5% margin at suggested
        defaultMinimumMargin: 0.15,
      });
      expect(r.optedIn).toHaveLength(0);
      expect(r.skipped.every((s) => s.reason === "below_margin")).toBe(true);
    });

    it("skips candidates with no COGS configured", async () => {
      const fm = makeFm();
      const client = makeMeliClient({ fetch: fm.fetch });
      const r = await autoOptInPromotions(client, 12345, {
        cogsByItem: {}, // none
      });
      expect(r.optedIn).toHaveLength(0);
      expect(r.skipped.every((s) => s.reason === "no_cogs")).toBe(true);
    });
  });
});
