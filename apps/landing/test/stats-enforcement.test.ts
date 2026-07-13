import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_TOOLS,
  PUBLISHED_PACKAGE_NAMES,
  PUBLISHED_PACKAGES,
} from "../src/lib/stats";

/**
 * DRIFT GUARD for the package/tool counts shown across the site.
 *
 * lib/stats.ts is supposed to be the single source of truth (PLAN.md), but most
 * pages hand-write "39 packages" / "245 tools" as literal copy instead of
 * importing the constants. That copy has drifted three times already
 * (33 -> 37 -> 39 packages; 221 -> 235 -> 243 -> 245 tools) because nothing
 * caught it. This test has two independent jobs:
 *
 *   1. Derive the TRUE counts the same way reality does (packages/*\/package.json
 *      that are published, tools.manifest.json entries summed) and assert
 *      lib/stats.ts matches. If someone publishes a package or ships a tool
 *      without bumping stats.ts, this fails.
 *
 *   2. Grep every page + public/ file for a bare "<number> packages/tools/..."
 *      claim and assert each one is either the current true value, or an
 *      explicitly justified entry in HISTORICAL_ALLOWLIST below (a frozen
 *      historical count, or a verified per-package/subset count that is not
 *      the site aggregate). Anything else fails loudly, naming the file and
 *      the exact matched string, so a new "39" that quietly becomes "40"
 *      somewhere can't slip in silently again.
 *
 * Pure fs + regex, no build, no network. Should run in well under a second.
 */

const APP_ROOT = join(import.meta.dirname, "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");

// ---------------------------------------------------------------------------
// Part 1: derive the true counts the way reality does, and check stats.ts
// ---------------------------------------------------------------------------

interface PackageJson {
  name?: string;
  private?: boolean;
}

/** packages/*\/package.json dirs that exist and are not "private": true. */
function findPublishedPackages(): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = join(PACKAGES_DIR, entry.name, "package.json");
    if (!existsSync(pkgJsonPath)) continue; // e.g. python-incorporate: Python-only, no package.json
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as PackageJson;
    if (pkg.private === true) continue;
    if (pkg.name) names.push(pkg.name);
  }
  return names.sort();
}

interface ToolsManifest {
  tools?: unknown[];
}

/** Sum of every packages/*\/tools.manifest.json "tools" array length. */
function countCanonicalTools(): number {
  let total = 0;
  for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(PACKAGES_DIR, entry.name, "tools.manifest.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ToolsManifest;
    total += Array.isArray(manifest.tools) ? manifest.tools.length : 0;
  }
  return total;
}

describe("lib/stats.ts matches reality", () => {
  const realPackages = findPublishedPackages();
  const realToolCount = countCanonicalTools();

  it("PUBLISHED_PACKAGE_NAMES is exactly the set of non-private packages/*/package.json names", () => {
    expect(
      [...PUBLISHED_PACKAGE_NAMES].sort(),
      "lib/stats.ts PUBLISHED_PACKAGE_NAMES is out of sync with packages/*/package.json. " +
        "Add/remove the package name in lib/stats.ts (and update the count comment).",
    ).toEqual(realPackages);
  });

  it("PUBLISHED_PACKAGES equals the real published-package count", () => {
    expect(
      PUBLISHED_PACKAGES,
      `lib/stats.ts PUBLISHED_PACKAGES=${PUBLISHED_PACKAGES} but packages/ actually has ` +
        `${realPackages.length} published (non-private) packages. Update lib/stats.ts.`,
    ).toBe(realPackages.length);
  });

  it("CANONICAL_TOOLS equals the sum of every packages/*/tools.manifest.json", () => {
    expect(
      CANONICAL_TOOLS,
      `lib/stats.ts CANONICAL_TOOLS=${CANONICAL_TOOLS} but summing every ` +
        `packages/*/tools.manifest.json "tools" array gives ${realToolCount}. Update lib/stats.ts.`,
    ).toBe(realToolCount);
  });
});

// ---------------------------------------------------------------------------
// Part 2: grep the landing source + public/ for hand-written count claims
// ---------------------------------------------------------------------------

const SRC_DIR = join(APP_ROOT, "src");
const PUBLIC_DIR = join(APP_ROOT, "public");

