import { describe, expect, it, vi } from "vitest";
import {
  UnconfiguredTiendaNubeAdapter,
  HttpTiendaNubeAdapter,
  InMemoryTiendaNubeAdapter,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  TiendaNubeAuthError,
  TiendaNubeApiError,
  TiendaNubeUnconfiguredError,
  TiendaNubeValidationError,
  tiendaNubeTools,
  ALL_TOOL_NAMES,
  type FetchLike,
  type Order,
  type Product,
  type Customer,
} from "../src/index";

function mockFetch(
  responder: (input: {
    url: string;
    method: string;
    body?: string;
  }) => {
    ok: boolean;
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  },
): FetchLike {
  return async (url, init = {}) => {
    const r = responder({
      url,
      method: init.method ?? "GET",
      body: init.body,
    });
    return {
      ok: r.ok,
      status: r.status,
      headers: { get: (k: string) => r.headers?.[k.toLowerCase()] ?? null },
      text: async () => JSON.stringify(r.body),
      json: async () => r.body,
    };
  };
}

describe("UnconfiguredTiendaNubeAdapter", () => {
  it("throws on every method", async () => {
    const a = new UnconfiguredTiendaNubeAdapter();
    await expect(a.getStore()).rejects.toThrow(TiendaNubeUnconfiguredError);
    await expect(a.listProducts()).rejects.toThrow(TiendaNubeUnconfiguredError);
    await expect(a.getProduct(1)).rejects.toThrow(TiendaNubeUnconfiguredError);
    await expect(a.listOrders()).rejects.toThrow(TiendaNubeUnconfiguredError);
    await expect(a.getOrder(1)).rejects.toThrow(TiendaNubeUnconfiguredError);
    await expect(a.listCustomers()).rejects.toThrow(TiendaNubeUnconfiguredError);
    await expect(a.getCustomer(1)).rejects.toThrow(TiendaNubeUnconfiguredError);
    await expect(a.listWebhooks()).rejects.toThrow(TiendaNubeUnconfiguredError);
    await expect(
      a.createWebhook({ event: "order/paid", url: "https://x" }),
    ).rejects.toThrow(TiendaNubeUnconfiguredError);
    await expect(a.deleteWebhook(1)).rejects.toThrow(TiendaNubeUnconfiguredError);
  });
});

describe("HttpTiendaNubeAdapter construction", () => {
  const baseOpts = {
    storeId: 12345,
    accessToken: "tn_access",
    appName: "TestApp",
    contactEmail: "test@example.com",
  };

  it("requires accessToken", () => {
    expect(
      () => new HttpTiendaNubeAdapter({ ...baseOpts, accessToken: "" }),
    ).toThrow(TiendaNubeValidationError);
  });
  it("requires positive integer storeId", () => {
    expect(
      () => new HttpTiendaNubeAdapter({ ...baseOpts, storeId: -1 }),
    ).toThrow(TiendaNubeValidationError);
    expect(
      () => new HttpTiendaNubeAdapter({ ...baseOpts, storeId: 1.5 }),
    ).toThrow(TiendaNubeValidationError);
  });
  it("requires appName + contactEmail (TN UA convention)", () => {
    expect(
      () => new HttpTiendaNubeAdapter({ ...baseOpts, appName: "" }),
    ).toThrow(TiendaNubeValidationError);
  });
});

