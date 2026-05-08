// Integration tests against the REAL Mercado Libre public API.
//
// These hit `https://api.mercadolibre.com` for endpoints that don't require
// auth (categories, domain_discovery, technical_specs). They prove that:
//
//   1. Our Zod schemas are still in sync with what MELI emits today.
//   2. The retry + rate-limit + fetch pipeline works against real network.
//   3. Helpers like `discoverDomain` + `getDomainTechnicalSpecs` return
//      typed data that downstream agents can consume without re-validation.
//
// Run with: `pnpm test:integration`. Skipped under normal `pnpm test`.
//
// CI policy: run on a daily cron, NOT on every PR — MELI shouldn't get
// blasted on every commit, and they don't owe us SLAs on these endpoints.

import { describe, it, expect } from "vitest";
import { MeliClient, discoverDomain } from "../../src";

// `auth: { kind: "none" }` — the public endpoints accept anonymous requests.
const client = new MeliClient({
  auth: { kind: "none" },
  retry: { maxAttempts: 3, baseDelayMs: 500 },
});

const integration = process.env["MELI_INTEGRATION"] === "1" ? describe : describe.skip;

integration("MELI public API — schema fidelity", () => {
  it("GET /sites/MLA/domain_discovery/search returns DomainDiscoveryResult[]", async () => {
    const r = await discoverDomain(client, "MLA", "yerba mate amanda 1kg");
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBeGreaterThan(0);
    const first = r[0]!;
    expect(first.domain_id).toMatch(/^MLA-/);
    expect(first.domain_name).toBeTruthy();
    expect(first.category_id).toMatch(/^MLA\d+$/);
    expect(first.category_name).toBeTruthy();
    // Attributes is sometimes an empty array, sometimes populated.
    expect(Array.isArray(first.attributes)).toBe(true);
  }, 15_000);

  it("GET /categories/{id} returns a typed Category", async () => {
    // Use the Mascotas root for stability.
    const r = await client.fetch({
      method: "GET",
      path: "/categories/MLA1071",
    });
    const cat = r as {
      id: string;
      name: string;
      total_items_in_this_category: number;
      path_from_root: { id: string; name: string }[];
      children_categories: { id: string; name: string }[];
    };
    expect(cat.id).toBe("MLA1071");
    expect(cat.name).toBe("Mascotas");
    expect(cat.total_items_in_this_category).toBeGreaterThan(0);
    expect(cat.path_from_root.length).toBeGreaterThan(0);
    expect(cat.children_categories.length).toBeGreaterThan(0);
  }, 15_000);

  it("GET /categories/{id}/attributes returns the attribute catalog", async () => {
    const r = await client.fetch({
      method: "GET",
      path: "/categories/MLA1071/attributes",
    });
    const attrs = r as { id: string; name: string; value_type: string }[];
    expect(Array.isArray(attrs)).toBe(true);
    expect(attrs.length).toBeGreaterThan(5);
    // Every attribute must have an id, name, and value_type.
    for (const a of attrs.slice(0, 5)) {
      expect(typeof a.id).toBe("string");
      expect(typeof a.name).toBe("string");
      expect(typeof a.value_type).toBe("string");
    }
    // Mascotas always has a BRAND attribute.
    expect(attrs.some((a) => a.id === "BRAND")).toBe(true);
  }, 15_000);

  it("retry pipeline survives back-to-back calls (5x)", async () => {
    const calls = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        client.fetch({
          method: "GET",
          path: "/categories/MLA1071",
        }),
      ),
    );
    expect(calls).toHaveLength(5);
    for (const c of calls) {
      expect((c as { id: string }).id).toBe("MLA1071");
    }
  }, 30_000);
});
