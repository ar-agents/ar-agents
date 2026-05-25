import { describe, expect, it } from "vitest";
import {
  ALL_TOOL_NAMES,
  ansesTools,
  AnsesUnconfiguredError,
  AnsesValidationError,
  InMemoryAnsesAdapter,
} from "../src";

describe("ansesTools factory", () => {
  it("exposes the 3 v0.1 tools by default", () => {
    expect(Object.keys(ansesTools()).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("tool descriptions are non-trivial (>40 chars)", () => {
    const t = ansesTools();
    for (const [name, def] of Object.entries(t)) {
      expect(def.description!.length, `${name} description`).toBeGreaterThan(40);
    }
  });

  it("default adapter throws AnsesUnconfiguredError", async () => {
    const t = ansesTools();
    await expect(
      (t.anses_get_cuil_status.execute as (
        a: unknown,
        c: unknown,
      ) => Promise<unknown>)({ cuil: "20-12345678-9" }, {}),
    ).rejects.toBeInstanceOf(AnsesUnconfiguredError);
  });

  it("rejects malformed CUIL", async () => {
    const t = ansesTools({ adapter: new InMemoryAnsesAdapter() });
    await expect(
      (t.anses_get_cuil_status.execute as (
        a: unknown,
        c: unknown,
      ) => Promise<unknown>)({ cuil: "abc" }, {}),
    ).rejects.toBeInstanceOf(AnsesValidationError);
  });
});

describe("InMemoryAnsesAdapter", () => {
  const adapter = new InMemoryAnsesAdapter({
    cuils: [
      {
        cuil: "20123456789",
        found: true,
        status: "activo",
        nombre: "JUAN PEREZ",
        empleadorCuit: "30500000018",
      },
    ],
    allowances: {
      "20123456789": [
        { kind: "AUH", beneficiariesCount: 2, amountCentavos: 50_000_000 },
      ],
    },
    minimoByPeriod: [
      { period: "2026-05", amountCentavos: 28_500_000, source: "Decreto 234/2026" },
    ],
  });

  it("normalizes hyphens before lookup", async () => {
    const r = await adapter.getCuilStatus("20-12345678-9");
    expect(r.found).toBe(true);
    expect(r.status).toBe("activo");
  });

  it("returns empty list when no allowances on file", async () => {
    expect(await adapter.getFamilyAllowances("99999999999")).toEqual([]);
  });

  it("returns minimo for known period", async () => {
    const r = await adapter.getMinimoJubilatorio("2026-05");
    expect(r?.amountCentavos).toBe(28_500_000);
  });

  it("returns null for unknown period", async () => {
    expect(await adapter.getMinimoJubilatorio("2030-01")).toBeNull();
  });
});
