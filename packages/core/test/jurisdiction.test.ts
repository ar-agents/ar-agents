import { describe, expect, it } from "vitest";
import {
  createJurisdictionRegistry,
  createArJurisdiction,
  AR_CEDULAR,
  AR_MONOTRIBUTO,
  AR_TAX_RULES,
  classifyTool,
  levelRequiresApproval,
  type Jurisdiction,
  type Registry,
  type FiatRail,
  type GoodStandingAttestation,
  type AttestationVerification,
} from "../src/index";

// ─────────────────────────────────────────────────────────────────────────────
// Offline test doubles. core has ZERO runtime deps, so the Registry/FiatRail are
// injected here as in-memory stubs (never network). This mirrors how a host wires
// the real IGJ lookup + treasury off-ramp via createArJurisdiction.
// ─────────────────────────────────────────────────────────────────────────────

const stubRegistry: Registry = {
  id: "ar-igj",
  country: "AR",
  name: "IGJ (Argentina)",
  async lookup() {
    return null;
  },
  // Trust-minimized: verification passes ONLY on the PUBLIC anchor, never on a
  // bare ar-agents signature (thesis #2). This is the contract the AR impl honors.
  async verifyAttestation(
    att: GoodStandingAttestation,
  ): Promise<AttestationVerification> {
    if (att.anchor && att.anchor.proof) {
      return { valid: true, trustMinimized: true };
    }
    return {
      valid: false,
      trustMinimized: false,
      reason: "no public anchor; an ar-agents signature alone is not a root of trust",
    };
  },
};

const stubRail: FiatRail = {
  id: "manteca",
  country: "AR",
  currency: "ARS",
  direction: "off-ramp",
  async quote(input) {
    return { amount: input.amount, out: input.amount, rate: 1, spread: 0 };
  },
  async settle(input) {
    return { amount: input.amount, received: input.amount, rate: 1, txId: input.externalId };
  },
};

// Reference oracle: treasury cedularTax (treasury/src/index.ts:52-62), reproduced
// here (core cannot depend on treasury). Asserts AR_CEDULAR is faithful to it.
function treasuryCedularTax(
  amountUsd: number,
  costBasisPerUsd: number,
  fxRate: number,
  denom: "ARS" | "FOREIGN",
): number {
  const proceeds = amountUsd * fxRate;
  const cost = amountUsd * costBasisPerUsd * fxRate;
  const gain = Math.max(0, proceeds - cost);
  return gain * (denom === "ARS" ? 0.05 : 0.15);
}

// Reference oracle: treasury monotributoCuota (treasury/src/afip.ts), reproduced.
const TREASURY_MONO_CUOTA_SERVICIOS: Record<string, number> = {
  A: 42_386.74, B: 48_250.78, C: 56_501.85, D: 72_414.10, E: 102_537.97,
  F: 129_045.32, G: 197_108.23, H: 447_346.93,
};

describe("createJurisdictionRegistry", () => {
  it("resolves by country, by country/subdivision, and lists all", () => {
    const ar = createArJurisdiction({ registry: stubRegistry });
    const wy: Jurisdiction = {
      country: "US",
      subdivision: "US-WY",
      name: "Wyoming DAO LLC",
      defaultCurrency: "USD",
      status: "operational",
      registry: { ...stubRegistry, id: "us-wy-sos", country: "US", name: "WY SoS" },
      fiatRails: [],
      taxRules: [],
    };
    const reg = createJurisdictionRegistry([ar, wy]);

    expect(reg.get("AR")).toBe(ar);
    expect(reg.get("US")).toBe(wy);
    expect(reg.get("US", "US-WY")).toBe(wy);
    // falls back to country-level when the subdivision is unknown
    expect(reg.get("AR", "AR-X")).toBe(ar);
    expect(reg.get("ZZ")).toBeUndefined();
    expect(reg.list()).toHaveLength(2);
  });
});

describe("AR_CEDULAR.computeOwed — parity with treasury cedularTax", () => {
  const vectors: ReadonlyArray<{
    amount: number;
    costBasisPerUsd: number;
    fxRate: number;
    denom: "ARS" | "FOREIGN";
  }> = [
    { amount: 1000, costBasisPerUsd: 1, fxRate: 1000, denom: "ARS" },
    { amount: 1000, costBasisPerUsd: 0.5, fxRate: 1000, denom: "ARS" },
    { amount: 1000, costBasisPerUsd: 0.5, fxRate: 1000, denom: "FOREIGN" },
    { amount: 2000, costBasisPerUsd: 1.2, fxRate: 1500, denom: "ARS" },
  ];

  for (const v of vectors) {
    it(`amount=${v.amount} cb=${v.costBasisPerUsd} fx=${v.fxRate} ${v.denom}`, () => {
      const owed = AR_CEDULAR.computeOwed({
        kind: "crypto-disposal",
        amount: v.amount,
        currency: "ARS",
        meta: { fxRate: v.fxRate, costBasisPerUsd: v.costBasisPerUsd, denomination: v.denom },
      });
      expect(owed.amount).toBeCloseTo(
        treasuryCedularTax(v.amount, v.costBasisPerUsd, v.fxRate, v.denom),
        6,
      );
      expect(owed.currency).toBe("ARS");
      expect(owed.ruleId).toBe("ar-cedular");
    });
  }

  it("taxes the gain only (no gain => 0)", () => {
    const owed = AR_CEDULAR.computeOwed({
      kind: "crypto-disposal",
      amount: 1000,
      currency: "ARS",
      meta: { fxRate: 1000, costBasisPerUsd: 1, denomination: "ARS" },
    });
    expect(owed.amount).toBe(0);
  });

  it("defaults: cost basis 1, fx 1, denom ARS", () => {
    const owed = AR_CEDULAR.computeOwed({ kind: "crypto-disposal", amount: 1000, currency: "ARS" });
    // proceeds 1000, cost 1000 => no gain
    expect(owed.amount).toBe(0);
  });
});