describe("HttpTiendaNubeAdapter request layer", () => {
  it("targets /v1/{storeId}/{path} with Authentication header + UA", async () => {
    let captured: { url: string; method: string; headers?: Record<string, string> } | null = null;
    const fetchImpl: FetchLike = async (url, init = {}) => {
      captured = { url, method: init.method ?? "GET", headers: init.headers };
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => "{}",
        json: async () => ({ id: 1, name: { es: "" }, country: "AR" }),
      };
    };
    const a = new HttpTiendaNubeAdapter({
      storeId: 999,
      accessToken: "tn_xyz",
      appName: "Vultur",
      contactEmail: "naza@naza.ar",
      fetch: fetchImpl,
    });
    await a.getStore();
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("https://api.tiendanube.com/v1/999/store");
    expect(captured!.headers?.authentication).toBe("bearer tn_xyz");
    expect(captured!.headers?.["user-agent"]).toBe("Vultur (naza@naza.ar)");
  });

  it("maps 401/403 to TiendaNubeAuthError", async () => {
    const a = new HttpTiendaNubeAdapter({
      storeId: 1,
      accessToken: "tn",
      appName: "X",
      contactEmail: "x@y.com",
      fetch: mockFetch(() => ({ ok: false, status: 401, body: { description: "no" } })),
    });
    await expect(a.getStore()).rejects.toBeInstanceOf(TiendaNubeAuthError);
  });

  it("maps non-2xx (other than 401/403) to TiendaNubeApiError with status + body", async () => {
    const a = new HttpTiendaNubeAdapter({
      storeId: 1,
      accessToken: "tn",
      appName: "X",
      contactEmail: "x@y.com",
      fetch: mockFetch(() => ({
        ok: false,
        status: 429,
        body: { description: "Too many requests" },
      })),
    });
    try {
      await a.getStore();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TiendaNubeApiError);
      const e = err as TiendaNubeApiError;
      expect(e.status).toBe(429);
      expect(e.retryable).toBe(true);
      expect(e.message).toContain("Too many requests");
    }
  });

  it("listProducts builds q + per_page + page query string", async () => {
    let capturedUrl = "";
    const a = new HttpTiendaNubeAdapter({
      storeId: 1,
      accessToken: "tn",
      appName: "X",
      contactEmail: "x@y.com",
      fetch: mockFetch((req) => {
        capturedUrl = req.url;
        return { ok: true, status: 200, body: [] };
      }),
    });
    await a.listProducts({ q: "remera", publishedOnly: true, page: 2, perPage: 50 });
    expect(capturedUrl).toContain("q=remera");
    expect(capturedUrl).toContain("published=true");
    expect(capturedUrl).toContain("page=2");
    expect(capturedUrl).toContain("per_page=50");
  });

  it("listOrders exposes hasMore via Link rel=next header", async () => {
    const a = new HttpTiendaNubeAdapter({
      storeId: 1,
      accessToken: "tn",
      appName: "X",
      contactEmail: "x@y.com",
      fetch: mockFetch(() => ({
        ok: true,
        status: 200,
        body: [],
        headers: { link: '<https://api.tiendanube.com/...>; rel="next"' },
      })),
    });
    const page = await a.listOrders({ status: "open", page: 1, perPage: 5 });
    expect(page.hasMore).toBe(true);
  });

  it("createWebhook requires https url", async () => {
    const a = new HttpTiendaNubeAdapter({
      storeId: 1,
      accessToken: "tn",
      appName: "X",
      contactEmail: "x@y.com",
      fetch: mockFetch(() => ({ ok: true, status: 201, body: {} })),
    });
    await expect(
      a.createWebhook({ event: "order/paid", url: "http://insecure" }),
    ).rejects.toBeInstanceOf(TiendaNubeValidationError);
  });
});

