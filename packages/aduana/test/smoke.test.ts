import { describe, expect, it } from "vitest";
import {
  aduanaTools,
  ALL_TOOL_NAMES,
  AduanaUnconfiguredError,
  AduanaValidationError,
  InMemoryAduanaAdapter,
} from "../src";

describe("aduanaTools factory", () => {
  it("exposes the 2 v0.1 tools by default", () => {
    const t = aduanaTools();
    expect(Object.keys(t).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("each tool description is non-trivial (>40 chars)", () => {
    const t = aduanaTools();
    for (const [name, def] of Object.entries(t)) {
      expect(def.description, `${name} missing description`).toBeTruthy();
      expect(def.description!.length).toBeGreaterThan(40);
    }
  });

  it("default adapter throws AduanaUnconfiguredError on call", async () => {
    const t = aduanaTools();
    await expect(
      (t.aduana_lookup_despacho.execute as (
        a: unknown,
        c: unknown,
      ) => Promise<unknown>)({ kind: "SUSI", value: "ABC123" }, {}),
    ).rejects.toBeInstanceOf(AduanaUnconfiguredError);
  });

  it("rejects empty despacho value", async () => {
    const t = aduanaTools({ adapter: new InMemoryAduanaAdapter() });
    await expect(
      (t.aduana_lookup_despacho.execute as (
        a: unknown,
        c: unknown,
      ) => Promise<unknown>)({ kind: "SUSI", value: "  " }, {}),
    ).rejects.toBeInstanceOf(AduanaValidationError);
  });
});

describe("InMemoryAduanaAdapter", () => {
  it("returns seeded despachos verbatim", async () => {
    const adapter = new InMemoryAduanaAdapter({
      despachos: [
        {
          identifier: { kind: "SUSI", value: "24001IM4001234A" },
          found: true,
          status: "canalizado_verde",
          operationKind: "IM4",
          ncmCode: "84713010",
        },
      ],
    });
    const r = await adapter.lookupDespacho({
      kind: "SUSI",
      value: "24001IM4001234A",
    });
    expect(r.found).toBe(true);
    expect(r.status).toBe("canalizado_verde");
  });

  it("returns {found: false} for unseeded ids", async () => {
    const adapter = new InMemoryAduanaAdapter();
    const r = await adapter.lookupDespacho({ kind: "OM", value: "999" });
    expect(r.found).toBe(false);
  });

  it("returns null for unseeded NCM codes", async () => {
    const adapter = new InMemoryAduanaAdapter();
    expect(await adapter.lookupNcm("84713010")).toBeNull();
  });
});
