import { describe, it, expect } from "vitest";
import { ArAgentsResponseValidationError } from "@ar-agents/core";
import {
  UnconfiguredUalaAdapter,
  UalaApiAdapter,
  InMemoryUalaAdapter,
  UalaUnconfiguredError,
  UalaValidationError,
  UalaApiError,
  UalaAuthError,
  buildAuthorizeUrl,
  refreshAccessToken,
  ualaTools,
  ALL_TOOL_NAMES,
} from "../src/index";

describe("UnconfiguredUalaAdapter (default)", () => {
  const a = new UnconfiguredUalaAdapter();

  it("throws UalaUnconfiguredError on every operation", async () => {
    await expect(
      a.createPaymentLink({ amount: 1000 }),
    ).rejects.toBeInstanceOf(UalaUnconfiguredError);
    await expect(a.getBalance()).rejects.toBeInstanceOf(UalaUnconfiguredError);
    await expect(
      a.createPayout({ amount: 1000, destinationCbu: "0".repeat(22) }),
    ).rejects.toBeInstanceOf(UalaUnconfiguredError);
  });
});

describe("UalaApiAdapter (validation only, no network)", () => {
  const okOpts = { apiKey: "test-key" };

  it("requires apiKey", () => {
    expect(() => new UalaApiAdapter({ apiKey: "" })).toThrow(
      UalaValidationError,
    );
  });

  it("rejects non-positive amount on createPaymentLink", async () => {
    const a = new UalaApiAdapter({
      ...okOpts,
      fetchImpl: () => {
        throw new Error("network must not be called");
      },
    });
    await expect(a.createPaymentLink({ amount: 0 })).rejects.toBeInstanceOf(
      UalaValidationError,
    );
    await expect(a.createPaymentLink({ amount: -5 })).rejects.toBeInstanceOf(
      UalaValidationError,
    );
  });

  it("rejects non-22-digit destinationCbu on createPayout", async () => {
    const a = new UalaApiAdapter({
      ...okOpts,
      fetchImpl: () => {
        throw new Error("network must not be called");
      },
    });
    await expect(
      a.createPayout({ amount: 1000, destinationCbu: "123" }),
    ).rejects.toBeInstanceOf(UalaValidationError);
    await expect(
      a.createPayout({ amount: 1000, destinationCbu: "x".repeat(22) }),
    ).rejects.toBeInstanceOf(UalaValidationError);
  });

  it("rejects non-positive amount on createPayout", async () => {
    const a = new UalaApiAdapter({
      ...okOpts,
      fetchImpl: () => {
        throw new Error("network must not be called");
      },
    });
    await expect(
      a.createPayout({ amount: 0, destinationCbu: "0".repeat(22) }),
    ).rejects.toBeInstanceOf(UalaValidationError);
  });
});

describe("UalaApiAdapter request layer (mock fetch)", () => {
  it("maps 401 to UalaAuthError without leaking body", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const a = new UalaApiAdapter({ apiKey: "k", fetchImpl });
    await expect(a.getBalance()).rejects.toBeInstanceOf(UalaAuthError);
  });

  it("maps non-2xx to UalaApiError with structured body", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ code: "rate_limited" }), {
        status: 429,
      })) as unknown as typeof fetch;
    const a = new UalaApiAdapter({ apiKey: "k", fetchImpl });
    try {
      await a.getBalance();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UalaApiError);
      expect((e as UalaApiError).status).toBe(429);
      expect((e as UalaApiError).details).toEqual({ code: "rate_limited" });
    }
  });

  it("propagates idempotency-key header on POST", async () => {
    let captured: Headers | null = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      captured = new Headers(init.headers);
      return new Response(
        JSON.stringify({
          id: "pl_x",
          amount: 100,
          currency: "ARS",
          status: "open",
          shareUrl: "https://pay.uala.test/links/pl_x",
          createdAt: "2026-05-01T00:00:00.000Z",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const a = new UalaApiAdapter({ apiKey: "k", fetchImpl });
    await a.createPaymentLink({ amount: 100, idempotencyKey: "key-abc-123" });
    expect(captured).not.toBeNull();
    expect(captured?.get("idempotency-key")).toBe("key-abc-123");
    expect(captured?.get("authorization")).toBe("Bearer k");
  });

  it("fails loud on a malformed financial body (missing required fields)", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ currency: "ARS", available: 100 }), {
        status: 200,
      })) as unknown as typeof fetch; // missing `pending` + `asOf`
    const a = new UalaApiAdapter({ apiKey: "k", fetchImpl });
    await expect(a.getBalance()).rejects.toBeInstanceOf(ArAgentsResponseValidationError);
  });

  it("does NOT retry a keyless payout on a transient 5xx (no double-spend)", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("upstream down", { status: 503 });
    }) as unknown as typeof fetch;
    const a = new UalaApiAdapter({ apiKey: "k", fetchImpl });
    await expect(
      a.createPayout({ amount: 1000, destinationCbu: "1".repeat(22) }),
    ).rejects.toBeInstanceOf(UalaApiError);
    expect(calls).toBe(1); // POST without an idempotency key must not be retried
  });

  it("DOES retry a payout that carries an idempotency key", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls < 2
        ? new Response("upstream down", { status: 503 })
        : new Response(
            JSON.stringify({
              id: "po_1",
              amount: 1000,
              currency: "ARS",
              destinationCbu: "1".repeat(22),
              status: "pending",
              createdAt: "2026-05-01T00:00:00.000Z",
            }),
            { status: 200 },
          );
    }) as unknown as typeof fetch;
    const a = new UalaApiAdapter({ apiKey: "k", fetchImpl });
    const p = await a.createPayout({
      amount: 1000,
      destinationCbu: "1".repeat(22),
      idempotencyKey: "safe-key",
    });
    expect(p.status).toBe("pending");
    expect(calls).toBe(2);
  });
});

