import { describe, expect, it } from "vitest";
import {
  FetcherNotConfiguredError,
  MockBoFetcher,
  parseSearchHtml,
  UnconfiguredBoFetcher,
  type Norma,
} from "../src";

const sample: Norma[] = [
  {
    id: "100",
    seccion: "primera",
    tipo: "resolucion",
    titulo: "RESOLUCIÓN GENERAL ARCA 5612/2026",
    organismo: "ARCA",
    fechaPublicacion: "2026-04-28",
    texto: "Establece nuevas alícuotas para monotributistas.",
    cuitsMencionados: ["20417581015"],
    url: "https://www.boletinoficial.gob.ar/detalleAviso/primera/100/20260428",
  },
  {
    id: "200",
    seccion: "segunda",
    tipo: "sociedad",
    titulo: "ACME S.A. - CONSTITUCIÓN",
    organismo: "IGJ",
    fechaPublicacion: "2026-04-28",
    texto: "Se constituye ACME S.A. con CUIT 30707500129.",
    cuitsMencionados: ["30707500129"],
    url: "https://www.boletinoficial.gob.ar/detalleAviso/segunda/200/20260428",
  },
];

describe("UnconfiguredBoFetcher", () => {
  it("returns empty results without crashing", async () => {
    const f = new UnconfiguredBoFetcher();
    const r = await f.search({ query: "anything" });
    expect(r.results).toEqual([]);
    expect(r.source).toBe("unconfigured");
  });

  it("throws on getNorma so callers get a clear error", async () => {
    const f = new UnconfiguredBoFetcher();
    await expect(f.getNorma("any")).rejects.toThrow(FetcherNotConfiguredError);
  });
});

describe("MockBoFetcher", () => {
  it("filters by sección", async () => {
    const f = new MockBoFetcher(sample);
    const r = await f.search({ secciones: ["primera"] });
    expect(r.results.length).toBe(1);
    expect(r.results[0]!.seccion).toBe("primera");
  });

  it("filters by free-text query (substring, case-insensitive)", async () => {
    const f = new MockBoFetcher(sample);
    const r = await f.search({ query: "monotributistas" });
    expect(r.results.length).toBe(1);
    expect(r.results[0]!.id).toBe("100");
  });

  it("filters by CUIT", async () => {
    const f = new MockBoFetcher(sample);
    const r = await f.search({ cuit: "30707500129" });
    expect(r.results.length).toBe(1);
    expect(r.results[0]!.id).toBe("200");
  });

  it("filters by organismo", async () => {
    const f = new MockBoFetcher(sample);
    const r = await f.search({ organismo: "ARCA" });
    expect(r.results.length).toBe(1);
  });

  it("filters by date range", async () => {
    const f = new MockBoFetcher(sample);
    const r = await f.search({ from: "2026-04-29" });
    expect(r.results.length).toBe(0);
  });

  it("paginates with cursor + pageSize", async () => {
    const f = new MockBoFetcher(sample);
    const r1 = await f.search({ pageSize: 1 });
    expect(r1.results.length).toBe(1);
    expect(r1.nextCursor).toBe("1");
    const r2 = await f.search({ pageSize: 1, cursor: "1" });
    expect(r2.results.length).toBe(1);
    expect(r2.nextCursor).toBeNull();
  });

  it("getNorma returns by id or null", async () => {
    const f = new MockBoFetcher(sample);
    expect(await f.getNorma("100")).toEqual(sample[0]);
    expect(await f.getNorma("nope")).toBeNull();
  });
});

describe("parseSearchHtml", () => {
  it("extracts results from anchor links to /detalleAviso", () => {
    const html = `
      <ul>
        <li><a href="/detalleAviso/primera/123/20260428">RESOLUCIÓN GENERAL 5612/2026</a></li>
        <li><a href="/detalleAviso/primera/124/20260428">DECRETO 70/2026</a></li>
      </ul>
    `;
    const r = parseSearchHtml(html, "primera");
    expect(r.length).toBe(2);
    expect(r[0]!.id).toBe("123");
    expect(r[0]!.fechaPublicacion).toBe("2026-04-28");
    expect(r[0]!.url).toContain("/detalleAviso/primera/123/20260428");
    expect(r[0]!.tipo).toBe("resolucion");
    expect(r[1]!.tipo).toBe("decreto");
  });

  it("returns empty array when HTML has no detail links", () => {
    expect(parseSearchHtml("<html></html>", "primera")).toEqual([]);
  });

  it("strips HTML tags from titles", () => {
    const html = `<a href="/detalleAviso/primera/1/20260428"><strong>LEY</strong> 27.123</a>`;
    const [r] = parseSearchHtml(html, "primera");
    expect(r!.titulo).toBe("LEY 27.123");
  });
});
