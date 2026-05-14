import { describe, it, expect } from "vitest";
import { mockFetch, makeMeliClient } from "../src/testing";
import {
  meliItemToFeedProduct,
  buildFeedSnapshot,
  buildFeedPage,
  iterateFeed,
} from "../src/feed";
import type { Item } from "../src";

const ITEM_ACTIVE: Item = {
  id: "MLA1402155766",
  site_id: "MLA",
  title: "Yerba Mate Amanda 1kg con palo",
  seller_id: 12345,
  category_id: "MLA409408",
  price: 4500,
  currency_id: "ARS",
  available_quantity: 50,
  sold_quantity: 1200,
  condition: "new",
  buying_mode: "buy_it_now",
  listing_type_id: "gold_special",
  status: "active",
  permalink: "https://articulo.mercadolibre.com.ar/MLA1402155766",
  pictures: [
    { id: "1", url: "http://x.example/img1.jpg", secure_url: "https://x.example/img1.jpg" },
  ],
  attributes: [
    { id: "BRAND", name: "Marca", value_name: "Amanda" },
    { id: "NET_WEIGHT", name: "Peso neto", value_name: "1 kg" },
  ],
  shipping: { mode: "me2", free_shipping: false, logistic_type: "drop_off" },
  tags: ["good_quality_picture"],
} as Item;

const ITEM_PAUSED: Item = { ...ITEM_ACTIVE, id: "MLA999", status: "paused" };

describe("meliItemToFeedProduct (pure mapper)", () => {
  it("maps active item to ACP feed product with all fields", () => {
    const fp = meliItemToFeedProduct(ITEM_ACTIVE);
    expect(fp).toBeTruthy();
    expect(fp!.id).toBe("MLA1402155766");
    expect(fp!.currency).toBe("ARS"); // uppercase per ACP convention
    expect(fp!.brand).toBe("Amanda");
    expect(fp!.attributes?.["Marca"]).toBe("Amanda");
    expect(fp!.attributes?.["Peso neto"]).toBe("1 kg");
    expect(fp!.images).toHaveLength(1);
    expect(fp!.images?.[0]).toMatch(/^https/);
    expect(fp!.shipping?.mode).toBe("me2");
    expect(fp!.shipping?.free).toBe(false);
    expect(fp!.vendor_metadata?.meli?.site_id).toBe("MLA");
    expect(fp!.vendor_metadata?.meli?.condition).toBe("new");
    expect(fp!.vendor_metadata?.meli?.sold_quantity).toBe(1200);
  });

  it("returns null for non-active items (paused, closed, under_review)", () => {
    expect(meliItemToFeedProduct(ITEM_PAUSED)).toBeNull();
  });

  it("prefers secure_url over url for images", () => {
    const fp = meliItemToFeedProduct({
      ...ITEM_ACTIVE,
      pictures: [
        { id: "1", url: "http://insecure.example/x.jpg", secure_url: "https://secure.example/x.jpg" },
      ],
    } as Item);
    expect(fp!.images?.[0]).toBe("https://secure.example/x.jpg");
  });

  it("omits optional fields cleanly when missing", () => {
    const minimal: Item = {
      id: "MLA1",
      site_id: "MLA",
      title: "X",
      seller_id: 1,
      category_id: "MLA1",
      price: 100,
      currency_id: "ARS",
      available_quantity: 1,
      condition: "new",
      buying_mode: "buy_it_now",
      listing_type_id: "free",
      status: "active",
      permalink: "https://x.example/MLA1",
    } as Item;
    const fp = meliItemToFeedProduct(minimal)!;
    expect(fp.images).toBeUndefined();
    expect(fp.attributes).toBeUndefined();
    expect(fp.brand).toBeUndefined();
    expect(fp.shipping).toBeUndefined();
  });
});

describe("buildFeedPage", () => {
  it("returns one page with cursor when MELI has more results", async () => {
    const fm = mockFetch()
      .on("GET", "/users/12345/items/search", () => ({
        status: 200,
        body: { results: ["MLA1402155766"], scroll_id: "next-cursor-xyz" },
      }))
      .on("GET", "/items", () => ({
        status: 200,
        body: [{ code: 200, body: ITEM_ACTIVE }],
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch, skipResponseValidation: true });
    const page = await buildFeedPage(client, 12345);
    expect(page.products).toHaveLength(1);
    expect(page.next_cursor).toBe("next-cursor-xyz");
    expect(page.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns null cursor when catalog is exhausted", async () => {
    const fm = mockFetch()
      .on("GET", "/users/12345/items/search", () => ({
        status: 200,
        body: { results: [] },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch, skipResponseValidation: true });
    const page = await buildFeedPage(client, 12345);
    expect(page.products).toHaveLength(0);
    expect(page.next_cursor).toBeNull();
  });

  it("filters non-active items from a multiget response", async () => {
    const fm = mockFetch()
      .on("GET", "/users/12345/items/search", () => ({
        status: 200,
        body: { results: ["MLA1", "MLA999"] },
      }))
      .on("GET", "/items", () => ({
        status: 200,
        body: [
          { code: 200, body: ITEM_ACTIVE },
          { code: 200, body: ITEM_PAUSED },
        ],
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch, skipResponseValidation: true });
    const page = await buildFeedPage(client, 12345);
    expect(page.products).toHaveLength(1);
    expect(page.products[0]?.id).toBe("MLA1402155766");
  });

  it("threads cursor through to MELI", async () => {
    const fm = mockFetch()
      .on("GET", "/users/12345/items/search", () => ({
        status: 200,
        body: { results: [] },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch, skipResponseValidation: true });
    await buildFeedPage(client, 12345, { cursor: "previous-cursor" });
    const url = new URL(fm.requests[0]!.url);
    expect(url.searchParams.get("scroll_id")).toBe("previous-cursor");
  });
});

describe("iterateFeed (streaming)", () => {
  it("yields products across multiple pages", async () => {
    let scrollCalls = 0;
    const fm = mockFetch()
      .on("GET", "/users/12345/items/search", () => {
        scrollCalls++;
        if (scrollCalls === 1) {
          return {
            status: 200,
            body: { results: ["MLA1", "MLA2"], scroll_id: "next" },
          };
        }
        return { status: 200, body: { results: [] } };
      })
      .on("GET", "/items", () => ({
        status: 200,
        body: [
          { code: 200, body: { ...ITEM_ACTIVE, id: "MLA1" } },
          { code: 200, body: { ...ITEM_ACTIVE, id: "MLA2" } },
        ],
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch, skipResponseValidation: true });
    const collected: string[] = [];
    for await (const product of iterateFeed(client, 12345)) {
      collected.push(product.id);
    }
    expect(collected).toEqual(["MLA1", "MLA2"]);
  });
});

describe("buildFeedSnapshot", () => {
  it("returns full catalog as a single array", async () => {
    let scrollCalls = 0;
    const fm = mockFetch()
      .on("GET", "/users/12345/items/search", () => {
        scrollCalls++;
        if (scrollCalls === 1) {
          return {
            status: 200,
            body: { results: ["MLA1"], scroll_id: "next" },
          };
        }
        return { status: 200, body: { results: [] } };
      })
      .on("GET", "/items", () => ({
        status: 200,
        body: [{ code: 200, body: { ...ITEM_ACTIVE, id: "MLA1" } }],
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch, skipResponseValidation: true });
    const snapshot = await buildFeedSnapshot(client, 12345);
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.id).toBe("MLA1");
  });
});
