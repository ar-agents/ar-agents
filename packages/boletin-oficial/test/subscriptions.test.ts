import { describe, expect, it } from "vitest";
import {
  InMemoryBoSubscriptionAdapter,
  makeSubscriptionId,
  matchNorma,
  type BoSubscription,
  type Norma,
} from "../src";

const norma: Norma = {
  id: "999",
  seccion: "primera",
  tipo: "resolucion",
  titulo: "RESOLUCIÓN GENERAL ARCA 5612/2026",
  organismo: "ARCA — AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO",
  fechaPublicacion: "2026-04-28",
  texto: "Establece nuevas alícuotas. CUIT del responsable: 20-12345678-6.",
  cuitsMencionados: ["20123456786"],
  url: "https://www.boletinoficial.gob.ar/detalleAviso/primera/999/20260428",
};

function sub(partial: Partial<BoSubscription>): BoSubscription {
  return {
    id: "test-sub",
    ownerId: "user-1",
    match: {},
    createdAt: Date.now(),
    active: true,
    ...partial,
  };
}

describe("matchNorma", () => {
  it("matches by keyword (case-insensitive substring)", () => {
    const subs = [sub({ match: { keyword: "alícuotas" } })];
    expect(matchNorma(norma, subs)).toHaveLength(1);
  });

  it("does not match a keyword that's absent", () => {
    const subs = [sub({ match: { keyword: "transporte" } })];
    expect(matchNorma(norma, subs)).toHaveLength(0);
  });

  it("matches by CUIT (exact)", () => {
    const subs = [sub({ match: { cuit: "20123456786" } })];
    expect(matchNorma(norma, subs)).toHaveLength(1);
  });

  it("matches by organismo (substring)", () => {
    const subs = [sub({ match: { organismo: "ARCA" } })];
    expect(matchNorma(norma, subs)).toHaveLength(1);
  });

  it("matches by sección", () => {
    const subs = [sub({ match: { seccion: "primera" } })];
    expect(matchNorma(norma, subs)).toHaveLength(1);
  });

  it("matches by tipo", () => {
    const subs = [sub({ match: { tipo: "resolucion" } })];
    expect(matchNorma(norma, subs)).toHaveLength(1);
  });

  it("requires ALL criteria to match (AND semantics)", () => {
    const subs = [sub({ match: { keyword: "alícuotas", cuit: "30000000000" } })];
    expect(matchNorma(norma, subs)).toHaveLength(0);
  });

  it("ignores inactive subscriptions", () => {
    const subs = [sub({ active: false, match: { seccion: "primera" } })];
    expect(matchNorma(norma, subs)).toHaveLength(0);
  });

  it("ignores empty subscriptions to avoid matching everything", () => {
    const subs = [sub({ match: {} })];
    expect(matchNorma(norma, subs)).toHaveLength(0);
  });

  it("includes a human-readable reason for each match", () => {
    const subs = [sub({ match: { keyword: "ARCA", organismo: "ARCA" } })];
    const matches = matchNorma(norma, subs);
    expect(matches[0]!.reason).toMatch(/keyword/);
    expect(matches[0]!.reason).toMatch(/organismo/);
  });
});

describe("InMemoryBoSubscriptionAdapter", () => {
  it("puts, gets, lists, removes", async () => {
    const a = new InMemoryBoSubscriptionAdapter();
    const s1 = sub({ id: "s1", ownerId: "u1" });
    const s2 = sub({ id: "s2", ownerId: "u2" });
    await a.put(s1);
    await a.put(s2);
    expect(await a.get("s1")).toEqual(s1);
    expect((await a.list()).length).toBe(2);
    expect((await a.list({ ownerId: "u1" })).length).toBe(1);
    await a.remove("s1");
    expect(await a.get("s1")).toBeNull();
  });

  it("filters by activeOnly", async () => {
    const a = new InMemoryBoSubscriptionAdapter();
    await a.put(sub({ id: "s1", active: true }));
    await a.put(sub({ id: "s2", active: false }));
    expect((await a.list({ activeOnly: true })).length).toBe(1);
  });
});

describe("makeSubscriptionId", () => {
  it("includes owner + criteria", () => {
    const id = makeSubscriptionId("user-1", { keyword: "ARCA", cuit: "20123456786" });
    expect(id).toContain("o=user-1");
    expect(id).toContain("k=ARCA");
    expect(id).toContain("c=20123456786");
  });

  it("is stable across calls", () => {
    const a = makeSubscriptionId("u", { keyword: "k" });
    const b = makeSubscriptionId("u", { keyword: "k" });
    expect(a).toBe(b);
  });
});
