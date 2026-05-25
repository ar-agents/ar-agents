import { describe, expect, it } from "vitest";
import {
  ALL_TOOL_NAMES,
  cnvTools,
  CnvUnconfiguredError,
  InMemoryCnvAdapter,
  type HechoRelevante,
  type IssuerRecord,
} from "../src";

const ISSUERS: IssuerRecord[] = [
  {
    code: "YPF",
    denomination: "YPF S.A.",
    cuit: "30546689101",
    categoria: "Régimen General",
    sector: "Petróleo y gas",
    active: true,
  },
];

const HECHOS: HechoRelevante[] = [
  {
    id: "h1",
    issuerCode: "YPF",
    publishedAt: "2026-05-01T15:00:00Z",
    category: "estado_financiero",
    title: "Estado financiero 1Q 2026",
    documentUrl: "https://aif.cnv.gov.ar/h1.pdf",
  },
  {
    id: "h2",
    issuerCode: "YPF",
    publishedAt: "2026-04-15T12:00:00Z",
    category: "asamblea",
    title: "Convocatoria asamblea ordinaria",
  },
];

describe("cnvTools factory", () => {
  it("exposes the 3 v0.1 tools by default", () => {
    expect(Object.keys(cnvTools()).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("tool descriptions are non-trivial (>40 chars)", () => {
    const t = cnvTools();
    for (const [name, def] of Object.entries(t)) {
      expect(def.description!.length, `${name} description`).toBeGreaterThan(40);
    }
  });

  it("default adapter throws CnvUnconfiguredError", async () => {
    const t = cnvTools();
    await expect(
      (t.cnv_get_issuer.execute as (a: unknown, c: unknown) => Promise<unknown>)(
        { code: "YPF" },
        {},
      ),
    ).rejects.toBeInstanceOf(CnvUnconfiguredError);
  });
});

describe("InMemoryCnvAdapter", () => {
  const adapter = new InMemoryCnvAdapter({ issuers: ISSUERS, hechos: HECHOS });

  it("returns the issuer by code", async () => {
    expect((await adapter.getIssuer("YPF"))?.denomination).toBe("YPF S.A.");
    expect(await adapter.getIssuer("UNKNOWN")).toBeNull();
  });

  it("filters hechos by category", async () => {
    const r = await adapter.listHechosRelevantes({
      issuerCode: "YPF",
      category: "asamblea",
    });
    expect(r.length).toBe(1);
    expect(r[0]?.id).toBe("h2");
  });

  it("filters hechos by sinceIso", async () => {
    const r = await adapter.listHechosRelevantes({
      issuerCode: "YPF",
      sinceIso: "2026-04-20T00:00:00Z",
    });
    expect(r.length).toBe(1);
    expect(r[0]?.id).toBe("h1");
  });

  it("respects limit", async () => {
    const r = await adapter.listHechosRelevantes({
      issuerCode: "YPF",
      limit: 1,
    });
    expect(r.length).toBe(1);
  });
});
