/**
 * BitsoOffRampAdapter tests. Pin the request contract against the documented
 * Bitso v3 wire (docs.bitso.com, jun-2026) with mocked HTTP: HMAC auth header,
 * quote (public ticker), convert (idempotency pre-check -> market sell -> sweep
 * ARS balance -> withdrawal), getStatus normalization, and error mapping.
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BitsoOffRampAdapter,
  BitsoApiError,
  BitsoAuthError,
  BitsoRateLimitError,
  normalizeBitsoStatus,
  deriveOriginId,
  BITSO_SANDBOX,
  type BitsoConfig,
} from "../src/bitso";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Mock fetch that routes enveloped responses by URL/method + records calls. */
function mockFetch(
  routes: Array<{ match: RegExp; method?: string; status?: number; json: unknown }>,
) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    calls.push({
      url: String(url),
      method,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const route = routes.find(
      (r) => r.match.test(String(url)) && (!r.method || r.method === method),
    );
    if (!route) return new Response(JSON.stringify({ success: false, error: { message: "no route" } }), { status: 404 });
    return new Response(JSON.stringify(route.json), { status: route.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (payload: unknown) => ({ success: true, payload });

const FIXED_NONCE = 1_700_000_000_000;
const baseConfig = (fetchImpl: typeof fetch): BitsoConfig => ({
  apiKey: "key_pub_123",
  apiSecret: "secret_hmac_456",
  cvu: "0000003100010000000001",
  recipientName: "Sociedad Automatizada SA",
  baseUrl: BITSO_SANDBOX,
  fetchImpl,
  now: () => FIXED_NONCE,
});

// Canonical routes for a happy-path convert (no existing withdrawal).
function happyRoutes(arsAvailable = "15000.50") {
  return [
    { match: /\/v3\/ticker/, method: "GET", json: ok({ bid: "1500", ask: "1505" }) },
    { match: /\/v3\/withdrawals\?origin_ids/, method: "GET", json: ok([]) },
    { match: /\/v3\/orders$/, method: "POST", json: ok({ oid: "o_123" }) },
    {
      match: /\/v3\/balance/,
      method: "GET",
      json: ok({ balances: [{ currency: "usdt", available: "0" }, { currency: "ars", available: arsAvailable }] }),
    },
    { match: /\/v3\/withdrawals$/, method: "POST", json: ok({ wid: "w_789", status: "pending" }) },
  ];
}

describe("BitsoOffRampAdapter — construction", () => {
  it("requires apiKey, apiSecret, cvu, recipientName", () => {
    const f = mockFetch([]).impl;
    expect(() => new BitsoOffRampAdapter({ ...baseConfig(f), apiKey: "" })).toThrow(/apiKey/);
    expect(() => new BitsoOffRampAdapter({ ...baseConfig(f), apiSecret: "" })).toThrow(/apiSecret/);
    expect(() => new BitsoOffRampAdapter({ ...baseConfig(f), cvu: "" })).toThrow(/cvu/);
    expect(() => new BitsoOffRampAdapter({ ...baseConfig(f), recipientName: "" })).toThrow(/recipientName/);
  });
});

describe("deriveOriginId", () => {
  it("is deterministic, <=40 chars, and Bitso-legal ([a-f0-9])", async () => {
    const a = await deriveOriginId("obligation:monotributo:2026-06:5000");
    const b = await deriveOriginId("obligation:monotributo:2026-06:5000");
    expect(a).toBe(b);
    expect(a).toHaveLength(40);
    expect(a).toMatch(/^[a-f0-9]{40}$/);
    expect(await deriveOriginId("different")).not.toBe(a);
  });
});

describe("BitsoOffRampAdapter — quote", () => {
  it("quotes USDT->ARS from the public ticker bid, with NO auth header", async () => {
    const { impl, calls } = mockFetch(happyRoutes());
    const a = new BitsoOffRampAdapter(baseConfig(impl));
    const q = await a.quote(100);
    expect(q.rate).toBe(1500);
    expect(q.arsOut).toBe(150_000);
    expect(q.spread).toBe(0);
    const ticker = calls.find((c) => /ticker/.test(c.url))!;
    expect(ticker.headers.authorization).toBeUndefined(); // public endpoint
    expect(ticker.url).toContain("book=usdt_ars");
  });

  it("applies a configured quote-only spread", async () => {
    const { impl } = mockFetch(happyRoutes());
    const a = new BitsoOffRampAdapter({ ...baseConfig(impl), spread: 0.02 });
    const q = await a.quote(100);
    expect(q.rate).toBeCloseTo(1470, 6); // 1500 * (1 - 0.02)
  });
});

describe("BitsoOffRampAdapter — auth signing", () => {
  it("signs private requests: HMAC-SHA256(secret, nonce+method+path+body), header `Bitso key:nonce:sig`", async () => {
    const { impl, calls } = mockFetch(happyRoutes());
    const cfg = baseConfig(impl);
    const a = new BitsoOffRampAdapter(cfg);
    await a.convert(100, { externalId: "ext-1" });

    const order = calls.find((c) => /\/v3\/orders$/.test(c.url) && c.method === "POST")!;
    const auth = order.headers.authorization!;
    expect(auth).toMatch(/^Bitso key_pub_123:\d+:[a-f0-9]{64}$/);
    const [, nonce, sig] = auth.replace("Bitso ", "").split(":");
    expect(Number(nonce)).toBe(FIXED_NONCE);
    // Recompute the expected signature over nonce + METHOD + path + body.
    const body = JSON.stringify({ book: "usdt_ars", side: "sell", type: "market", major: "100" });
    const expected = createHmac("sha256", cfg.apiSecret)
      .update(FIXED_NONCE + "POST" + "/v3/orders" + body)
      .digest("hex");
    expect(sig).toBe(expected);
  });
});

describe("BitsoOffRampAdapter — apiPrefix override", () => {
  it("uses /api/v3 for both the request URL and the signed path when configured", async () => {
    const { impl, calls } = mockFetch([
      { match: /\/api\/v3\/ticker/, method: "GET", json: ok({ bid: "1500" }) },
    ]);
    const cfg = { ...baseConfig(impl), apiPrefix: "/api/v3" };
    const a = new BitsoOffRampAdapter(cfg);
    await a.quote(1);
    const ticker = calls.find((c) => /ticker/.test(c.url))!;
    expect(ticker.url).toContain("/api/v3/ticker"); // request path flipped
  });
});

describe("BitsoOffRampAdapter — convert (sell -> sweep -> withdraw)", () => {
  it("places a market SELL (major), then withdraws the swept ARS to the CBU/CVU", async () => {
    const { impl, calls } = mockFetch(happyRoutes("15000.50"));
    const a = new BitsoOffRampAdapter(baseConfig(impl));
    const receipt = await a.convert(10, { externalId: "ext-42" });

    // Order: market sell of `major` USDT.
    const order = calls.find((c) => /\/v3\/orders$/.test(c.url) && c.method === "POST")!;
    expect(order.body).toEqual({ book: "usdt_ars", side: "sell", type: "market", major: "10" });

    // Withdrawal: ARS over the BIND/coelsa/cvu rail, swept amount, derived origin_id.
    const wd = calls.find((c) => /\/v3\/withdrawals$/.test(c.url) && c.method === "POST")!;
    const originId = await deriveOriginId("ext-42");
    expect(wd.body).toEqual({
      asset: "ars",
      currency: "ars",
      method: "bind",
      network: "coelsa",
      protocol: "cvu",
      amount: "15000.50",
      max_fee: "0",
      recipient_name: "Sociedad Automatizada SA",
      cvu: "0000003100010000000001",
      origin_id: originId,
    });

    expect(receipt).toEqual({
      amountUsd: 10,
      arsReceived: 15000.5,
      rate: 1500.05,
      txId: "w_789",
    });
  });

  it("honors cbu protocol when cvuType='cbu'", async () => {
    const { impl, calls } = mockFetch(happyRoutes());
    const a = new BitsoOffRampAdapter({ ...baseConfig(impl), cvuType: "cbu" });
    await a.convert(5, { externalId: "ext-cbu" });
    const wd = calls.find((c) => /\/v3\/withdrawals$/.test(c.url) && c.method === "POST")!;
    expect((wd.body as { protocol: string }).protocol).toBe("cbu");
  });

  it("is idempotent: an existing withdrawal for the origin_id is returned WITHOUT re-selling", async () => {
    const originId = await deriveOriginId("ext-dupe");
    const { impl, calls } = mockFetch([
      {
        match: /\/v3\/withdrawals\?origin_ids/,
        method: "GET",
        json: ok([{ wid: "w_existing", status: "processing", amount: "9000", origin_id: originId }]),
      },
      // These should NOT be hit:
      { match: /\/v3\/orders$/, method: "POST", json: ok({ oid: "SHOULD_NOT_HAPPEN" }) },
      { match: /\/v3\/withdrawals$/, method: "POST", json: ok({ wid: "SHOULD_NOT_HAPPEN" }) },
    ]);
    const a = new BitsoOffRampAdapter(baseConfig(impl));
    const r = await a.convert(6, { externalId: "ext-dupe" });
    expect(r.txId).toBe("w_existing");
    expect(r.arsReceived).toBe(9000);
    expect(calls.some((c) => /\/v3\/orders$/.test(c.url) && c.method === "POST")).toBe(false);
  });

  it("throws if there is no ARS balance after the sale", async () => {
    const { impl } = mockFetch(happyRoutes("0"));
    const a = new BitsoOffRampAdapter(baseConfig(impl));
    await expect(a.convert(10, { externalId: "ext-empty" })).rejects.toBeInstanceOf(BitsoApiError);
  });

  it("requires an externalId", async () => {
    const { impl } = mockFetch(happyRoutes());
    const a = new BitsoOffRampAdapter(baseConfig(impl));
    // @ts-expect-error testing the runtime guard
    await expect(a.convert(10, {})).rejects.toThrow(/externalId/);
  });
});

describe("BitsoOffRampAdapter — getStatus", () => {
  it("normalizes complete -> COMPLETED with arsSettled", async () => {
    const { impl } = mockFetch([
      { match: /\/v3\/withdrawals\/w_1/, method: "GET", json: ok({ wid: "w_1", status: "complete", amount: "15000" }) },
    ]);
    const a = new BitsoOffRampAdapter(baseConfig(impl));
    const s = await a.getStatus("w_1");
    expect(s.status).toBe("COMPLETED");
    expect(s.arsSettled).toBe(15000);
    expect(s.raw).toBe("complete");
  });

  it("normalizes pending/processing/failed", async () => {
    for (const [raw, want] of [
      ["pending", "PENDING"],
      ["processing", "PROCESSING"],
      ["failed", "FAILED"],
    ] as const) {
      const { impl } = mockFetch([
        { match: /\/v3\/withdrawals\/w_x/, method: "GET", json: ok({ wid: "w_x", status: raw }) },
      ]);
      const a = new BitsoOffRampAdapter(baseConfig(impl));
      const s = await a.getStatus("w_x");
      expect(s.status).toBe(want);
      expect(s.arsSettled).toBeUndefined();
    }
  });
});

describe("normalizeBitsoStatus", () => {
  it("maps Bitso statuses (case-insensitive)", () => {
    expect(normalizeBitsoStatus("COMPLETE")).toBe("COMPLETED");
    expect(normalizeBitsoStatus("completed")).toBe("COMPLETED");
    expect(normalizeBitsoStatus("processing")).toBe("PROCESSING");
    expect(normalizeBitsoStatus("pending")).toBe("PENDING");
    expect(normalizeBitsoStatus("failed")).toBe("FAILED");
    expect(normalizeBitsoStatus("cancelled")).toBe("FAILED");
    expect(normalizeBitsoStatus("weird")).toBe("UNKNOWN");
    expect(normalizeBitsoStatus(undefined)).toBe("UNKNOWN");
  });
});

describe("BitsoOffRampAdapter — error mapping", () => {
  it("401 -> BitsoAuthError, 429 -> BitsoRateLimitError", async () => {
    const conv401 = new BitsoOffRampAdapter(
      baseConfig(
        mockFetch([
          { match: /\/v3\/withdrawals\?origin_ids/, method: "GET", json: ok([]) },
          { match: /\/v3\/orders$/, method: "POST", status: 401, json: { success: false, error: { message: "unauthorized" } } },
        ]).impl,
      ),
    );
    await expect(conv401.convert(10, { externalId: "e" })).rejects.toBeInstanceOf(BitsoAuthError);

    const conv429 = new BitsoOffRampAdapter(
      baseConfig(
        mockFetch([
          { match: /\/v3\/withdrawals\?origin_ids/, method: "GET", json: ok([]) },
          { match: /\/v3\/orders$/, method: "POST", status: 429, json: { success: false, error: { message: "slow down" } } },
        ]).impl,
      ),
    );
    await expect(conv429.convert(10, { externalId: "e" })).rejects.toBeInstanceOf(BitsoRateLimitError);
  });

  it("success:false on HTTP 200 is still an error", async () => {
    const a = new BitsoOffRampAdapter(
      baseConfig(mockFetch([{ match: /\/v3\/ticker/, method: "GET", status: 200, json: { success: false, error: { code: "0301", message: "Unknown OrderBook" } } }]).impl),
    );
    await expect(a.quote(1)).rejects.toBeInstanceOf(BitsoApiError);
  });
});
