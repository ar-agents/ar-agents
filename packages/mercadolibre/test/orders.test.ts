import { describe, it, expect } from "vitest";
import { mockFetch, makeMeliClient } from "../src/testing";
import {
  searchOrders,
  getOrder,
  getOrderBillingInfo,
  getPack,
  partitionByPack,
} from "../src";
import type { Order } from "../src";

const ORDER_FIXTURE = {
  id: 1234,
  date_created: "2026-05-09T10:00:00.000Z",
  status: "paid" as const,
  total_amount: 4500,
  currency_id: "ARS",
  pack_id: null,
  order_items: [
    {
      item: { id: "MLA1", title: "Yerba Amanda 1kg" },
      quantity: 1,
      unit_price: 4500,
      currency_id: "ARS",
    },
  ],
  buyer: { id: 88, nickname: "TERE-X" },
};

describe("orders API", () => {
  it("searchOrders hits /orders/search with seller filter", async () => {
    const fm = mockFetch()
      .on("GET", "/orders/search", () => ({
        status: 200,
        body: { paging: { total: 1 }, results: [ORDER_FIXTURE] },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await searchOrders(client, 12345, { status: "paid" });
    expect(r.results).toHaveLength(1);
    expect(new URL(fm.requests[0]!.url).searchParams.get("seller")).toBe("12345");
    expect(new URL(fm.requests[0]!.url).searchParams.get("order.status")).toBe("paid");
  });

  it("getOrder hits /orders/{id}", async () => {
    const fm = mockFetch()
      .on("GET", "/orders/1234", () => ({ status: 200, body: ORDER_FIXTURE }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await getOrder(client, 1234);
    expect(r.id).toBe(1234);
  });

  it("getOrderBillingInfo returns buyer tax data", async () => {
    const fm = mockFetch()
      .on("GET", "/orders/1234/billing_info", () => ({
        status: 200,
        body: { buyer: { billing_info: { doc_type: "CUIT", doc_number: "20123456789" } } },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await getOrderBillingInfo(client, 1234);
    expect(r.buyer.billing_info?.doc_type).toBe("CUIT");
  });

  it("getPack hits /marketplace/orders/pack/{id}", async () => {
    const fm = mockFetch()
      .on("GET", "/marketplace/orders/pack/9999", () => ({
        status: 200,
        body: {
          id: 9999,
          status: "ready_to_print",
          orders: [{ id: 1 }, { id: 2 }, { id: 3 }],
        },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await getPack(client, 9999);
    expect(r.orders).toHaveLength(3);
  });

  it("partitionByPack splits cart vs single orders", () => {
    const cartOrder1 = { ...ORDER_FIXTURE, id: 100, pack_id: 9001 } as Order;
    const cartOrder2 = { ...ORDER_FIXTURE, id: 101, pack_id: 9001 } as Order;
    const singleOrder = { ...ORDER_FIXTURE, id: 200, pack_id: null } as Order;
    const r = partitionByPack([cartOrder1, cartOrder2, singleOrder]);
    expect(r.singleOrders).toHaveLength(1);
    expect(r.singleOrders[0]?.id).toBe(200);
    expect(r.packs.size).toBe(1);
    expect(r.packs.get(9001)).toHaveLength(2);
  });
});
