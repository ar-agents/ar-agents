/**
 * Unit tests for MantecaOffRampAdapter. Manteca onboarding is sales-gated (no
 * self-serve keys), so we cannot integration-test live. Instead we PIN THE
 * REQUEST CONTRACT exactly (method, path, headers, body) against the documented
 * v2 API, plus response parsing + error mapping, against a mocked fetch. Going
 * live = confirm baseUrl/ticker/response-shape vs. sandbox, then run for real.
 */

import { describe, expect, it } from "vitest";
import {
  MantecaOffRampAdapter,
  MantecaApiError,
  MantecaAuthError,
  MantecaRateLimitError,
  parseDirectPrice,
  normalizeMantecaStatus,
} from "../src/manteca";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

function makeFetch(
  handler: (url: string, method: string) => { status?: number; body?: unknown; text?: string },
) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), method, headers, body });
    const r = handler(String(url), method);
    const text = r.text !== undefined ? r.text : r.body !== undefined ? JSON.stringify(r.body) : "";
    return new Response(text, { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const FIXED_NOW = 1_750_000_000_000;

function adapter(handler: Parameters<typeof makeFetch>[0], over?: Record<string, unknown>) {
  const { fn, calls } = makeFetch(handler);
  const a = new MantecaOffRampAdapter({
    apiKey: "test-key-123",
    userId: "user_42",
    bankAccountId: "bank_99",
    baseUrl: "https://api.test.manteca.dev",
    fetchImpl: fn,
    now: () => FIXED_NOW,
    ...over,
  });
  return { a, calls };
}

describe("constructor validation", () => {
  it("throws without apiKey / userId / bankAccountId", () => {
    expect(() => new MantecaOffRampAdapter({ apiKey: "", userId: "u", bankAccountId: "b" })).toThrow(
      /apiKey/,
    );
    expect(
      () => new MantecaOffRampAdapter({ apiKey: "k", userId: "", bankAccountId: "b", fetchImpl: fetch }),
    ).toThrow(/userId/);
    expect(
      () => new MantecaOffRampAdapter({ apiKey: "k", userId: "u", bankAccountId: "", fetchImpl: fetch }),
    ).toThrow(/bankAccountId/);
  });
});

describe("quote()", () => {
  it("GETs /v2/prices/direct/{ticker} with the md-api-key header and parses price", async () => {
    const { a, calls } = adapter(() => ({ body: { price: 1000 } }));
    const q = await a.quote(100);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test.manteca.dev/v2/prices/direct/USDC_ARS");
    expect(calls[0].headers["md-api-key"]).toBe("test-key-123");
    expect(q).toEqual({ amountUsd: 100, arsOut: 100_000, rate: 1000, spread: 0 });
  });

  it("parses a ticker-keyed nested envelope", async () => {
    const { a } = adapter(() => ({ body: { USDC_ARS: { sell: 950, buy: 1100 } } }));
    const q = await a.quote(10);
    expect(q.rate).toBe(950); // prefers the sell side for an off-ramp
  });

  it("prefers sell over buy on a flat spread object", async () => {
    const { a } = adapter(() => ({ body: { sell: 1000, buy: 1100 } }));
    expect((await a.quote(1)).rate).toBe(1000);
  });

  it("honors a custom ticker", async () => {
    const { a, calls } = adapter(() => ({ body: { price: 1 } }), { ticker: "USDT_ARS" });
    await a.quote(1);
    expect(calls[0].url).toContain("/v2/prices/direct/USDT_ARS");
  });

  it("throws MantecaApiError when no price is parseable", async () => {
    const { a } = adapter(() => ({ body: { nonsense: true } }));
    await expect(a.quote(1)).rejects.toBeInstanceOf(MantecaApiError);
  });
});

describe("convert()", () => {
  it("POSTs /v2/synthetics/ramp-off with the exact documented body + idempotency key", async () => {
    const { a, calls } = adapter((url) =>
      url.includes("/prices/direct/")
        ? { body: { price: 1000 } }
        : { status: 201, body: { id: "synth_1", status: "PENDING", stages: [] } },
    );
    const receipt = await a.convert(100, { externalId: "k1" });

    // calls[0] = the internal quote (GET price); calls[1] = the ramp-off POST.
    const post = calls[1];
    expect(post.method).toBe("POST");
    expect(post.url).toBe("https://api.test.manteca.dev/v2/synthetics/ramp-off");
    expect(post.headers["md-api-key"]).toBe("test-key-123");
    expect(post.headers["content-type"]).toBe("application/json");
    expect(post.body).toEqual({
      userId: "user_42",
      sellAmount: "100",
      sellAsset: "USDC",
      withdrawAsset: "ARS",
      bankAccountId: "bank_99",
      externalId: "k1",
    });
    expect(receipt).toEqual({ amountUsd: 100, arsReceived: 100_000, rate: 1000, txId: "synth_1" });
  });

  it("uses a caller-supplied externalId", async () => {
    const { a, calls } = adapter((url) =>
      url.includes("/prices/direct/") ? { body: { price: 1 } } : { body: { id: "s2" } },
    );
    await a.convert(5, { externalId: "my-key" });
    expect((calls[1].body as { externalId: string }).externalId).toBe("my-key");
  });

  it("throws if the synthetic response has no id", async () => {
    const { a } = adapter((url) =>
      url.includes("/prices/direct/") ? { body: { price: 1 } } : { body: { status: "PENDING" } },
    );
    await expect(a.convert(5, { externalId: "k2" })).rejects.toThrow(/no synthetic id/);
  });
});

describe("getStatus()", () => {
  it("GETs the synthetic and normalizes a completed settlement", async () => {
    const { a, calls } = adapter(() => ({ body: { status: "DONE", withdrawAmount: "98000" } }));
    const r = await a.getStatus("synth_1");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test.manteca.dev/v2/synthetics/synth_1");
    expect(r).toEqual({ txId: "synth_1", status: "COMPLETED", raw: "DONE", arsSettled: 98000 });
  });

  it("maps an unrecognized status to UNKNOWN", async () => {
    const { a } = adapter(() => ({ body: { status: "WAT" } }));
    expect((await a.getStatus("x")).status).toBe("UNKNOWN");
  });
});

describe("error mapping", () => {
  it("401 -> MantecaAuthError", async () => {
    const { a } = adapter(() => ({ status: 401, body: { error: "bad key" } }));
    await expect(a.quote(1)).rejects.toBeInstanceOf(MantecaAuthError);
  });
  it("429 -> MantecaRateLimitError carrying the body", async () => {
    const { a } = adapter(() => ({ status: 429, body: { internalStatus: "RATE_LIMITED" } }));
    await a.quote(1).catch((e: MantecaRateLimitError) => {
      expect(e).toBeInstanceOf(MantecaRateLimitError);
      expect(e.status).toBe(429);
      expect(e.body).toEqual({ internalStatus: "RATE_LIMITED" });
    });
    await expect(a.quote(1)).rejects.toBeInstanceOf(MantecaRateLimitError);
  });
  it("500 -> MantecaApiError", async () => {
    const { a } = adapter(() => ({ status: 500, body: { error: "boom" } }));
    await expect(a.quote(1)).rejects.toBeInstanceOf(MantecaApiError);
  });
});

describe("registerBankAccount()", () => {
  it("POSTs add-bank-account and returns the created id", async () => {
    const { a, calls } = adapter(() => ({ body: { id: "bank_new" } }));
    const r = await a.registerBankAccount({ cbuOrCvuOrAlias: "0000003100010000000001" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(
      "https://api.test.manteca.dev/v2/onboarding-actions/add-bank-account",
    );
    expect((calls[0].body as { accountNumber: string }).accountNumber).toBe(
      "0000003100010000000001",
    );
    expect(r.bankAccountId).toBe("bank_new");
  });
});

describe("pure helpers", () => {
  it("parseDirectPrice handles number, string, nested, and missing", () => {
    expect(parseDirectPrice({ price: 1000 }, "USDC_ARS")).toBe(1000);
    expect(parseDirectPrice({ price: "1000.5" }, "USDC_ARS")).toBe(1000.5);
    expect(parseDirectPrice({ USDC_ARS: { sell: 900 } }, "USDC_ARS")).toBe(900);
    expect(parseDirectPrice({ nope: 1 }, "USDC_ARS")).toBeUndefined();
  });
  it("normalizeMantecaStatus maps known + unknown strings", () => {
    expect(normalizeMantecaStatus("COMPLETED")).toBe("COMPLETED");
    expect(normalizeMantecaStatus("in_progress")).toBe("PROCESSING");
    expect(normalizeMantecaStatus("REJECTED")).toBe("FAILED");
    expect(normalizeMantecaStatus("created")).toBe("PENDING");
    expect(normalizeMantecaStatus(undefined)).toBe("UNKNOWN");
  });
});