// Excluded from the grep entirely, not via the allowlist below:
//   - lib/stats.ts is the SSOT itself, checked directly in Part 1. Its internal
//     comments narrate the drift history (e.g. "+2 tools" for wallet-cdp) and
//     are expected content, not something this guard should flag.
//   - manifests.generated.ts is produced by `pnpm regen-manifests` from
//     packages/*/tools.manifest.json descriptions. Staleness in a *generated*
//     file is the regen script's job (see package.json "check-manifests"),
//     not this guard's.
const EXCLUDED_FILES = new Set<string>([
  join(APP_ROOT, "src/lib/stats.ts"),
  join(APP_ROOT, "src/app/api/discovery/manifests.generated.ts"),
]);

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".md", ".txt", ".xml", ".vtt"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (SCAN_EXTENSIONS.has(extname(entry.name)) && !EXCLUDED_FILES.has(full)) {
      out.push(full);
    }
  }
  return out;
}

// Matches "<number> packages" / "<number> npm packages" / "<number> paquetes" /
// "<number> tools" / "<number> herramientas", number immediately (whitespace
// only, newlines included since JSX prose wraps) before the unit word.
// "npm packages" must be tried before "packages" so the fuller phrase wins.
const UNIT_RE = /(\d{1,4})\+?\s+(npm packages|paquetes|packages|herramientas|tools)\b/gi;

function isPackageUnit(unit: string): boolean {
  return /packages|paquetes/i.test(unit);
}

interface FoundMatch {
  /** Path relative to apps/landing, e.g. "src/app/timeline/page.tsx". */
  file: string;
  /** Normalized matched text, e.g. "37 npm packages". */
  text: string;
}

/**
 * Numbers that are legitimately NOT the site-wide package/tool total, so they
 * can never be "the true current value" and must be justified by hand. Two
 * flavors:
 *
 *  - HISTORICAL: frozen copy (a dated launch/milestone entry, a recorded
 *    video's narration) that described reality accurately on the day it was
 *    published and must stay exactly as published, not get silently bumped.
 *  - Per-package / subset counts: a specific package's own tool count (e.g.
 *    "@ar-agents/mercadopago, 89 tools") or a demo/comparison subset (e.g.
 *    "8 tools are HITL-gated", "a /play demo using 13 tools"). These are
 *    verified against packages/*\/tools.manifest.json (or, for /play, against
 *    the tool definitions in src/app/api/play/route.ts) as of the date below,
 *    and are expected to keep differing from PUBLISHED_PACKAGES/CANONICAL_TOOLS
 *    forever. If the underlying package's tool count changes, this specific
 *    entry (and the copy) needs a human to re-verify and update, which is why
 *    it is enumerated by hand rather than wildcarded away.
 *
 * Keyed by (file relative to apps/landing, exact normalized matched text).
 * Verified 2026-07-13 against PUBLISHED_PACKAGES=39 / CANONICAL_TOOLS=245.
 */