describe("AR_MONOTRIBUTO.computeOwed — parity with treasury monotributoCuota", () => {
  for (const [cat, cuota] of Object.entries(TREASURY_MONO_CUOTA_SERVICIOS)) {
    it(`category ${cat} servicios => ${cuota}`, () => {
      const owed = AR_MONOTRIBUTO.computeOwed({
        kind: "monotributo-cuota",
        amount: 0,
        currency: "ARS",
        meta: { category: cat, activity: "servicios" },
      });
      expect(owed.amount).toBe(cuota);
      expect(owed.currency).toBe("ARS");
      expect(owed.ruleId).toBe("ar-monotributo");
    });
  }

  it("throws on unknown category", () => {
    expect(() =>
      AR_MONOTRIBUTO.computeOwed({
        kind: "monotributo-cuota",
        amount: 0,
        currency: "ARS",
        meta: { category: "Z" },
      }),
    ).toThrow(/unknown monotributo category/);
  });

  it("throws when a servicios taxpayer asks for a bienes-only category (I/J/K)", () => {
    expect(() =>
      AR_MONOTRIBUTO.computeOwed({
        kind: "monotributo-cuota",
        amount: 0,
        currency: "ARS",
        meta: { category: "I", activity: "servicios" },
      }),
    ).toThrow(/only available for venta de bienes/);
  });
});

describe("createArJurisdiction shape", () => {
  it("returns AR with injected registry, default empty rails, proposal status", () => {
    const j = createArJurisdiction({ registry: stubRegistry });
    expect(j.country).toBe("AR");
    expect(j.name).toBe("Argentina");
    expect(j.defaultCurrency).toBe("ARS");
    expect(j.status).toBe("proposal");
    expect(j.registry).toBe(stubRegistry);
    expect(j.fiatRails).toEqual([]);
    expect(j.taxRules).toBe(AR_TAX_RULES);
    expect(j.taxRules).toContain(AR_CEDULAR);
    expect(j.taxRules).toContain(AR_MONOTRIBUTO);
  });

  it("wires injected fiat rails", () => {
    const j = createArJurisdiction({ registry: stubRegistry, fiatRails: [stubRail] });
    expect(j.fiatRails).toEqual([stubRail]);
  });
});

describe("RiskLevel reuse — tax rules classify through the SAME manifest", () => {
  it("AR_MONOTRIBUTO is a fiscal act and so requires the art.102 approval", () => {
    expect(AR_MONOTRIBUTO.riskLevel).toBe("fiscal");
    expect(levelRequiresApproval(AR_MONOTRIBUTO.riskLevel)).toBe(true);
    // The manifest classifies a fiscal ACT name the same way.
    expect(levelRequiresApproval(classifyTool({ name: "presentar_ddjj" }))).toBe(true);
  });

  it("AR_CEDULAR is a pure read calculator and does NOT require approval", () => {
    expect(AR_CEDULAR.riskLevel).toBe("read");
    expect(levelRequiresApproval(AR_CEDULAR.riskLevel)).toBe(false);
    // The manifest classifies a tax CALCULATOR name as read too.
    expect(classifyTool({ name: "cedular_calculate" })).toBe("read");
  });
});

describe("Registry.verifyAttestation — trust-minimized per thesis #2", () => {
  const record = {
    entityId: "ar-igj-123",
    jurisdiction: "AR" as const,
    name: "Sociedad Automatizada Demo",
    status: "good-standing" as const,
    asOf: "2026-06-29T00:00:00.000Z",
  };

  it("trustMinimized true ONLY when a public anchor is present", async () => {
    const ok = await stubRegistry.verifyAttestation({
      record,
      signature: "sig-of-convenience",
      anchor: { type: "opentimestamps", proof: "ots:deadbeef" },
    });
    expect(ok.valid).toBe(true);
    expect(ok.trustMinimized).toBe(true);
  });

  it("a bare ar-agents signature is NOT a root of trust", async () => {
    const bad = await stubRegistry.verifyAttestation({ record, signature: "sig-only" });
    expect(bad.valid).toBe(false);
    expect(bad.trustMinimized).toBe(false);
    expect(bad.reason).toBeTruthy();
  });
});
