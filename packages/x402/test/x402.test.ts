import { describe, it, expect, vi } from "vitest";
import {
  x402Fetch,
  probePaymentRequirements,
  decodeSettlementHeader,
  encodePaymentHeader,
  FacilitatorClient,
  paymentRequiredResponse,
  extractPaymentPayload,
  verifyPayment,
  settleAndRespond,
  withSettlementHeader,
  x402Tools,
  ALL_TOOL_NAMES,
  X402UnconfiguredError,
  X402ProtocolError,
  X402FacilitatorError,
  X402PaymentRejectedError,
  encodeBase64Json,
  decodeBase64Json,
  paymentRequirementsSchema,
  paymentRequiredBodySchema,
  paymentPayloadSchema,
  settlementResponseSchema,
  verifyResponseSchema,
  X402_VERSION,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  type PaymentRequirements,
  type PaymentPayload,
  type SettlementResponse,
} from "../src/index";

// ── Fixtures (straight from the spec examples) ──────────────────────

const REQUIREMENTS: PaymentRequirements = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "10000",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
  resource: "https://api.example.com/premium-data",
  description: "Access to premium market data",
  mimeType: "application/json",
  maxTimeoutSeconds: 60,
  extra: { name: "USDC", version: "2" },
};

const PAYMENT_PAYLOAD: PaymentPayload = {
  x402Version: 1,
  scheme: "exact",
  network: "base-sepolia",
  payload: {
    signature: "0xabc",
    authorization: {
      from: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
      to: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      value: "10000",
      validAfter: "1740672089",
      validBefore: "1740672154",
      nonce: "0xf374",
    },
  },
};

const SETTLEMENT: SettlementResponse = {
  success: true,
  transaction: "0x1234",
  network: "base-sepolia",
  payer: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
};

function body402(accepts: PaymentRequirements[] = [REQUIREMENTS]) {
  return {
    x402Version: 1,
    error: "X-PAYMENT header is required",
    accepts,
  };
}

function res402(): Response {
  return new Response(JSON.stringify(body402()), {
    status: 402,
    headers: { "content-type": "application/json" },
  });
}

function res200WithSettlement(): Response {
  return new Response(JSON.stringify({ data: "premium" }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      [X_PAYMENT_RESPONSE_HEADER]: encodeBase64Json(SETTLEMENT),
    },
  });
}

const signer = vi.fn(async () => PAYMENT_PAYLOAD);

// ── encoding ────────────────────────────────────────────────────────

describe("base64 JSON encoding", () => {
  it("round-trips ASCII payloads", () => {
    expect(decodeBase64Json(encodeBase64Json(PAYMENT_PAYLOAD))).toEqual(
      PAYMENT_PAYLOAD,
    );
  });

  it("round-trips non-ASCII (UTF-8) payloads", () => {
    const value = { description: "categoría ñandú 💸" };
    expect(decodeBase64Json(encodeBase64Json(value))).toEqual(value);
  });

  it("matches the spec's example X-PAYMENT header encoding", () => {
    // First chars of base64 of `{"x402Version":1,...}` per the HTTP transport spec.
    expect(encodePaymentHeader(PAYMENT_PAYLOAD).startsWith("eyJ4NDAyVmVyc2lvbiI6MS")).toBe(true);
  });
});

// ── zod schemas ─────────────────────────────────────────────────────

describe("zod schemas", () => {
  it("paymentRequirementsSchema accepts the spec example", () => {
    expect(paymentRequirementsSchema.parse(REQUIREMENTS)).toEqual(REQUIREMENTS);
  });

  it("paymentRequirementsSchema normalizes null outputSchema to undefined", () => {
    const parsed = paymentRequirementsSchema.parse({
      ...REQUIREMENTS,
      outputSchema: null,
    });
    expect(parsed.outputSchema).toBeUndefined();
  });

  it("paymentRequirementsSchema rejects missing payTo", () => {
    const { payTo: _omit, ...rest } = REQUIREMENTS;
    expect(paymentRequirementsSchema.safeParse(rest).success).toBe(false);
  });

  it("paymentRequiredBodySchema accepts the spec 402 body", () => {
    expect(paymentRequiredBodySchema.parse(body402()).accepts).toHaveLength(1);
  });

  it("paymentPayloadSchema round-trips the spec example", () => {
    expect(paymentPayloadSchema.parse(PAYMENT_PAYLOAD)).toEqual(PAYMENT_PAYLOAD);
  });

  it("settlementResponseSchema accepts success and failure shapes", () => {
    expect(settlementResponseSchema.parse(SETTLEMENT).success).toBe(true);
    const failed = settlementResponseSchema.parse({
      success: false,
      errorReason: "insufficient_funds",
      transaction: "",
      network: "base-sepolia",
      payer: "0x857b",
    });
    expect(failed.errorReason).toBe("insufficient_funds");
  });

  it("verifyResponseSchema accepts both spec examples", () => {
    expect(verifyResponseSchema.parse({ isValid: true, payer: "0x1" }).isValid).toBe(true);
    expect(
      verifyResponseSchema.parse({
        isValid: false,
        invalidReason: "insufficient_funds",
        payer: "0x1",
      }).invalidReason,
    ).toBe("insufficient_funds");
  });
});

