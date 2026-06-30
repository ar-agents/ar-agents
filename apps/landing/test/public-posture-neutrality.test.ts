import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET as discoveryGet } from "../src/app/api/discovery/route";
import { openApiSpec } from "../src/lib/openapi-spec";

/**
 * PUBLIC POSTURE guard (PLAN.md HARD RULE). The public face is tight-lipped and
 * neutral: the internal capture/monopoly thesis and the INTERNAL shadow-onboarding
 * metric must NEVER appear in any served machine surface (agents.json, /api/discovery
 * JSON + OpenAPI, ai-plugin.json, llms.txt) or in the public page copy. Admin-only
 * surfaces (/api/admin/*) must likewise never be advertised. This test locks both
 * invariants so a future edit can't silently re-leak the strategy.
 */

const ROOT = join(import.meta.dirname, "..");
const PUBLIC = join(ROOT, "public");

function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8");
}

// Phrases that reveal the internal capture/monopoly thesis or internal machinery.
// Matched case-insensitively as substrings against SERVED text.
const FORBIDDEN = [
  "run-rate",
  "run rate",
  "1 billion",
  "usd 1 billion",
  "mil millones",
  "value captured",
  "valor capturado",
  "value capture",
  "captura de valor",
  "monopoly",
  "monopolio",
  "shadow-onboarding",
  "shadow onboarding",
  "shadow metric",
  "shadow-metric",
  "latent-demand",
  "latent demand",
  "/api/admin",
  "land-grab",
];

function assertClean(label: string, text: string): void {
  const lower = text.toLowerCase();
  for (const term of FORBIDDEN) {
    expect(
      lower.includes(term.toLowerCase()),
      `${label} must not contain forbidden term "${term}"`,
    ).toBe(false);
  }
}

describe("served machine surfaces are neutral (no capture / shadow / admin language)", () => {
  it("agents.json is clean", () => {
    assertClean(".well-known/agents.json", read("public/.well-known/agents.json"));
  });

  it("ai-plugin.json is clean", () => {
    assertClean(".well-known/ai-plugin.json", read("public/.well-known/ai-plugin.json"));
  });

  it("llms.txt + llms-full.txt are clean", () => {
    assertClean("llms.txt", read("public/llms.txt"));
    assertClean("llms-full.txt", read("public/llms-full.txt"));
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

  it("the shared /api/openapi spec is clean", () => {
    assertClean("openapi-spec", JSON.stringify(openApiSpec));
  });
});

describe("the capture-language page is scrubbed (HARD-RULE breach removed)", () => {
  // /economia-del-regimen rendered "USD 1 billion run-rate" + "value captured by
  // jurisdiction". The route stays reachable but the content is de-listed AND the
  // capture language is gone even on the (now noindexed) page.
  const econ = read("src/app/economia-del-regimen/content.tsx");
  const econPage = read("src/app/economia-del-regimen/page.tsx");
  const enEconPage = read("src/app/en/regime-economics/page.tsx");

  it("economia content carries no run-rate / billion / value-capture copy", () => {
    assertClean("economia-del-regimen/content.tsx", econ);
  });

  it("economia + en page metadata carry no capture copy", () => {
    assertClean("economia-del-regimen/page.tsx", econPage);
    assertClean("en/regime-economics/page.tsx", enEconPage);
  });
});

describe("demoted strategy/movement pages are noindexed (demote-not-delete)", () => {
  const demoted = [
    "manifiesto",
    "al-ministro",
    "gobierno",
    "economia-del-regimen",
    "data-room",
    "press-kit",
    "share",
    "co-firmar",
    "timeline",
    "highlights",
    "notes",
    "case-studies/astro",
    "vs",
    "vs-on-chain",
    "marketplace",
    "jurisdicciones",
    "en/manifesto",
    "en/to-the-minister",
    "en/government",
    "en/regime-economics",
    "en/co-sign",
    "en/vs-on-chain",
    "en/jurisdictions",
  ];

  for (const p of demoted) {
    it(`/${p} sets robots noindex`, () => {
      const src = read(`src/app/${p}/page.tsx`);
      // either NOINDEX helper or an explicit index:false robots literal
      const noindexed =
        /robots:\s*NOINDEX/.test(src) || /index:\s*false/.test(src);
      expect(noindexed, `/${p} page.tsx must mark robots noindex`).toBe(true);
    });
  }

  it("demoted pages are absent from sitemap.xml", () => {
    const sitemap = read("public/sitemap.xml");
    const mustBeGone = [
      "/manifiesto",
      "/al-ministro",
      "/gobierno",
      "/economia-del-regimen",
      "/data-room",
      "/press-kit",
      "/share",
      "/timeline",
      "/highlights",
      "/notes",
      "/marketplace",
      "/jurisdicciones",
      "/vs-on-chain",
      "/case-studies/astro",
    ];
    for (const loc of mustBeGone) {
      expect(
        sitemap.includes(`<loc>https://ar-agents.ar${loc}</loc>`),
        `sitemap must not list demoted page ${loc}`,
      ).toBe(false);
    }
  });

  it("nav + home no longer link the demoted movement pages", () => {
    const nav = read("src/app/nav.tsx");
    const home = read("src/app/page.tsx");
    expect(nav.includes("/manifiesto")).toBe(false);
    expect(home.includes('href="/manifiesto"')).toBe(false);
    expect(home.includes('href="/press-kit"')).toBe(false);
  });
});

describe("PUBLIC is also free of em dashes in the served machine surfaces", () => {
  // Naza hard rule: no em dashes on the page. Guard the JSON/llms surfaces.
  for (const f of [
    "public/.well-known/agents.json",
    "public/.well-known/ai-plugin.json",
    "public/llms.txt",
  ]) {
    it(`${f} has no em dash`, () => {
      expect(read(f).includes("—"), `${f} must not contain an em dash`).toBe(false);
    });
  }
});

export { PUBLIC };
