import { describe, it, expect, beforeEach } from "vitest";
import {
  VercelKVStateAdapter,
  type RedisLikeClient,
} from "../src/vercel-kv";
import type { CheckoutSession } from "../src/schemas/checkout-session";
import type { Order } from "../src/schemas/order";

/**
 * In-memory fake of `RedisLikeClient`. Matches Vercel KV / Upstash Redis
 * semantics for `set` (with `nx`/`ex`), `get`, `del`. Sufficient for unit
 * tests without spinning up a real KV instance.
 */
class FakeRedis implements RedisLikeClient {
  private store = new Map<string, { value: unknown; expiresAt?: number }>();

  async get<T = unknown>(key: string): Promise<T | null> {
    const rec = this.store.get(key);
    if (!rec) return null;
    if (rec.expiresAt && rec.expiresAt < Date.now() / 1000) {
      this.store.delete(key);
      return null;
    }
    return rec.value as T;
  }

  async set(
    key: string,
    value: unknown,
    options?: { ex?: number; nx?: boolean },
  ): Promise<unknown> {
    if (options?.nx && this.store.has(key)) {
      const rec = this.store.get(key)!;
      if (!rec.expiresAt || rec.expiresAt >= Date.now() / 1000) {
        return null; // NX failed
      }
      // Expired — fall through and overwrite.
    }
    const entry: { value: unknown; expiresAt?: number } = { value };
    if (options?.ex) entry.expiresAt = Math.floor(Date.now() / 1000) + options.ex;
    this.store.set(key, entry);
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  // Inspector used by tests
  size(): number {
    return this.store.size;
  }
}

const sampleSession: CheckoutSession = {
  id: "cs_kv_1",
  status: "ready_for_payment",
  currency: "ars",
  line_items: [
    {
      id: "li_1",
      item: { id: "item_x" },
      quantity: 1,
      totals: [{ type: "subtotal", display_text: "S", amount: 5000 }],
    },
  ],
  fulfillment_options: [],
  totals: [{ type: "total", display_text: "T", amount: 5000 }],
  messages: [],
  links: [],
};

const sampleOrder: Order = {
  type: "order",
  id: "ord_kv_1",
  checkout_session_id: "cs_kv_1",
  permalink_url: "https://example.com/o/ord_kv_1",
};

describe("VercelKVStateAdapter — sessions", () => {
  let kv: FakeRedis;
  let adapter: VercelKVStateAdapter;
  beforeEach(() => {
    kv = new FakeRedis();
    adapter = new VercelKVStateAdapter(kv);
  });

  it("persists and retrieves a session via prefixed key", async () => {
    await adapter.saveSession(sampleSession);
    expect(await adapter.loadSession("cs_kv_1")).toEqual(sampleSession);
    // Default prefix
    expect(await kv.get("acp:session:cs_kv_1")).toEqual(sampleSession);
  });

  it("deleteSession removes the record", async () => {
    await adapter.saveSession(sampleSession);
    await adapter.deleteSession("cs_kv_1");
    expect(await adapter.loadSession("cs_kv_1")).toBeNull();
  });

  it("uses a custom prefix when configured", async () => {
    const a = new VercelKVStateAdapter(kv, { prefix: "myapp:" });
    await a.saveSession(sampleSession);
    expect(await kv.get("myapp:session:cs_kv_1")).toEqual(sampleSession);
  });
});

describe("VercelKVStateAdapter — orders", () => {
  it("persists order + secondary index by session", async () => {
    const kv = new FakeRedis();
    const adapter = new VercelKVStateAdapter(kv);
    await adapter.saveOrder(sampleOrder);
    expect(await adapter.loadOrder("ord_kv_1")).toEqual(sampleOrder);
    expect(await adapter.loadOrderBySession("cs_kv_1")).toEqual(sampleOrder);
  });

  it("returns null when session-to-order index is missing", async () => {
    const kv = new FakeRedis();
    const adapter = new VercelKVStateAdapter(kv);
    expect(await adapter.loadOrderBySession("cs_unknown")).toBeNull();
  });
});

describe("VercelKVStateAdapter — idempotency", () => {
  let kv: FakeRedis;
  let adapter: VercelKVStateAdapter;
  beforeEach(() => {
    kv = new FakeRedis();
    adapter = new VercelKVStateAdapter(kv);
  });

  it("first claim wins", async () => {
    const r = await adapter.tryClaim(
      "POST /checkout_sessions",
      "key_1",
      "hash_1",
    );
    expect(r.kind).toBe("claimed");
  });

  it("second claim with same body returns in_flight", async () => {
    await adapter.tryClaim("POST /checkout_sessions", "key_1", "hash_1");
    const r = await adapter.tryClaim(
      "POST /checkout_sessions",
      "key_1",
      "hash_1",
    );
    expect(r.kind).toBe("in_flight");
  });

  it("second claim with different body returns conflict", async () => {
    await adapter.tryClaim("POST /checkout_sessions", "key_1", "hash_1");
    const r = await adapter.tryClaim(
      "POST /checkout_sessions",
      "key_1",
      "hash_DIFFERENT",
    );
    expect(r.kind).toBe("conflict");
  });

  it("complete + replay returns the cached response", async () => {
    await adapter.tryClaim("POST /checkout_sessions", "key_1", "hash_1");
    await adapter.complete("POST /checkout_sessions", "key_1", {
      status: 201,
      body: { id: "cs_x" },
      headers: { "Content-Type": "application/json" },
    });
    const r = await adapter.tryClaim(
      "POST /checkout_sessions",
      "key_1",
      "hash_1",
    );
    expect(r.kind).toBe("replay");
    if (r.kind === "replay") {
      expect(r.status).toBe(201);
      expect(r.body).toEqual({ id: "cs_x" });
    }
  });

  it("release() unclaims so a retry can proceed", async () => {
    await adapter.tryClaim("POST /checkout_sessions", "key_1", "hash_1");
    await adapter.release("POST /checkout_sessions", "key_1");
    const r = await adapter.tryClaim(
      "POST /checkout_sessions",
      "key_1",
      "hash_1",
    );
    expect(r.kind).toBe("claimed");
  });

  it("scopes idempotency by (scope, key)", async () => {
    await adapter.tryClaim("POST /checkout_sessions", "key_1", "h1");
    const r = await adapter.tryClaim("POST /carts", "key_1", "h2");
    expect(r.kind).toBe("claimed");
  });
});
