import { describe, expect, it, vi } from "vitest";
import {
  FetcherNotConfiguredError,
  LiveCkanFetcher,
  MockIgjFetcher,
  UnconfiguredIgjFetcher,
  type IgjEntity,
} from "../src";

const sample: IgjEntity[] = [
  {
    id: "1",
    nombre: "ACME S.A.",
    cuit: "30707500129",
    tipoEntidad: "sa",
    fechaInscripcion: "2020-06-12",
  },
  {
    id: "2",
    nombre: "Foo Coop",
    cuit: "30123456789",
    tipoEntidad: "cooperativa",
    fechaInscripcion: "2018-03-01",
  },
  {
    id: "3",
    nombre: "Bar SRL",
    tipoEntidad: "srl",
    fechaInscripcion: "2025-01-15",
  },
];

describe("UnconfiguredIgjFetcher", () => {
  it("returns empty results without crashing", async () => {
    const f = new UnconfiguredIgjFetcher();
    const r = await f.search({ query: "anything" });
    expect(r.results).toEqual([]);
    expect(r.source).toBe("unconfigured");
    expect(r.coverageNote).toMatch(/no configurado/i);
  });

  it("throws on getEntity for a clear error path", async () => {
    const f = new UnconfiguredIgjFetcher();
    await expect(f.getEntity("any")).rejects.toThrow(FetcherNotConfiguredError);
  });

  it("returns empty arrays for the related fetchers", async () => {
    const f = new UnconfiguredIgjFetcher();
    expect(await f.getDomicilios("x")).toEqual([]);
    expect(await f.getAutoridades("x")).toEqual([]);
    expect(await f.getBalances("x")).toEqual([]);
    expect(await f.getAsambleas("x")).toEqual([]);
  });
});

describe("MockIgjFetcher", () => {
  it("filters by query (substring against nombre + cuit)", async () => {
    const f = new MockIgjFetcher({ entidades: sample });
    const r = await f.search({ query: "acme" });
    expect(r.results.map((e) => e.id)).toEqual(["1"]);
  });

  it("filters by CUIT (exact, normalized)", async () => {
    const f = new MockIgjFetcher({ entidades: sample });
    const r = await f.search({ cuit: "30-12345678-9" });
    expect(r.results.map((e) => e.id)).toEqual(["2"]);
  });

  it("filters by tipos", async () => {
    const f = new MockIgjFetcher({ entidades: sample });
    const r = await f.search({ tipos: ["sa", "srl"] });
    expect(r.results.map((e) => e.id).sort()).toEqual(["1", "3"]);
  });

  it("filters by date range", async () => {
    const f = new MockIgjFetcher({ entidades: sample });
    const r = await f.search({ from: "2020-01-01", to: "2024-12-31" });
    expect(r.results.map((e) => e.id)).toEqual(["1"]);
  });

  it("paginates with cursor + page_size", async () => {
    const f = new MockIgjFetcher({ entidades: sample });
    const p1 = await f.search({ pageSize: 2 });
    expect(p1.results.length).toBe(2);
    expect(p1.nextCursor).toBe("2");
    const p2 = await f.search({ pageSize: 2, cursor: "2" });
    expect(p2.results.length).toBe(1);
    expect(p2.nextCursor).toBeNull();
  });

  it("getEntity returns by id or null", async () => {
    const f = new MockIgjFetcher({ entidades: sample });
    expect(await f.getEntity("1")).toEqual(sample[0]);
    expect(await f.getEntity("nope")).toBeNull();
  });

  it("returns related sub-collections by entityId", async () => {
    const f = new MockIgjFetcher({
      entidades: sample,
      autoridades: [
        { entityId: "1", nombre: "Juan Pérez", cargo: "Presidente" },
        { entityId: "2", nombre: "María López", cargo: "Vocal" },
      ],
    });
    const r = await f.getAutoridades("1");
    expect(r.length).toBe(1);
    expect(r[0]!.nombre).toBe("Juan Pérez");
  });
});

describe("LiveCkanFetcher", () => {
  it("calls datastore_search with resource_id and limit/offset", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: {
            total: 2,
            records: [
              { _id: 1, denominacion: "ACME S.A.", tipoEntidad: "Sociedad Anónima" },
              { _id: 2, denominacion: "Foo SRL", tipoEntidad: "S.R.L." },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    const f = new LiveCkanFetcher({ fetch: fakeFetch as unknown as typeof fetch });
    const r = await f.search({ pageSize: 2 });
    expect(r.results.length).toBe(2);
    expect(r.results[0]!.nombre).toBe("ACME S.A.");
    expect(r.source).toBe("live");
    const calledUrl = String(fakeFetch.mock.calls[0]![0]);
    expect(calledUrl).toContain("/api/3/action/datastore_search");
    expect(calledUrl).toContain("resource_id=");
    expect(calledUrl).toContain("limit=2");
  });

  it("throws on CKAN error response", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, error: "boom" }), { status: 200 }),
    );
    const f = new LiveCkanFetcher({ fetch: fakeFetch as unknown as typeof fetch });
    await expect(f.search({})).rejects.toThrow(/CKAN action failed/);
  });

  it("throws on HTTP non-200", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response("oops", { status: 500, statusText: "Internal Server Error" }),
    );
    const f = new LiveCkanFetcher({ fetch: fakeFetch as unknown as typeof fetch });
    await expect(f.search({})).rejects.toThrow(/CKAN 500/);
  });

  it("getEntity hits datastore_search with _id filter", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: {
            total: 1,
            records: [{ _id: 42, denominacion: "Test SA", tipoEntidad: "S.A." }],
          },
        }),
        { status: 200 },
      ),
    );
    const f = new LiveCkanFetcher({ fetch: fakeFetch as unknown as typeof fetch });
    const e = await f.getEntity("42");
    expect(e?.id).toBe("42");
    const calledUrl = String(fakeFetch.mock.calls[0]![0]);
    expect(decodeURIComponent(calledUrl)).toContain('"_id":"42"');
  });

  it("supports resourceIds override", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, result: { records: [] } }), { status: 200 }),
    );
    const f = new LiveCkanFetcher({
      fetch: fakeFetch as unknown as typeof fetch,
      resourceIds: { entidades: "custom-id" },
    });
    await f.search({});
    expect(String(fakeFetch.mock.calls[0]![0])).toContain("resource_id=custom-id");
  });

  it("fails loud on a success:true body whose records isn't an array", async () => {
    // A malformed 200 (records not an array) must not be coerced into an empty
    // result set — it throws instead.
    const fakeFetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, result: { records: "oops" } }), {
        status: 200,
      }),
    );
    const f = new LiveCkanFetcher({ fetch: fakeFetch as unknown as typeof fetch });
    await expect(f.search({})).rejects.toThrow(/shape invalid/i);
  });
});