const HISTORICAL_ALLOWLIST: ReadonlyArray<{
  file: string;
  text: string;
  reason: string;
}> = [
  // --- Frozen historical launch/milestone copy ---
  {
    file: "public/feed.xml",
    text: "33 npm packages",
    reason: "2026-05-05 launch feed entry title, frozen at the count on launch day",
  },
  {
    file: "src/app/timeline/page.tsx",
    text: "37 npm packages",
    reason: "2026-05-05 timeline milestone entry title, frozen historical count",
  },
  {
    file: "src/app/timeline/page.tsx",
    text: "37 packages",
    reason: "same 2026-05-05 timeline milestone entry, body text",
  },
  {
    file: "public/video/sociedad-ia-demo.es.vtt",
    text: "33 paquetes",
    reason: "recorded video narration (VTT captions), frozen at the count when the demo was filmed",
  },
  {
    file: "public/video/sociedad-ia-demo.es.vtt",
    text: "221 herramientas",
    reason: "recorded video narration, frozen tool count at filming time",
  },
  {
    file: "public/video/sociedad-ia-demo.es.vtt",
    text: "6 paquetes",
    reason: "video narration names the 6 specific packages exercised by that demo run, not the site total",
  },
  {
    file: "src/app/sociedades-ia/content.tsx",
    text: "9 packages",
    reason:
      'narrates a specific past demo run ("9 packages ar-agents de los 16 disponibles"), a historical snapshot, not the current site total',
  },

  // --- Verified per-package tool counts (packages/*/tools.manifest.json) ---
  {
    file: "public/llms-full.txt",
    text: "89 tools",
    reason: "@ar-agents/mercadopago's own tool count",
  },
  {
    file: "public/llms-full.txt",
    text: "8 tools",
    reason: "count of @ar-agents/mercadopago tools gated behind requireConfirmation (HITL)",
  },
  {
    file: "public/llms-full.txt",
    text: "2 tools",
    reason: "@ar-agents/identity's own tool count",
  },
  {
    file: "public/llms-full.txt",
    text: "10 tools",
    reason: "@ar-agents/facturacion's own tool count",
  },
  {
    file: "public/llms-full.txt",
    text: "6 tools",
    reason: "@ar-agents/whatsapp and @ar-agents/shipping's own tool counts (both 6)",
  },
  {
    file: "public/llms-full.txt",
    text: "11 tools",
    reason: "@ar-agents/banking's own tool count",
  },
  {
    file: "public/llms-full.txt",
    text: "5 tools",
    reason: "@ar-agents/identity-attest's own tool count",
  },
  {
    file: "src/app/architecture/page.tsx",
    text: "2 tools",
    reason: "mermaid diagram: @ar-agents/identity's own tool count",
  },
  {
    file: "src/app/architecture/page.tsx",
    text: "4 tools",
    reason: "mermaid diagram: @ar-agents/firma-digital and @ar-agents/gde-tad's own tool counts (both 4)",
  },
  {
    file: "src/app/architecture/page.tsx",
    text: "5 tools",
    reason: "mermaid diagram: @ar-agents/identity-attest and @ar-agents/mi-argentina's own tool counts (both 5)",
  },
  {
    file: "src/app/architecture/page.tsx",
    text: "6 tools",
    reason: "mermaid diagram: @ar-agents/igj, boletin-oficial, whatsapp, shipping own tool counts (all 6)",
  },
  {
    file: "src/app/architecture/page.tsx",
    text: "10 tools",
    reason: "mermaid diagram: @ar-agents/facturacion's own tool count",
  },
  {
    file: "src/app/architecture/page.tsx",
    text: "11 tools",
    reason: "mermaid diagram: @ar-agents/banking's own tool count",
  },
  {
    file: "src/app/architecture/page.tsx",
    text: "14 tools",
    reason: "mermaid diagram: @ar-agents/mercadolibre's own tool count",
  },
  {
    file: "src/app/architecture/page.tsx",
    text: "89 tools",
    reason: "mermaid diagram: @ar-agents/mercadopago's own tool count",
  },
  {
    file: "src/app/architecture/page.tsx",
    text: "6 packages",
    reason: 'composition-flow diagram caption ("8 tool calls across 6 packages"), a worked example, not the site total',
  },
  {
    file: "src/app/docs/page.tsx",
    text: "89 tools",
    reason: "@ar-agents/mercadopago's own tool count",
  },
  {
    file: "src/app/layout.tsx",
    text: "89 tools",
    reason: "JSON-LD description: @ar-agents/mercadopago's own tool count",
  },
  {
    file: "src/app/manifiesto/content.tsx",
    text: "89 tools",
    reason: "PACKAGES_BLOCK: @ar-agents/mercadopago's own tool count",
  },
  {
    file: "src/app/manifiesto/content.tsx",
    text: "14 tools",
    reason: "PACKAGES_BLOCK: @ar-agents/mercadolibre's own tool count",
  },
  {
    file: "src/app/i18n.tsx",
    text: "11 tools",
    reason: "@ar-agents/banking's own tool count (ES + EN copy)",
  },
  {
    file: "src/app/i18n.tsx",
    text: "13 packages",
    reason: "@ar-agents/mcp bundles 13 tool-bearing subpackages (its package.json dependencies, excluding @ar-agents/core)",
  },
  {
    file: "src/app/i18n.tsx",
    text: "8 tools",
    reason: "count of tools that modify state irreversibly and require HITL confirmation",
  },
  {
    file: "src/app/al-ministro/content.tsx",
    text: "6 paquetes",
    reason: "demo-video description naming the 6 specific packages exercised by that run, not the site total",
  },
  {
    file: "src/app/video/page.tsx",
    text: "6 paquetes",
    reason: "demo-video description naming the 6 specific packages exercised by that run, not the site total",
  },
  {
    file: "src/app/vs/page.tsx",
    text: "8 tools",
    reason: "competitor-comparison table cell: count of HITL-gated tools, not the site total",
  },
  {
    file: "src/app/playbook/page.tsx",
    text: "8 tools",
    reason: 'HITL section lists the 8 irreversible tools by name (refund_payment, cancel_subscription, ...)',
  },
  {
    file: "src/app/es/playbook/page.tsx",
    text: "8 tools",
    reason: "Spanish copy of the same HITL section, same 8 named tools",
  },
  {
    file: "src/app/examples/page.tsx",
    text: "5 packages",
    reason: 'cookbook recipe title ("Cross-package billing, 5 packages, one agent loop"), a specific recipe, not the site total',
  },

  // --- The /play demo's own tool count, verified against the `tools` object
  //     in src/app/api/play/route.ts (13 named tool definitions). This exact
  //     "12 tools" -> "13 tools" mismatch was the drift this guard caught on
  //     first run, see the test file history / PR description. ---
  {
    file: "src/app/getting-started/page.tsx",
    text: "13 tools",
    reason: "/play demo's own tool count (src/app/api/play/route.ts defines 13 tools)",
  },
  {
    file: "src/app/play/play-client.tsx",
    text: "13 tools",
    reason: "/play demo's own tool count",
  },
  {
    file: "src/app/play/opengraph-image.tsx",
    text: "13 tools",
    reason: "/play demo's own tool count",
  },
  {
    file: "src/app/press-kit/page.tsx",
    text: "13 tools",
    reason: "/play demo's own tool count",
  },
  {
    file: "src/app/api/discovery/route.ts",
    text: "13 tools",
    reason: "/play demo's own tool count, in the OpenAPI summary + description",
  },
];

