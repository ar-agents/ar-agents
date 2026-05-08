import { describe, it, expect } from "vitest";
import {
  createMeliCatalogProvider,
  buildMeliFeedBatch,
  meliItemToFeedProduct,
  type MeliItem,
} from "../src/integrations";

const meliMLA: MeliItem = {
  id: "MLA123456789",
  title: "iPhone 15 128GB Negro",
  price: 1199.99,
  currency_id: "ARS",
  available_quantity: 12,
  status: "active",
  category_id: "MLA1055",
  pictures: [
    {
      id: "pic1",
      url: "http://http2.mlstatic.com/D_pic1.jpg",
      secure_url: "https://http2.mlstatic.com/D_pic1.jpg",
    },
  ],
  permalink: "https://articulo.mercadolibre.com.ar/MLA123456789",
  attributes: [
    { id: "BRAND", name: "Marca", value_name: "Apple" },
    { id: "MODEL", name: "Modelo", value_name: "iPhone 15" },
  ],
  shipping: { mode: "me2", free_shipping: true, logistic_type: "fulfillment" },
  seller_id: 12345,
  seller_address: { city: { name: "Buenos Aires" } },
};

describe("createMeliCatalogProvider", () => {
  it("resolves an active item to a ResolvedItem", async () => {
    const provider = createMeliCatalogProvider({
      getItem: async (id) => (id === meliMLA.id ? meliMLA : null),
    });
    const r = await provider.resolveItem(meliMLA.id);
    expect(r).not.toBeNull();
    expect(r?.id).toBe(meliMLA.id);
    expect(r?.name).toBe(meliMLA.title);
    expect(r?.unit_amount).toBe(Math.round(1199.99 * 100));
    expect(r?.currency).toBe("ars");
    expect(r?.available_quantity).toBe(12);
    expect(r?.images?.[0]).toBe("https://http2.mlstatic.com/D_pic1.jpg");
    expect(r?.category).toBe("MLA1055");
  });

  it("returns null for non-existent item", async () => {
    const provider = createMeliCatalogProvider({
      getItem: async () => null,
    });
    expect(await provider.resolveItem("missing")).toBeNull();
  });

  it("filters out paused items by default", async () => {
    const provider = createMeliCatalogProvider({
      getItem: async () => ({ ...meliMLA, status: "paused" }),
    });
    expect(await provider.resolveItem(meliMLA.id)).toBeNull();
  });

  it("respects acceptableStatuses override", async () => {
    const provider = createMeliCatalogProvider({
      getItem: async () => ({ ...meliMLA, status: "paused" }),
      acceptableStatuses: ["active", "paused"],
    });
    expect(await provider.resolveItem(meliMLA.id)).not.toBeNull();
  });

  it("filters by acceptedCurrencies", async () => {
    const provider = createMeliCatalogProvider({
      getItem: async () => ({ ...meliMLA, currency_id: "USD" }),
      acceptedCurrencies: ["ars"],
    });
    expect(await provider.resolveItem(meliMLA.id)).toBeNull();
  });

  it("uses 0-decimal divisor for CLP", async () => {
    const provider = createMeliCatalogProvider({
      getItem: async () => ({
        ...meliMLA,
        currency_id: "CLP",
        price: 50000,
      }),
    });
    const r = await provider.resolveItem(meliMLA.id);
    expect(r?.unit_amount).toBe(50000); // no division
  });
});

describe("meliItemToFeedProduct", () => {
  it("translates MELI item to FeedProduct", () => {
    const fp = meliItemToFeedProduct(meliMLA);
    expect(fp).not.toBeNull();
    expect(fp!.id).toBe(meliMLA.id);
    expect(fp!.title).toBe(meliMLA.title);
    expect(fp!.price).toBe(1199.99);
    expect(fp!.currency).toBe("ARS"); // uppercase in feed
    expect(fp!.images?.[0]).toBe("https://http2.mlstatic.com/D_pic1.jpg");
    expect(fp!.permalink_url).toBe(meliMLA.permalink);
    expect(fp!.attributes?.["Marca"]).toBe("Apple");
    expect(fp!.shipping?.free).toBe(true);
    expect(fp!.shipping?.mode).toBe("me2");
    expect(fp!.seller?.id).toBe("12345");
    expect(fp!.seller?.name).toBe("Buenos Aires");
  });

  it("filters paused items by default", () => {
    expect(meliItemToFeedProduct({ ...meliMLA, status: "paused" })).toBeNull();
  });

  it("includes paused items when filterActiveOnly=false", () => {
    const fp = meliItemToFeedProduct(
      { ...meliMLA, status: "paused" },
      { filterActiveOnly: false },
    );
    expect(fp).not.toBeNull();
  });
});

describe("buildMeliFeedBatch", () => {
  it("filters and projects an array of items", () => {
    const items: MeliItem[] = [
      meliMLA,
      { ...meliMLA, id: "MLA222", status: "paused" },
      { ...meliMLA, id: "MLA333" },
    ];
    const batch = buildMeliFeedBatch(items);
    expect(batch.count).toBe(2);
    expect(batch.products.map((p) => p.id)).toEqual([
      "MLA123456789",
      "MLA333",
    ]);
  });
});
