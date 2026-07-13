import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET as discoveryGet } from "../src/app/api/discovery/route";

/**
 * PRICING POSTURE guard (founder's hard rule, 2026-07-13). The pricing MODEL
 * stays public ("gratis hasta que factura, después precio por uso"). The
 * pricing MECHANICS (the multiplier, cost-plus framing, a worked
 * cost-vs-price example) are private: no public surface (rendered pages,
 * source of those pages, or machine-readable surfaces) may state them.
 * Mirrors the public-posture-neutrality.test.ts pattern for the earlier
 * capture/monopoly-thesis leak.
 */

const ROOT = join(import.meta.dirname, "..");

function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8");
}

// Phrases that reveal the pricing MECHANICS rather than just the MODEL.
// Matched case-insensitively as substrings.
const FORBIDDEN = [
  "5x",
  "5 veces",
  "5 times",
  "five times",
  "cinco veces",
  "multiplicador",
  "multiplier",
  "costo de los tokens", // the worked-example phrasing, not the generic "token cost" concept
  "cost-plus",
];

function assertClean(label: string, text: string): void {
  const lower = text.toLowerCase();
  for (const term of FORBIDDEN) {
    expect(
      lower.includes(term.toLowerCase()),
      `${label} must not contain pricing-mechanics term "${term}"`,
    ).toBe(false);
  }
}

describe("pricing MECHANICS never leak on a public surface", () => {
  it("/precios (es) source is clean", () => {
    assertClean("precios/content.tsx", read("src/app/precios/content.tsx"));
    assertClean("precios/page.tsx", read("src/app/precios/page.tsx"));
  });

  it("/en/pricing source is clean", () => {
    assertClean("en/pricing/page.tsx", read("src/app/en/pricing/page.tsx"));
  });

  it("home page pricing line is clean", () => {
    assertClean("page.tsx", read("src/app/page.tsx"));
  });

  it("/api/discovery JSON is clean", async () => {
    const res = await discoveryGet(new Request("https://ar-agents.ar/api/discovery"));
    assertClean("/api/discovery (json)", JSON.stringify(await res.json()));
  });

  it("/api/discovery?format=openapi is clean", async () => {
    const res = await discoveryGet(
      new Request("https://ar-agents.ar/api/discovery?format=openapi"),
    );
    assertClean("/api/discovery (openapi)", JSON.stringify(await res.json()));
  });

  it("agents.json + llms.txt are clean", () => {
    assertClean(".well-known/agents.json", read("public/.well-known/agents.json"));
    assertClean("llms.txt", read("public/llms.txt"));
  });
});

describe("the pricing MODEL still reads honestly (free then usage-based)", () => {
  it("/precios states free-to-build and usage-based, in both languages", () => {
    const content = read("src/app/precios/content.tsx").toLowerCase();
    expect(content).toContain("gratis");
    expect(content).toContain("free");
    expect(content).toMatch(/por uso|usage-based/);
  });
});