function findMatches(files: string[]): FoundMatch[] {
  const matches: FoundMatch[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const rel = relative(APP_ROOT, file);
    for (const m of content.matchAll(UNIT_RE)) {
      const start = m.index ?? 0;
      // Skip "Vercel AI SDK 6 tools": the "6" is the SDK's major version, not a
      // tool count. It happens to sit directly before the word "tools".
      const before = content.slice(Math.max(0, start - 6), start);
      if (/SDK\s*$/.test(before)) continue;
      matches.push({ file: rel, text: m[0].replace(/\s+/g, " ") });
    }
  }
  return matches;
}

describe("no hand-written package/tool count drifts from lib/stats.ts", () => {
  const files = [...walk(SRC_DIR), ...walk(PUBLIC_DIR)];
  const matches = findMatches(files);
  const allowlistKey = (file: string, text: string) => `${file}::${text}`;
  const allowlistSet = new Set(
    HISTORICAL_ALLOWLIST.map((e) => allowlistKey(e.file, e.text)),
  );

  it("found at least one package/tool mention (sanity: the scan isn't silently empty)", () => {
    expect(matches.length).toBeGreaterThan(20);
  });

  it("every matched count is either the true current value or an allowlisted exception", () => {
    const offenders = matches.filter((m) => {
      const num = Number.parseInt(m.text, 10);
      const isPkg = isPackageUnit(m.text);
      const trueValue = isPkg ? PUBLISHED_PACKAGES : CANONICAL_TOOLS;
      if (num === trueValue) return false;
      return !allowlistSet.has(allowlistKey(m.file, m.text));
    });

    if (offenders.length > 0) {
      const lines = offenders
        .map((o) => `  ${o.file}: "${o.text}"`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} package/tool count(s) that match neither the current ` +
          `truth (PUBLISHED_PACKAGES=${PUBLISHED_PACKAGES}, CANONICAL_TOOLS=${CANONICAL_TOOLS}) ` +
          `nor HISTORICAL_ALLOWLIST in test/stats-enforcement.test.ts:\n${lines}\n\n` +
          `If this is real drift, fix the copy (or lib/stats.ts if reality moved). ` +
          `If it's a legitimate non-total count (a specific package's own tool count, a demo ` +
          `subset, a frozen historical entry), add it to HISTORICAL_ALLOWLIST with a reason.`,
      );
    }
  });

  it("HISTORICAL_ALLOWLIST has no stale entries (every entry still matches something on disk)", () => {
    const foundSet = new Set(matches.map((m) => allowlistKey(m.file, m.text)));
    const stale = HISTORICAL_ALLOWLIST.filter(
      (e) => !foundSet.has(allowlistKey(e.file, e.text)),
    );
    expect(
      stale,
      `These HISTORICAL_ALLOWLIST entries no longer match any text on disk (the copy was ` +
        `fixed/removed, or the file moved) and should be deleted from the allowlist:\n` +
        stale.map((e) => `  ${e.file}: "${e.text}"`).join("\n"),
    ).toEqual([]);
  });
});