// ── x402Fetch (buyer) ───────────────────────────────────────────────

describe("x402Fetch", () => {
  it("passes through non-402 responses without paying", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const result = await x402Fetch("https://a.example/", {}, { fetch: fetchImpl });
    expect(result.paid).toBe(false);
    expect(result.response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("performs the full 402 -> sign -> retry -> settlement flow", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res402())
      .mockResolvedValueOnce(res200WithSettlement());
    const result = await x402Fetch("https://a.example/", {}, { fetch: fetchImpl, signer });
    expect(result.paid).toBe(true);
    expect(result.requirements).toEqual(REQUIREMENTS);
    expect(result.settlement).toEqual(SETTLEMENT);
    // Retry carried the X-PAYMENT header with the base64 payload.
    const retryInit = fetchImpl.mock.calls[1]![1] as RequestInit;
    const header = new Headers(retryInit.headers).get(X_PAYMENT_HEADER);
    expect(decodeBase64Json(header!)).toEqual(PAYMENT_PAYLOAD);
  });

  it("throws X402UnconfiguredError on 402 without a signer", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res402());
    await expect(
      x402Fetch("https://a.example/", {}, { fetch: fetchImpl }),
    ).rejects.toBeInstanceOf(X402UnconfiguredError);
  });

  it("throws X402ProtocolError on a malformed 402 body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ nope: true }), { status: 402 }));
    await expect(
      x402Fetch("https://a.example/", {}, { fetch: fetchImpl, signer }),
    ).rejects.toBeInstanceOf(X402ProtocolError);
  });

  it("respects the onPayment gate (declined => X402PaymentRejectedError, no signing)", async () => {
    const localSigner = vi.fn(async () => PAYMENT_PAYLOAD);
    const fetchImpl = vi.fn().mockResolvedValueOnce(res402());
    await expect(
      x402Fetch(
        "https://a.example/",
        {},
        { fetch: fetchImpl, signer: localSigner, onPayment: async () => false },
      ),
    ).rejects.toBeInstanceOf(X402PaymentRejectedError);
    expect(localSigner).not.toHaveBeenCalled();
  });

  it("throws X402PaymentRejectedError when selectRequirements refuses all", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res402());
    await expect(
      x402Fetch(
        "https://a.example/",
        {},
        { fetch: fetchImpl, signer, selectRequirements: () => undefined },
      ),
    ).rejects.toBeInstanceOf(X402PaymentRejectedError);
  });

  it("throws X402PaymentRejectedError when the retry still returns 402", async () => {
    const failedSettlement: SettlementResponse = {
      success: false,
      errorReason: "insufficient_funds",
      transaction: "",
      network: "base-sepolia",
      payer: "0x857b",
    };
    const second = new Response(JSON.stringify(body402()), {
      status: 402,
      headers: { [X_PAYMENT_RESPONSE_HEADER]: encodeBase64Json(failedSettlement) },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res402())
      .mockResolvedValueOnce(second);
    await expect(
      x402Fetch("https://a.example/", {}, { fetch: fetchImpl, signer }),
    ).rejects.toThrow(/insufficient_funds/);
  });

  it("preserves caller headers on the paid retry", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res402())
      .mockResolvedValueOnce(res200WithSettlement());
    await x402Fetch(
      "https://a.example/",
      { headers: { authorization: "Bearer t" } },
      { fetch: fetchImpl, signer },
    );
    const retryHeaders = new Headers((fetchImpl.mock.calls[1]![1] as RequestInit).headers);
    expect(retryHeaders.get("authorization")).toBe("Bearer t");
    expect(retryHeaders.get(X_PAYMENT_HEADER)).toBeTruthy();
  });
});