describe("buildAuthorizeUrl (OAuth pure helper)", () => {
  it("emits a well-formed authorize URL", () => {
    const url = buildAuthorizeUrl({
      clientId: "mp-app",
      redirectUri: "https://app.example.com/cb",
      scope: ["payments.read", "payouts.write"],
      state: "csrf-token-42",
    });
    const u = new URL(url);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("mp-app");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/cb",
    );
    expect(u.searchParams.get("scope")).toBe("payments.read payouts.write");
    expect(u.searchParams.get("state")).toBe("csrf-token-42");
  });
});

describe("InMemoryUalaAdapter", () => {
  it("creates a payment link, then returns the same one by id", async () => {
    const a = new InMemoryUalaAdapter();
    const link = await a.createPaymentLink({ amount: 5000 });
    expect(link.amount).toBe(5000);
    expect(link.currency).toBe("ARS");
    expect(link.status).toBe("open");
    expect(link.shareUrl).toContain(link.id);
    const same = await a.getPaymentLink(link.id);
    expect(same).toEqual(link);
  });

  it("dedupes by idempotency key on createPaymentLink", async () => {
    const a = new InMemoryUalaAdapter();
    const first = await a.createPaymentLink({
      amount: 100,
      idempotencyKey: "abc",
    });
    const second = await a.createPaymentLink({
      amount: 100,
      idempotencyKey: "abc",
    });
    expect(second.id).toBe(first.id);
  });

  it("simulatePayment marks link paid and credits the balance", async () => {
    const a = new InMemoryUalaAdapter();
    const link = await a.createPaymentLink({ amount: 7500, currency: "ARS" });
    const tx = a.simulatePayment(link.id);
    expect(tx.kind).toBe("credit");
    expect(tx.amount).toBe(7500);
    expect(tx.paymentLinkId).toBe(link.id);
    const after = await a.getPaymentLink(link.id);
    expect(after.status).toBe("paid");
    const balance = await a.getBalance("ARS");
    expect(balance.available).toBe(7500);
  });

  it("rejects double-payment via simulatePayment", async () => {
    const a = new InMemoryUalaAdapter();
    const link = await a.createPaymentLink({ amount: 100 });
    a.simulatePayment(link.id);
    expect(() => a.simulatePayment(link.id)).toThrow(UalaValidationError);
  });

  it("cancels an open link but refuses to cancel a paid link", async () => {
    const a = new InMemoryUalaAdapter();
    const open = await a.createPaymentLink({ amount: 100 });
    const cancelled = await a.cancelPaymentLink(open.id);
    expect(cancelled.status).toBe("cancelled");

    const paidLink = await a.createPaymentLink({ amount: 100 });
    a.simulatePayment(paidLink.id);
    await expect(a.cancelPaymentLink(paidLink.id)).rejects.toBeInstanceOf(
      UalaValidationError,
    );
  });

  it("listTransactions paginates with cursor", async () => {
    const a = new InMemoryUalaAdapter();
    for (let i = 0; i < 7; i++) {
      const l = await a.createPaymentLink({ amount: 100 + i });
      a.simulatePayment(l.id);
    }
    const page1 = await a.listTransactions({ limit: 3 });
    expect(page1.transactions.length).toBe(3);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await a.listTransactions({
      limit: 3,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.transactions.length).toBe(3);
    expect(page2.transactions[0]!.id).not.toBe(page1.transactions[0]!.id);
  });

  it("createPayout fails on insufficient balance", async () => {
    const a = new InMemoryUalaAdapter({ initialBalanceArs: 500 });
    await expect(
      a.createPayout({ amount: 1000, destinationCbu: "1".repeat(22) }),
    ).rejects.toBeInstanceOf(UalaApiError);
  });

  it("createPayout debits available and credits pending", async () => {
    const a = new InMemoryUalaAdapter({ initialBalanceArs: 10_000 });
    const p = await a.createPayout({
      amount: 3_500,
      destinationCbu: "1".repeat(22),
    });
    expect(p.status).toBe("pending");
    const bal = await a.getBalance("ARS");
    expect(bal.available).toBe(6_500);
    expect(bal.pending).toBe(3_500);
  });

  it("createPayout dedupes by idempotency key", async () => {
    const a = new InMemoryUalaAdapter({ initialBalanceArs: 10_000 });
    const first = await a.createPayout({
      amount: 1000,
      destinationCbu: "1".repeat(22),
      idempotencyKey: "k",
    });
    const second = await a.createPayout({
      amount: 1000,
      destinationCbu: "1".repeat(22),
      idempotencyKey: "k",
    });
    expect(second.id).toBe(first.id);
    // Should only debit once.
    const bal = await a.getBalance("ARS");
    expect(bal.available).toBe(9_000);
  });

  it("clock + idGenerator hooks make snapshots deterministic", async () => {
    let n = 0;
    const a = new InMemoryUalaAdapter({
      clock: () => "2026-05-01T00:00:00.000Z",
      idGenerator: () => `det_${++n}`,
    });
    const link = await a.createPaymentLink({ amount: 100 });
    expect(link.id).toBe("det_1");
    expect(link.createdAt).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("refreshAccessToken", () => {
  it("emits a fresh OAuthTokenSet on 200", async () => {
    let body = "";
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = init.body as string;
      return new Response(
        JSON.stringify({
          access_token: "new-at",
          refresh_token: "new-rt",
          expires_in: 3600,
          scope: "payments.read payouts.write",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const set = await refreshAccessToken(
      {
        clientId: "c",
        clientSecret: "s",
        refreshToken: "old-rt",
      },
      fetchImpl,
    );
    expect(set.accessToken).toBe("new-at");
    expect(set.refreshToken).toBe("new-rt");
    expect(set.scope).toEqual(["payments.read", "payouts.write"]);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=old-rt");
  });

  it("preserves caller's refresh_token when server omits it", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          access_token: "new-at",
          expires_in: 3600,
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const set = await refreshAccessToken(
      { clientId: "c", clientSecret: "s", refreshToken: "still-valid" },
      fetchImpl,
    );
    expect(set.refreshToken).toBe("still-valid");
  });

  it("maps 401 to UalaAuthError so the caller re-authorizes", async () => {
    const fetchImpl = (async () =>
      new Response("revoked", { status: 401 })) as unknown as typeof fetch;
    await expect(
      refreshAccessToken(
        { clientId: "c", clientSecret: "s", refreshToken: "rt" },
        fetchImpl,
      ),
    ).rejects.toBeInstanceOf(UalaAuthError);
  });

  it("maps non-2xx non-auth to UalaApiError", async () => {
    const fetchImpl = (async () =>
      new Response("boom", { status: 503 })) as unknown as typeof fetch;
    await expect(
      refreshAccessToken(
        { clientId: "c", clientSecret: "s", refreshToken: "rt" },
        fetchImpl,
      ),
    ).rejects.toBeInstanceOf(UalaApiError);
  });
});

describe("ualaTools(adapter) factory", () => {
  it("exposes all 8 tools by default", () => {
    const t = ualaTools();
    expect(Object.keys(t).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("honors `include` filter to expose only the named subset", () => {
    const t = ualaTools({
      include: ["uala_get_balance", "uala_list_transactions"],
    });
    expect(Object.keys(t).sort()).toEqual([
      "uala_get_balance",
      "uala_list_transactions",
    ]);
  });

  it("each tool has a non-empty description (model needs it)", () => {
    const t = ualaTools();
    for (const [name, def] of Object.entries(t)) {
      expect(def.description, `tool ${name} missing description`).toBeTruthy();
      expect(def.description!.length).toBeGreaterThan(40);
    }
  });
});
