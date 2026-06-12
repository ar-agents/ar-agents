/**
 * Unit tests for the x402 seller config + requirement-building behind
 * /api/x402/cuit. The PaymentRequirements we advertise in the 402 body
 * must validate against the @ar-agents/x402 spec schemas, otherwise no
 * x402 client can pay us.
 */

import { describe, expect, it } from "vitest";
import {
  paymentRequirementsSchema,
  paymentRequiredBodySchema,
  paymentRequiredResponse,
} from "@ar-agents/x402";
import {
  buildCuitRequirements,
  CUIT_PRICE_ATOMIC,
  DEFAULT_FACILITATOR_URL,
  readX402Config,
  USDC_BY_NETWORK,
} from "../src/lib/x402";

const RESOURCE = "https://ar-agents.ar/api/x402/cuit";
const PAY_TO = "0x1111111111111111111111111111111111111111";

describe("readX402Config", () => {
  it("returns null when X402_PAYTO_ADDRESS is unset or blank", () => {
    expect(readX402Config({})).toBeNull();
    expect(readX402Config({ X402_PAYTO_ADDRESS: "  " })).toBeNull();
  });

  it("applies defaults for facilitator and network", () => {
    const cfg = readX402Config({ X402_PAYTO_ADDRESS: PAY_TO });
    expect(cfg).toEqual({
      payTo: PAY_TO,
      facilitatorUrl: DEFAULT_FACILITATOR_URL,
      network: "base",
    });
  });

  it("honors explicit overrides and trims whitespace", () => {
    const cfg = readX402Config({
      X402_PAYTO_ADDRESS: ` ${PAY_TO} `,
      X402_FACILITATOR_URL: "https://facilitator.example/x402 ",
      X402_NETWORK: "base-sepolia",
    });
    expect(cfg).toEqual({
      payTo: PAY_TO,
      facilitatorUrl: "https://facilitator.example/x402",
      network: "base-sepolia",
    });
  });
});

describe("buildCuitRequirements", () => {
  const cfg = {
    payTo: PAY_TO,
    facilitatorUrl: DEFAULT_FACILITATOR_URL,
    network: "base",
  };

  it("produces spec-valid PaymentRequirements", () => {
    const req = buildCuitRequirements(RESOURCE, cfg);
    const parsed = paymentRequirementsSchema.safeParse(req);
    expect(parsed.success).toBe(true);
  });

  it("prices at $0.001 USDC (1000 atomic units, string)", () => {
    const req = buildCuitRequirements(RESOURCE, cfg);
    expect(req.maxAmountRequired).toBe(CUIT_PRICE_ATOMIC);
    expect(req.maxAmountRequired).toBe("1000");
    expect(typeof req.maxAmountRequired).toBe("string");
  });

  it("targets Base USDC with the exact scheme + EIP-712 domain extra", () => {
    const req = buildCuitRequirements(RESOURCE, cfg);
    expect(req.scheme).toBe("exact");
    expect(req.network).toBe("base");
    expect(req.asset).toBe(USDC_BY_NETWORK["base"]!.asset);
    expect(req.payTo).toBe(PAY_TO);
    expect(req.resource).toBe(RESOURCE);
    expect(req.extra).toEqual({ name: "USD Coin", version: "2" });
  });

  it("switches asset + extra for base-sepolia", () => {
    const req = buildCuitRequirements(RESOURCE, {
      ...cfg,
      network: "base-sepolia",
    });
    expect(req.asset).toBe(USDC_BY_NETWORK["base-sepolia"]!.asset);
    expect(req.extra).toEqual({ name: "USDC", version: "2" });
    expect(paymentRequirementsSchema.safeParse(req).success).toBe(true);
  });

  it("falls back to Base USDC for an unknown network string", () => {
    const req = buildCuitRequirements(RESOURCE, { ...cfg, network: "weird" });
    expect(req.asset).toBe(USDC_BY_NETWORK["base"]!.asset);
  });
});

describe("402 body round-trip", () => {
  it("paymentRequiredResponse over our requirements is a spec-valid 402", async () => {
    const req = buildCuitRequirements(RESOURCE, {
      payTo: PAY_TO,
      facilitatorUrl: DEFAULT_FACILITATOR_URL,
      network: "base",
    });
    const res = paymentRequiredResponse(req);
    expect(res.status).toBe(402);
    const body = await res.json();
    const parsed = paymentRequiredBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.accepts).toHaveLength(1);
    expect(body.accepts[0].payTo).toBe(PAY_TO);
  });
});
