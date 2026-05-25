import { describe, expect, it } from "vitest";
import {
  ALL_TOOL_NAMES,
  detectDominioFormat,
  DnrpaUnconfiguredError,
  DnrpaValidationError,
  dnrpaTools,
  InMemoryDnrpaAdapter,
} from "../src";

describe("detectDominioFormat", () => {
  it("identifies new Mercosur plates", () => {
    expect(detectDominioFormat("AB123CD")).toBe("new_mercosur");
    expect(detectDominioFormat("ab-123-cd")).toBe("new_mercosur");
  });
  it("identifies old Argentine plates", () => {
    expect(detectDominioFormat("FFF123")).toBe("old_argentine");
    expect(detectDominioFormat("fff-123")).toBe("old_argentine");
  });
  it("flags unknown formats", () => {
    expect(detectDominioFormat("123")).toBe("unknown");
    expect(detectDominioFormat("AAA12")).toBe("unknown"); // too short
    expect(detectDominioFormat("12ABCDE")).toBe("unknown"); // wrong order
  });
});

describe("dnrpaTools factory", () => {
  it("exposes the 1 v0.1 tool by default", () => {
    const t = dnrpaTools();
    expect(Object.keys(t).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("tool description is non-trivial (>40 chars)", () => {
    const t = dnrpaTools();
    expect(t.dnrpa_lookup_dominio.description!.length).toBeGreaterThan(40);
  });

  it("default adapter throws DnrpaUnconfiguredError", async () => {
    const t = dnrpaTools();
    await expect(
      (t.dnrpa_lookup_dominio.execute as (
        a: unknown,
        c: unknown,
      ) => Promise<unknown>)({ dominio: "AB123CD" }, {}),
    ).rejects.toBeInstanceOf(DnrpaUnconfiguredError);
  });

  it("rejects malformed plates", async () => {
    const t = dnrpaTools({ adapter: new InMemoryDnrpaAdapter() });
    await expect(
      (t.dnrpa_lookup_dominio.execute as (
        a: unknown,
        c: unknown,
      ) => Promise<unknown>)({ dominio: "ZZZZZ1" }, {}),
    ).rejects.toBeInstanceOf(DnrpaValidationError);
  });
});

describe("InMemoryDnrpaAdapter", () => {
  it("returns seeded plates verbatim, case + hyphen insensitive", async () => {
    const adapter = new InMemoryDnrpaAdapter({
      dominios: [
        {
          dominio: "AB123CD",
          found: true,
          marca: "Toyota",
          modelo: "Hilux",
          anio: 2022,
          prendaActiva: false,
          baja: false,
        },
      ],
    });
    const r = await adapter.lookupDominio({ dominio: "ab-123-cd" });
    expect(r.found).toBe(true);
    expect(r.marca).toBe("Toyota");
  });

  it("returns {found:false} for unseeded plates", async () => {
    const adapter = new InMemoryDnrpaAdapter();
    expect((await adapter.lookupDominio({ dominio: "XX999YY" })).found).toBe(false);
  });
});
