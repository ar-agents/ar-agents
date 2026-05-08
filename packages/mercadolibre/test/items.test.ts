import { describe, it, expect } from "vitest";
import { mockFetch, makeMeliClient } from "../src/testing";
import {
  getItem,
  multigetItems,
  createItem,
  updateItem,
  pauseItem,
  closeItem,
  searchSellerItems,
  iterateSellerItems,
  relistItem,
} from "../src";

const ITEM_FIXTURE = {
  id: "MLA123456789",
  site_id: "MLA",
  title: "Yerba Amanda 1kg",
  seller_id: 12345,
  category_id: "MLA1055",
  price: 4500,
  currency_id: "ARS",
  available_quantity: 50,
  listing_type_id: "gold_special",
  status: "active",
};

describe("items API", () => {
  it("getItem fetches a single item by id", async () => {
    const fm = mockFetch()
      .on("GET", "/items/MLA123456789", () => ({ status: 200, body: ITEM_FIXTURE }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const item = await getItem(client, "MLA123456789");
    expect(item.id).toBe("MLA123456789");
    expect(item.title).toBe("Yerba Amanda 1kg");
  });

  it("multigetItems batches up to 20 ids and filters non-200 entries", async () => {
    const fm = mockFetch()
      .on("GET", "/items", () => ({
        status: 200,
        body: [
          { code: 200, body: ITEM_FIXTURE },
          { code: 404, body: { ...ITEM_FIXTURE, id: "MLA999" } },
        ],
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const items = await multigetItems(client, ["MLA123456789", "MLA999"]);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("MLA123456789");
  });

  it("multigetItems rejects requests > 20 ids", async () => {
    const fm = mockFetch().build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const ids = Array.from({ length: 21 }, (_, i) => `MLA${i}`);
    await expect(multigetItems(client, ids)).rejects.toThrow();
  });

  it("createItem POSTs the validated payload", async () => {
    const fm = mockFetch()
      .on("POST", "/items", (req) => ({
        status: 201,
        body: { ...ITEM_FIXTURE, ...(req.body as object) },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const created = await createItem(client, {
      title: "Bombilla Alpaca",
      category_id: "MLA1234",
      price: 8500,
      currency_id: "ARS",
      available_quantity: 40,
      buying_mode: "buy_it_now",
      listing_type_id: "gold_special",
      condition: "new",
      pictures: [{ source: "https://example.invalid/pic.jpg" }],
    });
    expect(created.id).toBe("MLA123456789");
    expect(fm.requests[0]?.method).toBe("POST");
    expect(fm.requests[0]?.url).toContain("/items");
  });

  it("updateItem PUTs partial fields", async () => {
    const fm = mockFetch()
      .onRegex("PUT", /\/items\/MLA\d+$/, () => ({
        status: 200,
        body: { ...ITEM_FIXTURE, price: 5000 },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const updated = await updateItem(client, "MLA123456789", { price: 5000 });
    expect(updated.price).toBe(5000);
  });

  it("pauseItem and closeItem set status correctly", async () => {
    const fm = mockFetch()
      .onRegex("PUT", /\/items\/MLA\d+$/, (req) => {
        const body = req.body as { status?: string };
        return {
          status: 200,
          body: { ...ITEM_FIXTURE, status: body.status ?? "active" },
        };
      })
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    expect((await pauseItem(client, "MLA123")).status).toBe("paused");
    expect((await closeItem(client, "MLA123")).status).toBe("closed");
  });

  it("relistItem POSTs to /items/{id}/relist", async () => {
    const fm = mockFetch()
      .onRegex("POST", /\/items\/MLA\d+\/relist$/, () => ({
        status: 200,
        body: { ...ITEM_FIXTURE, status: "active" },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await relistItem(client, "MLA123", { quantity: 10 });
    expect(r.status).toBe("active");
  });

  it("searchSellerItems pages with scroll_id", async () => {
    let page = 0;
    const fm = mockFetch()
      .onRegex("GET", /\/users\/\d+\/items\/search$/, () => {
        page++;
        return {
          status: 200,
          body:
            page === 1
              ? {
                  paging: { total: 4, limit: 2 },
                  results: ["MLA1", "MLA2"],
                  scroll_id: "next-cursor",
                }
              : page === 2
                ? {
                    paging: { total: 4, limit: 2 },
                    results: ["MLA3", "MLA4"],
                    scroll_id: "final",
                  }
                : { paging: { total: 4 }, results: [] },
        };
      })
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const collected: string[] = [];
    for await (const id of iterateSellerItems(client, 12345)) {
      collected.push(id);
    }
    expect(collected).toEqual(["MLA1", "MLA2", "MLA3", "MLA4"]);
  });

  it("searchSellerItems returns single page metadata", async () => {
    const fm = mockFetch()
      .onRegex("GET", /\/users\/\d+\/items\/search$/, () => ({
        status: 200,
        body: { paging: { total: 1 }, results: ["MLA1"] },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await searchSellerItems(client, 12345, { status: "active" });
    expect(r.results).toEqual(["MLA1"]);
    expect(r.paging.total).toBe(1);
  });
});
