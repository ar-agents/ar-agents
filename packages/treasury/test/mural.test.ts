/**
 * MuralOffRampAdapter tests. Pin the request contract against the documented v1
 * wire (OpenAPI spec, jun-2026) with mocked HTTP: quote (token-to-fiat fees),
 * convert (create payout -> execute, with the ARS fiatAndRailDetails + the
 * transfer-api-key on execute), getStatus normalization, and error mapping.
 */

import { describe, expect, it } from "vitest";
import {
  MuralOffRampAdapter,
  MuralApiError,
  MuralAuthError,
  MuralRateLimitError,
  normalizeMuralStatus,
  MURAL_SANDBOX,
  type MuralConfig,
} from "../src/mural";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A mock fetch that routes canned responses by URL/method and records calls. */
function mockFetch(routes: Array<{ match: RegExp; method?: string; status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    calls.push({
      url: String(url),
      method,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const route = routes.find((r) => r.match.test(String(url)) && (!r.method || r.method === method));
    if (!route) return new Response("no route", { status: 404 });
    return new Response(JSON.stringify(route.json), { status: route.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const baseConfig = (fetchImpl: typeof fetch): MuralConfig => ({
  apiKey: "key_123",
  transferApiKey: "transfer_456",
  organizationId: "org_789",
  sourceAccountId: "acct_abc",
  bankName: "Banco Nación",
  bankAccountOwner: "Sociedad Automatizada SA",
  cvu: "0000003100010000000001",
  documentNumber: "20123456786",
  recipient: { type: "business", name: "Sociedad Automatizada SA", physicalAddress: { country: "AR" } },
  baseUrl: MURAL_SANDBOX,
  fetchImpl,
});

const FEES_OK = [
  {
    type: "success",
    exchangeRate: 1180,
    exchangeFeePercentage: 0.01,
    fiatAndRailCode: "ars",
    estimatedFiatAmount: { fiatAmount: 117_820, fiatCurrencyCode: "ARS" },
    transactionFee: { tokenAmount: 0.5, tokenSymbol: "USDC" },
    tokenAmount: { tokenAmount: 100, tokenSymbol: "USDC" },
    feeTotal: { tokenAmount: 1.5, tokenSymbol: "USDC" },
  },
];

describe("MuralOffRampAdapter.quote", () => {
  it("POSTs token-to-fiat with the ars rail + parses the estimate", async () => {
    const { impl, calls } = mockFetch([{ match: /fees\/token-to-fiat/, json: FEES_OK }]);
    const q = await new MuralOffRampAdapter(baseConfig(impl)).quote(100);
    expect(q).toEqual({ amountUsd: 100, arsOut: 117_820, rate: 1180, spread: 0.01 });
    expect(calls[0].url).toBe(`${MURAL_SANDBOX}/api/payouts/fees/token-to-fiat`);
    expect(calls[0].body).toEqual({
      tokenFeeRequests: [{ amount: { tokenAmount: 100, tokenSymbol: "USDC" }, fiatAndRailCode: "ars" }],
    });
    expect(calls[0].headers.authorization).toBe("Bearer key_123");
    expect(calls[0].headers["on-behalf-of"]).toBe("org_789");
  });

  it("throws when the fees endpoint returns a type:error result", async () => {
    const { impl } = mockFetch([
      { match: /fees\/token-to-fiat/, json: [{ type: "error", message: "below minimum", fiatAndRailCode: "ars" }] },
    ]);
    await expect(new MuralOffRampAdapter(baseConfig(impl)).quote(0.01)).rejects.toThrow(/below minimum/);
  });
});

describe("MuralOffRampAdapter.convert", () => {
  it("creates the ARS payout then executes it with the transfer-api-key", async () => {
    const { impl, calls } = mockFetch([
      { match: /fees\/token-to-fiat/, json: FEES_OK },
      { match: /\/payouts\/payout$/, method: "POST", json: { id: "pr_001", status: "AWAITING_EXECUTION" } },
      { match: /\/payouts\/payout\/pr_001\/execute/, json: { id: "pr_001", status: "PENDING" } },
    ]);
    const receipt = await new MuralOffRampAdapter(baseConfig(impl)).convert(100, { externalId: "ext-1" });
    expect(receipt).toEqual({ amountUsd: 100, arsReceived: 117_820, rate: 1180, txId: "pr_001" });

    const create = calls.find((c) => /\/payouts\/payout$/.test(c.url));
    const body = create!.body as any;
    expect(body.sourceAccountId).toBe("acct_abc");
    expect(body.memo).toBe("ext-1");
    expect(body.payouts[0].amount).toEqual({ tokenAmount: 100, tokenSymbol: "USDC" });
    expect(body.payouts[0].payoutDetails.fiatAndRailDetails).toEqual({
      type: "ars",
      symbol: "ARS",
      bankAccountNumber: "0000003100010000000001",
      documentNumber: "20123456786",
      bankAccountNumberType: "CVU",
    });
    expect(body.payouts[0].recipientInfo).toMatchObject({ type: "business", name: "Sociedad Automatizada SA" });

    const exec = calls.find((c) => /\/execute/.test(c.url));
    expect(exec!.headers["transfer-api-key"]).toBe("transfer_456");
    expect(exec!.method).toBe("POST");
  });
});

describe("MuralOffRampAdapter.getStatus", () => {
  it("maps a completed fiat payout to COMPLETED + arsSettled", async () => {
    const { impl } = mockFetch([
      {
        match: /\/payouts\/payout\/pr_001$/,
        json: {
          status: "EXECUTED",
          payouts: [
            {
              details: {
                type: "fiat",
                fiatPayoutStatus: { type: "completed", completedAt: "x" },
                fiatAmount: { fiatAmount: 117_500, fiatCurrencyCode: "ARS" },
              },
            },
          ],
        },
      },
    ]);
    const r = await new MuralOffRampAdapter(baseConfig(impl)).getStatus("pr_001");
    expect(r.status).toBe("COMPLETED");
    expect(r.arsSettled).toBe(117_500);
    expect(r.raw).toBe("completed");
  });

  it("maps EXECUTED-but-fiat-pending to PROCESSING (funds not guaranteed yet)", async () => {
    const { impl } = mockFetch([
      {
        match: /\/payouts\/payout\/pr_002$/,
        json: { status: "EXECUTED", payouts: [{ details: { fiatPayoutStatus: { type: "pending" } } }] },
      },
    ]);
    const r = await new MuralOffRampAdapter(baseConfig(impl)).getStatus("pr_002");
    expect(r.status).toBe("PROCESSING");
    expect(r.arsSettled).toBeUndefined();
  });
});

describe("normalizeMuralStatus", () => {
  it("prefers the fiat leg, falls back to the request status", () => {
    expect(normalizeMuralStatus("EXECUTED", "completed")).toBe("COMPLETED");
    expect(normalizeMuralStatus("EXECUTED", "failed")).toBe("FAILED");
    expect(normalizeMuralStatus("EXECUTED", "on-hold")).toBe("PROCESSING");
    expect(normalizeMuralStatus("EXECUTED", "created")).toBe("PENDING");
    expect(normalizeMuralStatus("EXECUTED", undefined)).toBe("PROCESSING");
    expect(normalizeMuralStatus("AWAITING_EXECUTION", undefined)).toBe("PENDING");
    expect(normalizeMuralStatus("FAILED", undefined)).toBe("FAILED");
    expect(normalizeMuralStatus("WAT", undefined)).toBe("UNKNOWN");
  });
});

describe("MuralOffRampAdapter errors + validation", () => {
  it("maps 401 -> MuralAuthError and 429 -> MuralRateLimitError", async () => {
    const auth = mockFetch([{ match: /fees/, status: 401, json: { message: "unauthorized" } }]);
    await expect(new MuralOffRampAdapter(baseConfig(auth.impl)).quote(100)).rejects.toBeInstanceOf(MuralAuthError);
    const rl = mockFetch([{ match: /fees/, status: 429, json: { message: "slow down" } }]);
    await expect(new MuralOffRampAdapter(baseConfig(rl.impl)).quote(100)).rejects.toBeInstanceOf(MuralRateLimitError);
  });

  it("requires the critical config fields", () => {
    const ok = baseConfig((async () => new Response("{}")) as unknown as typeof fetch);
    expect(() => new MuralOffRampAdapter({ ...ok, apiKey: "" })).toThrow(/apiKey/);
    expect(() => new MuralOffRampAdapter({ ...ok, transferApiKey: "" })).toThrow(/transferApiKey/);
    expect(() => new MuralOffRampAdapter({ ...ok, cvu: "" })).toThrow(/cvu/);
  });

  it("is a MuralApiError on a generic non-2xx", async () => {
    const { impl } = mockFetch([{ match: /fees/, status: 500, json: { message: "boom" } }]);
    await expect(new MuralOffRampAdapter(baseConfig(impl)).quote(100)).rejects.toBeInstanceOf(MuralApiError);
  });
});