describe("probePaymentRequirements", () => {
  it("returns null for non-402 resources", async () => {
    const fetchImpl = vi.fn(async () => new Response("free", { status: 200 }));
    expect(await probePaymentRequirements("https://a.example/", {}, fetchImpl)).toBeNull();
  });

  it("returns the parsed 402 body without paying", async () => {
    const fetchImpl = vi.fn(async () => res402());
    const parsed = await probePaymentRequirements("https://a.example/", {}, fetchImpl);
    expect(parsed?.accepts[0]?.maxAmountRequired).toBe("10000");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("decodeSettlementHeader", () => {
  it("returns undefined when the header is absent", () => {
    expect(decodeSettlementHeader(new Response("x"))).toBeUndefined();
  });

  it("throws X402ProtocolError on invalid base64", () => {
    const res = new Response("x", {
      headers: { [X_PAYMENT_RESPONSE_HEADER]: "$$$not-base64$$$" },
    });
    expect(() => decodeSettlementHeader(res)).toThrow(X402ProtocolError);
  });
});

// ── FacilitatorClient ───────────────────────────────────────────────

describe("FacilitatorClient", () => {
  it("verify() POSTs the spec request shape to /verify", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ isValid: true, payer: "0x857b" }), { status: 200 }),
    );
    const fc = new FacilitatorClient({ baseUrl: "https://f.example/", fetch: fetchImpl });
    const out = await fc.verify(PAYMENT_PAYLOAD, REQUIREMENTS);
    expect(out.isValid).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://f.example/verify");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      x402Version: X402_VERSION,
      paymentPayload: PAYMENT_PAYLOAD,
      paymentRequirements: REQUIREMENTS,
    });
  });

  it("settle() parses the spec success response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(SETTLEMENT), { status: 200 }),
    );
    const fc = new FacilitatorClient({ baseUrl: "https://f.example", fetch: fetchImpl });
    expect((await fc.settle(PAYMENT_PAYLOAD, REQUIREMENTS)).transaction).toBe("0x1234");
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://f.example/settle");
  });

  it("throws X402FacilitatorError on non-2xx", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );
    const fc = new FacilitatorClient({ baseUrl: "https://f.example", fetch: fetchImpl });
    await expect(fc.verify(PAYMENT_PAYLOAD, REQUIREMENTS)).rejects.toBeInstanceOf(
      X402FacilitatorError,
    );
  });

  it("throws X402ProtocolError on schema-invalid facilitator responses", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ weird: 1 }), { status: 200 }),
    );
    const fc = new FacilitatorClient({ baseUrl: "https://f.example", fetch: fetchImpl });
    await expect(fc.verify(PAYMENT_PAYLOAD, REQUIREMENTS)).rejects.toBeInstanceOf(
      X402ProtocolError,
    );
  });

  it("supported() parses the kinds list", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ kinds: [{ x402Version: 1, scheme: "exact", network: "base" }] }),
        { status: 200 },
      ),
    );
    const fc = new FacilitatorClient({ baseUrl: "https://f.example", fetch: fetchImpl });
    expect((await fc.supported()).kinds[0]?.network).toBe("base");
  });
});

// ── Server helpers (seller) ─────────────────────────────────────────

