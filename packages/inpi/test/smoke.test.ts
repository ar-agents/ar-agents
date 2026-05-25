import { describe, expect, it } from "vitest";
import {
  ALL_TOOL_NAMES,
  InMemoryInpiAdapter,
  inpiTools,
  InpiUnconfiguredError,
  InpiValidationError,
  type TrademarkRecord,
} from "../src";

const SEED: TrademarkRecord[] = [
  {
    acta: "3792456",
    denomination: "VULTUR",
    niceClass: 9,
    status: "concedida",
    holder: "Nazareno Clemente",
    grantedAt: "2025-06-15",
    expiresAt: "2035-06-15",
  },
  {
    acta: "3700001",
    denomination: "ASTRO",
    niceClass: 9,
    status: "concedida",
    holder: "Astro S.R.L.",
  },
  {
    acta: "3800001",
    denomination: "ASTRO COFFEE",
    niceClass: 30,
    status: "publicada",
    holder: "ACME",
  },
];

describe("inpiTools factory", () => {
  it("exposes the 2 v0.1 tools by default", () => {
    expect(Object.keys(inpiTools()).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("tool descriptions are non-trivial (>40 chars)", () => {
    const t = inpiTools();
    for (const [name, def] of Object.entries(t)) {
      expect(def.description!.length, `${name} description`).toBeGreaterThan(40);
    }
  });

  it("default adapter throws InpiUnconfiguredError", async () => {
    const t = inpiTools();
    await expect(
      (t.inpi_search_trademark.execute as (
        a: unknown,
        c: unknown,
      ) => Promise<unknown>)({ q: "astro" }, {}),
    ).rejects.toBeInstanceOf(InpiUnconfiguredError);
  });

  it("rejects too-short queries", async () => {
    const t = inpiTools({ adapter: new InMemoryInpiAdapter({ records: SEED }) });
    await expect(
      (t.inpi_search_trademark.execute as (
        a: unknown,
        c: unknown,
      ) => Promise<unknown>)({ q: "a" }, {}),
    ).rejects.toBeInstanceOf(InpiValidationError);
  });
});

describe("InMemoryInpiAdapter", () => {
  const adapter = new InMemoryInpiAdapter({ records: SEED });

  it("matches denomination substring case-insensitively", async () => {
    const r = await adapter.search({ q: "astro" });
    expect(r.records.length).toBe(2);
    expect(r.records.map((x) => x.acta).sort()).toEqual(["3700001", "3800001"]);
  });

  it("filters by Nice class", async () => {
    const r = await adapter.search({ q: "astro", niceClass: 30 });
    expect(r.records.length).toBe(1);
    expect(r.records[0]?.acta).toBe("3800001");
  });

  it("filters by status", async () => {
    const r = await adapter.search({ q: "astro", status: "concedida" });
    expect(r.records.length).toBe(1);
    expect(r.records[0]?.acta).toBe("3700001");
  });

  it("getByActa returns the matching record or null", async () => {
    expect((await adapter.getByActa("3792456"))?.denomination).toBe("VULTUR");
    expect(await adapter.getByActa("0000000")).toBeNull();
  });
});
