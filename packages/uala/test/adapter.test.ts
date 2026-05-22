import { describe, it, expect } from "vitest";
import {
  UnconfiguredUalaAdapter,
  UalaApiAdapter,
  UalaUnconfiguredError,
  UalaValidationError,
  UalaApiError,
  UalaAuthError,
  buildAuthorizeUrl,
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
      return new Response(JSON.stringify({ id: "pl_x", status: "open" }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const a = new UalaApiAdapter({ apiKey: "k", fetchImpl });
    await a.createPaymentLink({ amount: 100, idempotencyKey: "key-abc-123" });
    expect(captured).not.toBeNull();
    expect(captured?.get("idempotency-key")).toBe("key-abc-123");
    expect(captured?.get("authorization")).toBe("Bearer k");
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