describe("server helpers", () => {
  it("paymentRequiredResponse builds a spec-shaped 402", async () => {
    const res = paymentRequiredResponse(REQUIREMENTS);
    expect(res.status).toBe(402);
    const body = paymentRequiredBodySchema.parse(await res.json());
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toEqual([REQUIREMENTS]);
    expect(body.error).toContain(X_PAYMENT_HEADER);
  });

  it("extractPaymentPayload decodes a valid X-PAYMENT header", () => {
    const req = new Request("https://a.example/", {
      headers: { [X_PAYMENT_HEADER]: encodeBase64Json(PAYMENT_PAYLOAD) },
    });
    const out = extractPaymentPayload(req);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.payload).toEqual(PAYMENT_PAYLOAD);
  });

  it("extractPaymentPayload reports missing and malformed headers", () => {
    expect(extractPaymentPayload(new Request("https://a.example/")).ok).toBe(false);
    const bad = new Request("https://a.example/", {
      headers: { [X_PAYMENT_HEADER]: encodeBase64Json({ nope: 1 }) },
    });
    const out = extractPaymentPayload(bad);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("PaymentPayload");
  });

  it("verifyPayment returns verified=true for a facilitator-valid payment", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ isValid: true, payer: "0x857b" }), { status: 200 }),
    );
    const fc = new FacilitatorClient({ baseUrl: "https://f.example", fetch: fetchImpl });
    const req = new Request("https://a.example/", {
      headers: { [X_PAYMENT_HEADER]: encodeBase64Json(PAYMENT_PAYLOAD) },
    });
    const out = await verifyPayment(req, REQUIREMENTS, fc);
    expect(out.verified).toBe(true);
    if (out.verified) expect(out.verify.payer).toBe("0x857b");
  });

  it("verifyPayment returns a ready 402 Response when the header is missing", async () => {
    const fc = new FacilitatorClient({ baseUrl: "https://f.example", fetch: vi.fn() });
    const out = await verifyPayment(new Request("https://a.example/"), REQUIREMENTS, fc);
    expect(out.verified).toBe(false);
    if (!out.verified) {
      expect(out.response.status).toBe(402);
      const body = paymentRequiredBodySchema.parse(await out.response.json());
      expect(body.accepts).toEqual([REQUIREMENTS]);
    }
  });

  it("verifyPayment returns a 402 with invalidReason when facilitator rejects", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ isValid: false, invalidReason: "insufficient_funds" }), {
        status: 200,
      }),
    );
    const fc = new FacilitatorClient({ baseUrl: "https://f.example", fetch: fetchImpl });
    const req = new Request("https://a.example/", {
      headers: { [X_PAYMENT_HEADER]: encodeBase64Json(PAYMENT_PAYLOAD) },
    });
    const out = await verifyPayment(req, REQUIREMENTS, fc);
    expect(out.verified).toBe(false);
    if (!out.verified) expect(out.reason).toBe("insufficient_funds");
  });

  it("withSettlementHeader attaches a decodable X-PAYMENT-RESPONSE", () => {
    const res = withSettlementHeader(new Response("ok"), SETTLEMENT);
    expect(decodeSettlementHeader(res)).toEqual(SETTLEMENT);
  });

  it("settleAndRespond returns the success response with X-PAYMENT-RESPONSE", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(SETTLEMENT), { status: 200 }),
    );
    const fc = new FacilitatorClient({ baseUrl: "https://f.example", fetch: fetchImpl });
    const res = await settleAndRespond(
      PAYMENT_PAYLOAD,
      REQUIREMENTS,
      fc,
      new Response(JSON.stringify({ data: "paid content" }), { status: 200 }),
    );
    expect(res.status).toBe(200);
    expect(decodeSettlementHeader(res)?.transaction).toBe("0x1234");
    expect(await res.json()).toEqual({ data: "paid content" });
  });

  it("settleAndRespond maps failed settlement to a 402 (per HTTP transport spec)", async () => {
    const failed = {
      success: false,
      errorReason: "insufficient_funds",
      transaction: "",
      network: "base-sepolia",
      payer: "0x857b",
    };
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(failed), { status: 200 }),
    );
    const fc = new FacilitatorClient({ baseUrl: "https://f.example", fetch: fetchImpl });
    const res = await settleAndRespond(
      PAYMENT_PAYLOAD,
      REQUIREMENTS,
      fc,
      new Response("never sent", { status: 200 }),
    );
    expect(res.status).toBe(402);
    expect(decodeSettlementHeader(res)?.errorReason).toBe("insufficient_funds");
  });
});

// ── AI SDK tools ────────────────────────────────────────────────────

type AnyTool = { execute: (input: never, opts?: unknown) => Promise<unknown> };
const exec = (t: unknown, input: unknown) =>
  (t as AnyTool).execute(input as never, { toolCallId: "t", messages: [] });

