/**
 * Unit tests for the Vercel AI SDK 6 tool wrappers. The five pure tools always
 * work; the three off-ramp tools degrade to {available:false} without an adapter
 * and call through when one is injected (InMemoryOffRampAdapter here).
 */

import { describe, expect, it } from "vitest";
import { treasuryTools } from "../src/tools";
import { InMemoryOffRampAdapter } from "../src/index";

interface ToolLike {
  execute: (input: unknown, ctx: { toolCallId: string; messages: unknown[] }) => Promise<unknown>;
}
const ctx = { toolCallId: "test", messages: [] };
const call = (tools: Record<string, unknown>, name: string, input: unknown) =>
  (tools[name] as ToolLike).execute(input, ctx);

const FIXED_NOW = 1_750_000_000_000;
const DAY = 86_400_000;

describe("pure tools", () => {
  const tools = treasuryTools({ now: () => FIXED_NOW });

  it("treasury_tax_estimate computes cedular on the gain", async () => {
    const r = (await call(tools, "treasury_tax_estimate", {
      amountUsd: 1000,
      costBasisPerUsd: 0.5,
      fxRate: 1000,
      denom: "ARS",
    })) as { taxArs: number; gainArs: number; ratePct: number };
    expect(r.gainArs).toBe(500_000);
    expect(r.taxArs).toBe(25_000);
    expect(r.ratePct).toBe(5);
  });

  it("treasury_monotributo by category and by income", async () => {
    const byCat = (await call(tools, "treasury_monotributo", {
      activity: "servicios",
      category: "A",
    })) as { cuotaArs: number };
    expect(byCat.cuotaArs).toBe(42_386.74);

    const byIncome = (await call(tools, "treasury_monotributo", {
      activity: "servicios",
      annualIncomeArs: 5_000_000,
    })) as { category: string };
    expect(byIncome.category).toBe("A");

    const over = (await call(tools, "treasury_monotributo", {
      activity: "servicios",
      annualIncomeArs: 100_000_000,
    })) as { available: boolean };
    expect(over.available).toBe(false);
  });

  it("treasury_buffer_status sizes the buffer and flags the shortfall", async () => {
    const r = (await call(tools, "treasury_buffer_status", {
      arsBalance: 0,
      obligations: [
        { id: "m1", kind: "monotributo", amountArs: 30_000, dueAtMs: FIXED_NOW + 3 * DAY },
      ],
      horizonDays: 30,
      safety: 1.1,
    })) as { requiredArs: number; shortfallArs: number; funded: boolean; nextObligation: { id: string } | null };
    expect(r.requiredArs).toBe(33_000);
    expect(r.shortfallArs).toBe(33_000);
    expect(r.funded).toBe(false);
    expect(r.nextObligation?.id).toBe("m1");
  });

  it("treasury_plan_conversion tops up just enough", async () => {
    const r = (await call(tools, "treasury_plan_conversion", {
      usd: 100,
      ars: 0,
      requiredArs: 43_000,
      fxRate: 1000,
      spread: 0.01,
    })) as { convertUsd: number; expectedArs: number };
    expect(r.convertUsd).toBeCloseTo(43.434, 2);
    expect(r.expectedArs).toBeCloseTo(43_000, 0);
  });

  it("treasury_settlement_plan is honest about autonomy", async () => {
    const r = (await call(tools, "treasury_settlement_plan", {
      amountArs: 42_386.74,
      dueAtMs: FIXED_NOW,
      method: "debito_automatico",
    })) as { autonomy: string; canAutoExecute: boolean };
    expect(r.autonomy).toBe("passive");
    expect(r.canAutoExecute).toBe(false);
  });
});

describe("off-ramp tools without an adapter", () => {
  const tools = treasuryTools();

  it("quote / convert / status all report available:false", async () => {
    for (const [name, input] of [
      ["treasury_offramp_quote", { amountUsd: 100 }],
      ["treasury_offramp_convert", { amountUsd: 100 }],
      ["treasury_offramp_status", { txId: "x" }],
    ] as const) {
      const r = (await call(tools, name, input)) as { available: boolean };
      expect(r.available).toBe(false);
    }
  });
});

describe("off-ramp tools with an adapter", () => {
  const tools = treasuryTools({ offramp: new InMemoryOffRampAdapter(1000, 0.01) });

  it("quote returns a live quote", async () => {
    const r = (await call(tools, "treasury_offramp_quote", { amountUsd: 100 })) as {
      available: boolean;
      arsOut: number;
    };
    expect(r.available).toBe(true);
    expect(r.arsOut).toBeCloseTo(99_000, 0);
  });

  it("convert executes and returns a receipt", async () => {
    const r = (await call(tools, "treasury_offramp_convert", { amountUsd: 100 })) as {
      available: boolean;
      txId: string;
    };
    expect(r.available).toBe(true);
    expect(r.txId).toBe("mem-1");
  });

  it("status polls the prior convert", async () => {
    const r = (await call(tools, "treasury_offramp_status", { txId: "mem-1" })) as {
      available: boolean;
      status: string;
    };
    expect(r.available).toBe(true);
    expect(r.status).toBe("COMPLETED");
  });
});