describe("InMemoryTiendaNubeAdapter", () => {
  const product = (id: number, name: string, published = true): Product => ({
    id,
    name: { es: name },
    handle: { es: name.toLowerCase() },
    published,
    variants: [
      {
        id: id * 10,
        product_id: id,
        price: "100.00",
        stock_management: true,
        stock: 5,
        values: [],
      },
    ],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });

  const order = (id: number, email: string, status: Order["status"] = "open", paid = false): Order => ({
    id,
    number: id,
    token: `tok_${id}`,
    status,
    payment_status: paid ? "paid" : "pending",
    shipping_status: "unfulfilled",
    subtotal: "100.00",
    total: "100.00",
    currency: "ARS",
    contact_email: email,
    products: [],
    created_at: `2026-01-${String(id).padStart(2, "0")}T00:00:00.000Z`,
    updated_at: `2026-01-${String(id).padStart(2, "0")}T00:00:00.000Z`,
  });

  it("getStore returns the seeded store", async () => {
    const a = new InMemoryTiendaNubeAdapter();
    const s = await a.getStore();
    expect(s.country).toBe("AR");
    expect(s.main_currency).toBe("ARS");
  });

  it("listProducts filters by publishedOnly + q", async () => {
    const a = new InMemoryTiendaNubeAdapter({
      products: [
        product(1, "Remera Negra"),
        product(2, "Remera Blanca"),
        product(3, "Pantalón", false),
      ],
    });
    const all = await a.listProducts();
    expect(all.data).toHaveLength(3);

    const remeras = await a.listProducts({ q: "remera" });
    expect(remeras.data).toHaveLength(2);

    const publishedOnly = await a.listProducts({ publishedOnly: true });
    expect(publishedOnly.data).toHaveLength(2);
  });

  it("getProduct returns 404-API-error on unknown id", async () => {
    const a = new InMemoryTiendaNubeAdapter({ products: [product(1, "x")] });
    await expect(a.getProduct(99)).rejects.toBeInstanceOf(TiendaNubeApiError);
  });

  it("listOrders filters by status + paymentStatus + email substring", async () => {
    const a = new InMemoryTiendaNubeAdapter({
      orders: [
        order(1, "a@x.com", "open", true),
        order(2, "b@x.com", "open", false),
        order(3, "c@x.com", "cancelled"),
      ],
    });
    expect((await a.listOrders({ status: "open" })).data).toHaveLength(2);
    expect((await a.listOrders({ paymentStatus: "paid" })).data).toHaveLength(1);
    expect((await a.listOrders({ email: "a@" })).data).toHaveLength(1);
  });

  it("listOrders is reverse-chronological", async () => {
    const a = new InMemoryTiendaNubeAdapter({
      orders: [order(1, "x"), order(5, "y"), order(3, "z")],
    });
    const page = await a.listOrders();
    expect(page.data.map((o) => o.id)).toEqual([5, 3, 1]);
  });

  it("listCustomers q matches name + email case-insensitively", async () => {
    const customer = (id: number, name: string, email: string): Customer => ({
      id,
      name,
      email,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const a = new InMemoryTiendaNubeAdapter({
      customers: [
        customer(1, "Naza", "naza@naza.ar"),
        customer(2, "Cliente Demo", "demo@x.com"),
      ],
    });
    expect((await a.listCustomers({ q: "NAZA" })).data).toHaveLength(1);
    expect((await a.listCustomers({ q: "NAZA.AR" })).data).toHaveLength(1);
  });

  it("paginate honors page + perPage + hasMore", async () => {
    const a = new InMemoryTiendaNubeAdapter({
      orders: Array.from({ length: 7 }, (_, i) => order(i + 1, `x${i}@y.com`)),
    });
    const page1 = await a.listOrders({ page: 1, perPage: 3 });
    expect(page1.data).toHaveLength(3);
    expect(page1.hasMore).toBe(true);
    const page2 = await a.listOrders({ page: 2, perPage: 3 });
    expect(page2.data).toHaveLength(3);
    expect(page2.hasMore).toBe(true);
    const page3 = await a.listOrders({ page: 3, perPage: 3 });
    expect(page3.data).toHaveLength(1);
    expect(page3.hasMore).toBe(false);
  });

  it("webhook CRUD: create, list, delete", async () => {
    const a = new InMemoryTiendaNubeAdapter();
    expect(await a.listWebhooks()).toHaveLength(0);
    const w = await a.createWebhook({ event: "order/paid", url: "https://x.com/hook" });
    expect(w.id).toBe(1);
    expect((await a.listWebhooks()).length).toBe(1);
    await a.deleteWebhook(w.id);
    expect(await a.listWebhooks()).toHaveLength(0);
  });

  it("createWebhook rejects non-https urls", async () => {
    const a = new InMemoryTiendaNubeAdapter();
    await expect(
      a.createWebhook({ event: "order/paid", url: "http://insecure" }),
    ).rejects.toBeInstanceOf(TiendaNubeValidationError);
  });
});

describe("OAuth", () => {
  it("buildAuthorizeUrl includes appId + state", () => {
    const url = buildAuthorizeUrl({ appId: "12345", state: "csrf-abc" });
    expect(url).toBe(
      "https://www.tiendanube.com/apps/12345/authorize?state=csrf-abc",
    );
  });

  it("exchangeCodeForToken normalizes user_id → storeId", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          access_token: "tn_real",
          user_id: 4242,
          scope: "read_products,read_orders",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    const t = await exchangeCodeForToken(
      { appId: "1", clientSecret: "s", code: "code" },
      fetchImpl,
    );
    expect(t.accessToken).toBe("tn_real");
    expect(t.storeId).toBe(4242);
    expect(t.scope).toContain("read_orders");
  });

  it("exchangeCodeForToken maps 401 to TiendaNubeAuthError", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(
      exchangeCodeForToken(
        { appId: "1", clientSecret: "s", code: "code" },
        fetchImpl,
      ),
    ).rejects.toBeInstanceOf(TiendaNubeAuthError);
  });
});

describe("tiendaNubeTools factory", () => {
  it("exposes all 10 tools by default", () => {
    const t = tiendaNubeTools();
    expect(Object.keys(t).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("honors `include` filter", () => {
    const t = tiendaNubeTools({
      include: ["tienda_nube_get_store", "tienda_nube_list_orders"],
    });
    expect(Object.keys(t).sort()).toEqual([
      "tienda_nube_get_store",
      "tienda_nube_list_orders",
    ]);
  });

  it("each tool has a meaningful description", () => {
    const t = tiendaNubeTools();
    for (const [name, def] of Object.entries(t)) {
      expect(def.description, `${name} missing description`).toBeTruthy();
      expect(def.description!.length).toBeGreaterThan(40);
    }
  });
});

// Suppress unused-mockFetch ESM-import warning if vi.fn happens to be
// rebound in future test additions:
void vi;