describe("x402Tools", () => {
  it("exposes all three tools by default and respects include", () => {
    expect(Object.keys(x402Tools())).toEqual([...ALL_TOOL_NAMES]);
    expect(Object.keys(x402Tools({ include: ["x402_get_payment_requirements"] }))).toEqual([
      "x402_get_payment_requirements",
    ]);
  });

  it("x402_get_payment_requirements returns parsed requirements for a 402 resource", async () => {
    const tools = x402Tools({ fetch: vi.fn(async () => res402()) });
    const out = (await exec(tools.x402_get_payment_requirements, {
      url: "https://a.example/",
    })) as { ok: boolean; paymentRequired: boolean; accepts: PaymentRequirements[] };
    expect(out.ok).toBe(true);
    expect(out.paymentRequired).toBe(true);
    expect(out.accepts[0]?.payTo).toBe(REQUIREMENTS.payTo);
  });

  it("x402_get_payment_requirements reports free resources", async () => {
    const tools = x402Tools({ fetch: vi.fn(async () => new Response("free")) });
    const out = (await exec(tools.x402_get_payment_requirements, {
      url: "https://a.example/",
    })) as { paymentRequired: boolean };
    expect(out.paymentRequired).toBe(false);
  });

  it("x402_get_payment_requirements returns a structured error on malformed 402", async () => {
    const tools = x402Tools({
      fetch: vi.fn(async () => new Response("not json", { status: 402 })),
    });
    const out = (await exec(tools.x402_get_payment_requirements, {
      url: "https://a.example/",
    })) as { ok: boolean; code: string };
    expect(out.ok).toBe(false);
    expect(out.code).toBe("protocol");
  });

  it("x402_paid_fetch without a signer returns structured unconfigured (never throws)", async () => {
    const tools = x402Tools({ fetch: vi.fn(async () => res402()) });
    const out = (await exec(tools.x402_paid_fetch, { url: "https://a.example/" })) as {
      ok: boolean;
      code: string;
      reason: string;
    };
    expect(out.ok).toBe(false);
    expect(out.code).toBe("unconfigured");
    expect(out.reason).toContain("signer");
  });

  it("x402_paid_fetch performs the full flow and returns body + settlement", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res402())
      .mockResolvedValueOnce(res200WithSettlement());
    const tools = x402Tools({ signer, fetch: fetchImpl });
    const out = (await exec(tools.x402_paid_fetch, { url: "https://a.example/" })) as {
      ok: boolean;
      paid: boolean;
      body: string;
      settlement: SettlementResponse;
    };
    expect(out.ok).toBe(true);
    expect(out.paid).toBe(true);
    expect(JSON.parse(out.body)).toEqual({ data: "premium" });
    expect(out.settlement.transaction).toBe("0x1234");
  });

  it("x402_paid_fetch HITL gate declines like mercadopago's pattern", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res402());
    const tools = x402Tools({ signer, fetch: fetchImpl, onPayment: async () => false });
    const out = (await exec(tools.x402_paid_fetch, { url: "https://a.example/" })) as {
      ok: boolean;
      reason: string;
    };
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("Confirmation declined");
  });

  it("x402_paid_fetch HITL gate approves and pays", async () => {
    const gate = vi.fn(async (req: PaymentRequirements) => req.maxAmountRequired === "10000");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res402())
      .mockResolvedValueOnce(res200WithSettlement());
    const tools = x402Tools({ signer, fetch: fetchImpl, onPayment: gate });
    const out = (await exec(tools.x402_paid_fetch, { url: "https://a.example/" })) as {
      ok: boolean;
    };
    expect(out.ok).toBe(true);
    expect(gate).toHaveBeenCalledWith(REQUIREMENTS);
  });

  it("x402_paid_fetch passes through free resources (paid=false)", async () => {
    const tools = x402Tools({ signer, fetch: vi.fn(async () => new Response("free")) });
    const out = (await exec(tools.x402_paid_fetch, { url: "https://a.example/" })) as {
      ok: boolean;
      paid: boolean;
      body: string;
    };
    expect(out.ok).toBe(true);
    expect(out.paid).toBe(false);
    expect(out.body).toBe("free");
  });

  it("x402_verify_payment without a facilitator returns structured unconfigured", async () => {
    const tools = x402Tools();
    const out = (await exec(tools.x402_verify_payment, {
      paymentPayload: PAYMENT_PAYLOAD,
      paymentRequirements: REQUIREMENTS,
    })) as { ok: boolean; code: string };
    expect(out.ok).toBe(false);
    expect(out.code).toBe("unconfigured");
  });

  it("x402_verify_payment calls the facilitator and returns the verdict", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ isValid: false, invalidReason: "invalid_scheme" }), {
        status: 200,
      }),
    );
    const tools = x402Tools({
      facilitator: new FacilitatorClient({ baseUrl: "https://f.example", fetch: fetchImpl }),
    });
    const out = (await exec(tools.x402_verify_payment, {
      paymentPayload: PAYMENT_PAYLOAD,
      paymentRequirements: REQUIREMENTS,
    })) as { ok: boolean; isValid: boolean; invalidReason: string };
    expect(out.ok).toBe(true);
    expect(out.isValid).toBe(false);
    expect(out.invalidReason).toBe("invalid_scheme");
  });

  it("x402_verify_payment returns structured error on facilitator failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("oops", { status: 503 }));
    const tools = x402Tools({
      facilitator: new FacilitatorClient({ baseUrl: "https://f.example", fetch: fetchImpl }),
    });
    const out = (await exec(tools.x402_verify_payment, {
      paymentPayload: PAYMENT_PAYLOAD,
      paymentRequirements: REQUIREMENTS,
    })) as { ok: boolean; code: string };
    expect(out.ok).toBe(false);
    expect(out.code).toBe("facilitator_error");
  });
});
