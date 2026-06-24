/**
 * RipioOffRampAdapter unit tests. Like Manteca, Ripio B2B keys are sales-gated,
 * so we pin the request contract (OAuth token flow, quote, offrampSession,
 * fiatAccount) against a mocked fetch + cover token caching, the deposit-address
 * (session) model, status normalization, and error mapping.
 */

import { describe, expect, it } from "vitest";
import {
  RipioOffRampAdapter,
  RipioApiError,
  RipioAuthError,
  RipioRateLimitError,
  normalizeRipioStatus,
  RIPIO_SANDBOX,
} from "../src/index";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function makeFetch(handler: (url: string, method: string) => { status?: number; body?: unknown }) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({
      url: String(url),
      method,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body as string | undefined,
    });
    const r = handler(String(url), method);
    return new Response(r.body !== undefined ? JSON.stringify(r.body) : "", { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const TOKEN_OK = { access_token: "tok_abc", token_type: "Bearer", expires_in: 3600 };

function adapter(handler: Parameters<typeof makeFetch>[0]) {
  const { fn, calls } = makeFetch(handler);
  const a = new RipioOffRampAdapter({
    clientId: "cid",
    clientSecret: "csecret",
    customerId: "cust_1",
    fiatAccountId: "fiat_1",
    fetchImpl: fn,
    now: () => 1_750_000_000_000,
  });
  return { a, calls };
}

describe("constructor validation", () => {
  it("requires credentials + customer + fiat account", () => {
    expect(() => new RipioOffRampAdapter({ clientId: "", clientSecret: "x", customerId: "c", fiatAccountId: "f" })).toThrow();
    expect(() => new RipioOffRampAdapter({ clientId: "a", clientSecret: "b", customerId: "", fiatAccountId: "f", fetchImpl: fetch })).toThrow(/customerId/);
  });
  it("defaults to the sandbox base URL", () => {
    expect(RIPIO_SANDBOX).toBe("https://sandbox-b2b.ripio.com");
  });
});

describe("OAuth token", () => {
  it("fetches a Basic-auth client-credentials token, then reuses it (Bearer)", async () => {
    const { a, calls } = adapter((url) => {
      if (url.endsWith("/oauth2/token/")) return { body: TOKEN_OK };
      return { body: { rate: 1000, toAmount: 99000 } };
    });
    await a.quote(100);
    await a.quote(100); // second call should reuse the cached token
    const tokenCalls = calls.filter((c) => c.url.endsWith("/oauth2/token/"));
    expect(tokenCalls).toHaveLength(1); // cached
    expect(tokenCalls[0].method).toBe("POST");
    expect(tokenCalls[0].headers.authorization).toBe("Basic " + btoa("cid:csecret"));
    expect(tokenCalls[0].body).toBe("grant_type=client_credentials");
    const quoteCall = calls.find((c) => c.url.endsWith("/api/v1/quotes/"));
    expect(quoteCall?.headers.authorization).toBe("Bearer tok_abc");
  });

  it("maps a token 401 to RipioAuthError", async () => {
    const { a } = adapter((url) =>
      url.endsWith("/oauth2/token/") ? { status: 401, body: { error: "bad creds" } } : { body: {} },
    );
    await expect(a.quote(1)).rejects.toBeInstanceOf(RipioAuthError);
  });
});

describe("quote()", () => {
  it("POSTs /api/v1/quotes/ with the documented body and parses finalToAmount", async () => {
    const { a, calls } = adapter((url) =>
      url.endsWith("/oauth2/token/")
        ? { body: TOKEN_OK }
        : { body: { quoteId: "q1", rate: 990, toAmount: 99000, finalToAmount: 98500 } },
    );
    const q = await a.quote(100);
    const quoteCall = calls.find((c) => c.url.endsWith("/api/v1/quotes/"));
    expect(quoteCall?.url).toBe(`${RIPIO_SANDBOX}/api/v1/quotes/`);
    expect(JSON.parse(quoteCall!.body!)).toEqual({
      fromCurrency: "USDC",
      toCurrency: "ARS",
      fromAmount: "100",
      chain: "BASE",
      paymentMethodType: "bank_transfer",
    });
    expect(q.arsOut).toBe(98500); // prefers finalToAmount
    expect(q.rate).toBe(990);
  });

  it("throws when no amount is parseable", async () => {
    const { a } = adapter((url) => (url.endsWith("/oauth2/token/") ? { body: TOKEN_OK } : { body: {} }));
    await expect(a.quote(1)).rejects.toBeInstanceOf(RipioApiError);
  });
});

describe("convert() — session model", () => {
  it("creates an offramp session and returns the deposit address for the chain", async () => {
    const { a, calls } = adapter((url) => {
      if (url.endsWith("/oauth2/token/")) return { body: TOKEN_OK };
      if (url.endsWith("/api/v1/quotes/")) return { body: { rate: 1000, finalToAmount: 99000 } };
      return {
        body: {
          sessionId: "sess_9",
          depositAddresses: [
            { chain: "ETHEREUM", address: "0xeth" },
            { chain: "BASE", address: "0xbase" },
          ],
        },
      };
    });
    const r = await a.convert(100);
    const sessionCall = calls.find((c) => c.url.endsWith("/api/v1/offrampSession/"));
    expect(sessionCall?.method).toBe("POST");
    expect(JSON.parse(sessionCall!.body!)).toMatchObject({ fiatAccountId: "fiat_1", chain: "BASE" });
    expect(r.txId).toBe("sess_9");
    expect(r.arsReceived).toBe(99000);
    expect(r.depositAddress).toBe("0xbase"); // picks the BASE address
  });

  it("throws when the session has no id", async () => {
    const { a } = adapter((url) => {
      if (url.endsWith("/oauth2/token/")) return { body: TOKEN_OK };
      if (url.endsWith("/api/v1/quotes/")) return { body: { rate: 1, finalToAmount: 1 } };
      return { body: { depositAddresses: [] } };
    });
    await expect(a.convert(1)).rejects.toThrow(/no session id/);
  });
});

describe("getStatus()", () => {
  it("GETs the session and normalizes status + settled amount", async () => {
    const { a, calls } = adapter((url) =>
      url.endsWith("/oauth2/token/")
        ? { body: TOKEN_OK }
        : { body: { status: "PAID", finalToAmount: 98000 } },
    );
    const r = await a.getStatus("sess_9");
    expect(calls.find((c) => c.url.includes("/api/v1/offrampSession/sess_9"))?.method).toBe("GET");
    expect(r).toEqual({ txId: "sess_9", status: "COMPLETED", raw: "PAID", arsSettled: 98000 });
  });
});

describe("registerFiatAccount()", () => {
  it("POSTs /api/v1/fiatAccounts/ with the CVU and returns the id", async () => {
    const { a, calls } = adapter((url) =>
      url.endsWith("/oauth2/token/") ? { body: TOKEN_OK } : { body: { id: "fiat_new", status: "ENABLED" } },
    );
    const r = await a.registerFiatAccount({ cbuOrCvuOrAlias: "miempresa.cvu" });
    const call = calls.find((c) => c.url.endsWith("/api/v1/fiatAccounts/"));
    expect(JSON.parse(call!.body!)).toEqual({
      customerId: "cust_1",
      paymentMethodType: "bank_transfer",
      accountFields: { alias_or_cvu_destination: "miempresa.cvu" },
    });
    expect(r.fiatAccountId).toBe("fiat_new");
  });
});

describe("error mapping + status helper", () => {
  it("429 -> RipioRateLimitError", async () => {
    const { a } = adapter((url) =>
      url.endsWith("/oauth2/token/") ? { body: TOKEN_OK } : { status: 429, body: {} },
    );
    await expect(a.quote(1)).rejects.toBeInstanceOf(RipioRateLimitError);
  });
  it("normalizeRipioStatus buckets", () => {
    expect(normalizeRipioStatus("PAID")).toBe("COMPLETED");
    expect(normalizeRipioStatus("awaiting_deposit")).toBe("PENDING");
    expect(normalizeRipioStatus("EXPIRED")).toBe("FAILED");
    expect(normalizeRipioStatus("confirming")).toBe("PROCESSING");
    expect(normalizeRipioStatus("???")).toBe("UNKNOWN");
  });
});
