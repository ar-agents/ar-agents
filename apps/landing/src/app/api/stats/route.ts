/**
 * GET /api/stats
 *
 * Single aggregate JSON of live numbers about ar-agents. Pulls:
 *   - npm download counts (last 30 days) per package from
 *     api.npmjs.org/downloads/point/last-month/<pkg>
 *   - GitHub stars/forks/open-issues from api.github.com/repos/...
 *   - Cookbook recipe count (filesystem)
 *   - vitest test count (rough, counts test files)
 *   - RFC count (filesystem)
 *   - JSON schema count (filesystem)
 *   - Frozen test-vectors files (filesystem)
 *   - Cert score for the reference impl (calls /api/certifier)
 *   - Live sociedades on /registro (hardcoded list, same as auto-monitor)
 *
 * Useful for any downstream that wants live numbers without re-implementing
 * the data-room page logic. ETag + Cache-Control set so repeated calls in
 * a short window are cheap.
 *
 * Node runtime (uses fs). Revalidates on demand; cached 6h.
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const revalidate = 21600; // 6h

const SITE = "https://ar-agents.ar";

// All 33 published @ar-agents/* packages (31 ship tools.manifest.json; core +
// incorporate are libraries without a tool surface). Keep in sync with
// packages/ — /api/discovery derives its own list dynamically at build time.
const PACKAGES = [
  "@ar-agents/aduana",
  "@ar-agents/agentic-commerce-bridge",
  "@ar-agents/anses",
  "@ar-agents/ap2",
  "@ar-agents/banking",
  "@ar-agents/banking-bcra",
  "@ar-agents/boletin-oficial",
  "@ar-agents/cnv-emisor",
  "@ar-agents/constancia",
  "@ar-agents/core",
  "@ar-agents/dnrpa",
  "@ar-agents/facturacion",
  "@ar-agents/firma-digital",
  "@ar-agents/gde-tad",
  "@ar-agents/identity",
  "@ar-agents/identity-attest",
  "@ar-agents/igj",
  "@ar-agents/iibb",
  "@ar-agents/incorporate",
  "@ar-agents/inpi",
  "@ar-agents/iva-percepciones",
  "@ar-agents/iva-retenciones",
  "@ar-agents/mcp",
  "@ar-agents/mercadolibre",
  "@ar-agents/mercadopago",
  "@ar-agents/mi-argentina",
  "@ar-agents/shipping",
  "@ar-agents/sicore",
  "@ar-agents/suss",
  "@ar-agents/tienda-nube",
  "@ar-agents/uala",
  "@ar-agents/whatsapp",
  "@ar-agents/wscdc",
];

const REGISTRY_URLS = [
  "https://ar-agents.ar",
  "https://mp-hello.ar-agents.ar",
  "https://cuit-hello.ar-agents.ar",
  "https://whatsapp-hello.ar-agents.ar",
  "https://bridge-hello.ar-agents.ar",
];

interface Stats {
  $schema: string;
  generatedAt: string;
  cachedFor: "6h";
  npm: {
    packagesCount: number;
    totalDownloadsLast30d: number;
    perPackage: Record<string, number>;
  };
  github: {
    stars: number;
    forks: number;
    openIssues: number;
    url: string;
    /** Present when the GitHub API call failed (rate-limit, network, etc). */
    error?: string;
  };
  artifacts: {
    rfcsCount: number;
    schemasCount: number;
    testVectorsCount: number;
    cookbookRecipesCount: number;
    testFilesCount: number;
  };
  conformance: {
    referenceScore: number;
    referenceRating: string;
    liveSociedadesCount: number;
    liveSociedades100Count: number;
  };
}

