/**
 * Unit tests for the AFIP/ARCA fiscal layer: the 2026 monotributo table + the
 * honest settlement model (no method pays autonomously at pay-time).
 */

import { describe, expect, it } from "vitest";
import {
  MONOTRIBUTO_2026,
  MONOTRIBUTO_TABLE_EFFECTIVE,
  monotributoCuota,
  categoryForAnnualIncome,
  settlementPlan,
  WSCREATEVEP_IS_GOV_ONLY,
} from "../src/afip";
import type { Obligation } from "../src/index";

describe("monotributo table", () => {
  it("has 11 categories A..K effective 2026-02-01", () => {
    expect(MONOTRIBUTO_2026).toHaveLength(11);
    expect(MONOTRIBUTO_2026.map((r) => r.category)).toEqual(
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
    );
    expect(MONOTRIBUTO_TABLE_EFFECTIVE).toBe("2026-02-01");
  });

  it("returns the cuota for a category + activity", () => {
    expect(monotributoCuota("A", "servicios")).toBe(42_386.74);
    expect(monotributoCuota("H", "bienes")).toBe(272_063.4);
    expect(monotributoCuota("I", "bienes")).toBe(406_512.05);
  });

  it("rejects servicios for a bienes-only category (I/J/K)", () => {
    expect(() => monotributoCuota("I", "servicios")).toThrow(/bienes/);
    expect(() => monotributoCuota("K", "servicios")).toThrow(/bienes/);
  });
});

describe("categoryForAnnualIncome", () => {
  it("maps income to the smallest fitting category", () => {
    expect(categoryForAnnualIncome(5_000_000, "servicios")).toBe("A");
    expect(categoryForAnnualIncome(20_000_000, "servicios")).toBe("C");
    expect(categoryForAnnualIncome(70_000_000, "servicios")).toBe("H");
  });

  it("caps servicios at H; bienes can reach K", () => {
    expect(categoryForAnnualIncome(100_000_000, "servicios")).toBeNull();
    expect(categoryForAnnualIncome(100_000_000, "bienes")).toBe("K");
  });

  it("returns null above the regime ceiling", () => {
    expect(categoryForAnnualIncome(200_000_000, "bienes")).toBeNull();
  });
});

describe("settlementPlan — honest autonomy", () => {
  const ob: Obligation = {
    id: "mono-1",
    kind: "monotributo",
    amountArs: 42_386.74,
    dueAtMs: 1_750_000_000_000,
  };

  it("debito_automatico is passive (one-time human setup, then runs itself)", () => {
    const p = settlementPlan(ob, "debito_automatico");
    expect(p.autonomy).toBe("passive");
    expect(p.canAutoExecute).toBe(false);
    expect(p.oneTimeSetup).not.toBe("");
    expect(p.instruction).toContain("42386.74");
  });

  it("vep_manual needs a human every time, no one-time setup", () => {
    const p = settlementPlan(ob, "vep_manual");
    expect(p.autonomy).toBe("human-required");
    expect(p.canAutoExecute).toBe(false);
    expect(p.oneTimeSetup).toBe("");
  });

  it("mp_manual references Mercado Pago and is human-required", () => {
    const p = settlementPlan(ob, "mp_manual");
    expect(p.autonomy).toBe("human-required");
    expect(p.instruction).toMatch(/Mercado Pago/);
  });

  it("NO method is ever fully autonomous at pay-time", () => {
    for (const m of ["debito_automatico", "vep_manual", "mp_manual"] as const) {
      expect(settlementPlan(ob, m).canAutoExecute).toBe(false);
    }
  });
});

describe("WSCREATEVEP guard", () => {
  it("documents that it is gov-only so it is never built on", () => {
    expect(WSCREATEVEP_IS_GOV_ONLY).toMatch(/public organisms/);
  });
});
