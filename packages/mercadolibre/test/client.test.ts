import { describe, it, expect } from "vitest";
import { mockFetch, makeMeliClient } from "../src/testing";
import { MeliApiError, MeliValidationError } from "../src";
import { z } from "zod";

describe("MeliClient", () => {
  it("sends Bearer auth header on each request", async () => {
    const fm = mockFetch()
      .on("GET", "/users/me", () => ({ status: 200, body: { id: 42 } }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch, accessToken: "abc123" });
    await client.fetch({ method: "GET", path: "/users/me" });
    expect(fm.requests[0]?.headers["Authorization"]).toBe("Bearer abc123");
  });

  it("validates response body against the schema", async () => {
    const fm = mockFetch()
      .on("GET", "/x", () => ({ status: 200, body: { good: true } }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const schema = z.object({ good: z.boolean() });
    const r = await client.fetch({
      method: "GET",
      path: "/x",
      responseSchema: schema,
    });
    expect(r.good).toBe(true);
  });

  it("throws MeliValidationError on schema mismatch", async () => {
    const fm = mockFetch()
      .on("GET", "/x", () => ({ status: 200, body: { wrong: true } }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const schema = z.object({ required: z.string() });
    await expect(
      client.fetch({ method: "GET", path: "/x", responseSchema: schema }),
    ).rejects.toBeInstanceOf(MeliValidationError);
  });

  it("throws MeliApiError on 4xx after retries are exhausted", async () => {
    const fm = mockFetch()
      .on("GET", "/x", () => ({ status: 404, body: { error: "not_found" } }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    await expect(
      client.fetch({ method: "GET", path: "/x" }),
    ).rejects.toBeInstanceOf(MeliApiError);
  });

  it("retries on 500 and eventually succeeds", async () => {
    let calls = 0;
    const fm = mockFetch()
      .on("GET", "/flaky", () => {
        calls++;
        if (calls < 3) return { status: 500, body: { error: "boom" } };
        return { status: 200, body: { ok: true } };
      })
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await client.fetch<{ ok: boolean }>({
      method: "GET",
      path: "/flaky",
      retry: { baseDelayMs: 1 },
    });
    expect(r.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("attaches query params correctly", async () => {
    const fm = mockFetch()
      .onRegex("GET", /\/items$/, () => ({ status: 200, body: [] }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    await client.fetch({
      method: "GET",
      path: "/items",
      query: { ids: "MLA1,MLA2", offset: 10, includeNull: null, includeUndef: undefined },
    });
    const url = new URL(fm.requests[0]!.url);
    expect(url.searchParams.get("ids")).toBe("MLA1,MLA2");
    expect(url.searchParams.get("offset")).toBe("10");
    expect(url.searchParams.has("includeNull")).toBe(false);
    expect(url.searchParams.has("includeUndef")).toBe(false);
  });

  it("sends JSON body and Content-Type when body is provided", async () => {
    const fm = mockFetch()
      .on("POST", "/x", (req) => ({ status: 200, body: req.body }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    await client.fetch({
      method: "POST",
      path: "/x",
      body: { foo: "bar" },
    });
    expect(fm.requests[0]?.headers["Content-Type"]).toBe("application/json");
    expect(fm.requests[0]?.body).toEqual({ foo: "bar" });
  });
});