async function fetchOk(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response | null> {
  const { timeoutMs, ...rest } = (init ?? {}) as RequestInit & { timeoutMs?: number };
  try {
    const r = await fetch(url, {
      ...rest,
      signal: AbortSignal.timeout(timeoutMs ?? 5000),
      headers: {
        "user-agent": "ar-agents-api-stats",
        ...(rest.headers ?? {}),
      },
    });
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

async function npmStats(): Promise<Stats["npm"]> {
  const perPackage: Record<string, number> = {};
  let total = 0;
  await Promise.all(
    PACKAGES.map(async (pkg) => {
      const r = await fetchOk(`https://api.npmjs.org/downloads/point/last-month/${pkg}`);
      if (!r) return;
      const d = (await r.json()) as { downloads?: number };
      const dl = typeof d.downloads === "number" ? d.downloads : 0;
      perPackage[pkg] = dl;
      total += dl;
    }),
  );
  return {
    packagesCount: PACKAGES.length,
    totalDownloadsLast30d: total,
    perPackage,
  };
}

async function githubStats(): Promise<Stats["github"]> {
  const url = "https://api.github.com/repos/ar-agents/ar-agents";
  // GitHub recommends using a Personal Access Token (PAT) in
  // GITHUB_TOKEN env to lift the 60 req/hr unauthenticated cap to
  // 5000 req/hr. Falls back gracefully without one.
  const token = process.env.GITHUB_TOKEN?.trim();
  const r = await fetchOk(url, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  const fallback = {
    stars: 0,
    forks: 0,
    openIssues: 0,
    url: "https://github.com/ar-agents/ar-agents",
  };
  if (!r) {
    // Surface the failure explicitly so the stats consumer can
    // distinguish "zero stars" from "fetch failed". Without this the
    // stats look healthy even when the GitHub call rate-limited or
    // network-errored.
    return { ...fallback, error: "github_api_unreachable" };
  }
  const d = (await r.json()) as {
    stargazers_count?: number;
    forks_count?: number;
    open_issues_count?: number;
    html_url?: string;
  };
  return {
    stars: d.stargazers_count ?? 0,
    forks: d.forks_count ?? 0,
    openIssues: d.open_issues_count ?? 0,
    url: d.html_url ?? fallback.url,
  };
}

async function countFilesIn(dir: string, predicate: (name: string) => boolean): Promise<number> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter(predicate).length;
  } catch {
    return 0;
  }
}

async function artifactCounts(): Promise<Stats["artifacts"]> {
  const root = path.resolve(process.cwd(), "..", "..");
  const [rfcsCount, schemasCount, testVectorsCount, recipesCount, testFilesCount] =
    await Promise.all([
      // RFCs: count subdirs in apps/landing/src/app/rfcs/
      countFilesIn(
        path.join(root, "apps/landing/src/app/rfcs"),
        (n) => /^\d{3}$/.test(n),
      ),
      // Schemas: count *.json in apps/landing/public/schemas/
      countFilesIn(
        path.join(root, "apps/landing/public/schemas"),
        (n) => n.endsWith(".v1.json"),
      ),
      // Test-vectors: count rfc-*-v*.json in apps/landing/public/test-vectors/
      countFilesIn(
        path.join(root, "apps/landing/public/test-vectors"),
        (n) => /^rfc-\d{3}-v\d+\.json$/.test(n),
      ),
      // Cookbook recipes: count NN-*.ts in packages/mercadopago/cookbook/
      countFilesIn(
        path.join(root, "packages/mercadopago/cookbook"),
        (n) => /^\d{2}-.*\.ts$/.test(n),
      ),
      // Test files: count *.test.ts in apps/landing/test/
      countFilesIn(
        path.join(root, "apps/landing/test"),
        (n) => n.endsWith(".test.ts"),
      ),
    ]);
  return {
    rfcsCount,
    schemasCount,
    testVectorsCount,
    cookbookRecipesCount: recipesCount,
    testFilesCount,
  };
}

async function conformanceStats(): Promise<Stats["conformance"]> {
  // Self-score. The certifier itself makes ~11 sub-fetches with 8s each,
  // so give it a generous timeout here.
  const selfR = await fetchOk(`${SITE}/api/certifier?url=${encodeURIComponent(SITE)}`, {
    timeoutMs: 15000,
  });
  const self = selfR ? ((await selfR.json()) as { score?: number; rating?: string }) : null;
  // Other sociedades, count those at 100.
  const others = await Promise.all(
    REGISTRY_URLS.filter((u) => u !== SITE).map(async (url) => {
      const r = await fetchOk(
        `${SITE}/api/certifier?url=${encodeURIComponent(url)}`,
        { timeoutMs: 15000 },
      );
      if (!r) return 0;
      const d = (await r.json()) as { score?: number };
      return typeof d.score === "number" ? d.score : 0;
    }),
  );
  const allScores = [self?.score ?? 0, ...others];
  const at100 = allScores.filter((s) => s === 100).length;
  return {
    referenceScore: self?.score ?? 0,
    referenceRating: self?.rating ?? "?",
    liveSociedadesCount: REGISTRY_URLS.length,
    liveSociedades100Count: at100,
  };
}

export async function GET(): Promise<Response> {
  const [npm, github, artifacts, conformance] = await Promise.all([
    npmStats(),
    githubStats(),
    artifactCounts(),
    conformanceStats(),
  ]);

  const stats: Stats = {
    $schema: `${SITE}/schemas/stats.v1.json`,
    generatedAt: new Date().toISOString(),
    cachedFor: "6h",
    npm,
    github,
    artifacts,
    conformance,
  };

  return NextResponse.json(stats, {
    headers: {
      "cache-control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
