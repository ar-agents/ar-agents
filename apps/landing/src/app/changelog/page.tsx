import type { Metadata } from "next";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "/changelog · all 36 packages",
  description:
    "Auto-aggregated CHANGELOG entries across every @ar-agents/* package. Newest releases first. SLSA v1 npm provenance attestation tags.",
  alternates: { canonical: "https://ar-agents.ar/changelog" },
};

// Run at build time + revalidate hourly so freshly-released packages
// surface within an hour without rebuilds.
export const revalidate = 3600;

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";

const PACKAGES = [
  "identity",
  "identity-attest",
  "mi-argentina",
  "firma-digital",
  "gde-tad",
  "mercadopago",
  "mercadolibre",
  "banking",
  "facturacion",
  "igj",
  "boletin-oficial",
  "whatsapp",
  "shipping",
  "agentic-commerce-bridge",
  "ap2",
  "mcp",
  "incorporate",
];

interface Release {
  pkg: string;
  version: string;
  body: string;
}

async function loadReleases(): Promise<Release[]> {
  const releases: Release[] = [];
  const monorepoRoot = path.resolve(process.cwd(), "..", "..");
  for (const pkg of PACKAGES) {
    const file = path.join(monorepoRoot, "packages", pkg, "CHANGELOG.md");
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      continue; // package without a changelog yet
    }
    // Parse "## X.Y.Z\n\n<body>" sections.
    const sections = raw.split(/^## /m).slice(1);
    for (const sec of sections) {
      const firstLineEnd = sec.indexOf("\n");
      const version = sec.slice(0, firstLineEnd).trim();
      // Skip "Changelog" or other non-version headings.
      if (!/^\d+\.\d+\.\d+/.test(version)) continue;
      const body = sec.slice(firstLineEnd + 1).trim();
      releases.push({ pkg, version, body });
    }
  }
  // Sort: highest semver per package first, then by package name. Releases
  // within a package retain the order CHANGELOG.md gave them (newest first
  // is the Changesets convention).
  return releases;
}

export default async function ChangelogPage() {
  const releases = await loadReleases();

  // Group by package for the layout.
  const byPackage = new Map<string, Release[]>();
  for (const r of releases) {
    const list = byPackage.get(r.pkg) ?? [];
    list.push(r);
    byPackage.set(r.pkg, list);
  }

  return (
    <DocShell
      eyebrow="changelog · all packages"
      title="Changelog."
      subtitle="Aggregated CHANGELOG entries across every @ar-agents/* package. Auto-pulled from each package's CHANGELOG.md at build (revalidate hourly). For full release history per package, see github.com/ar-agents/ar-agents."
    >
      <DocBlock>
        <DocP>
          Cada package ship CHANGELOG.md generado por Changesets. Esta
          página los agrega para un overview cross-package. Los releases
          van en orden CHANGELOG (newest first per package) y los packages
          en orden alfabético.
        </DocP>
        <DocP>
          Para verificar provenance:{" "}
          <DocCode>npm view @ar-agents/{`<pkg>`} dist.attestations</DocCode>{" "}
          devuelve la entrada Sigstore del tarball ↔ commit GitHub ↔ runner.
        </DocP>
      </DocBlock>

      {Array.from(byPackage.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pkg, list]) => (
          <section key={pkg} id={pkg} style={{ marginBottom: 32 }}>
            <DocH2>
              <a
                href={`#${pkg}`}
                style={{ color: "inherit", textDecoration: "none" }}
              >
                <code style={{ fontFamily: FONT_MONO, fontSize: 18 }}>
                  @ar-agents/{pkg}
                </code>
                <span
                  style={{
                    marginLeft: 10,
                    fontSize: 12,
                    fontFamily: FONT_MONO,
                    color: "var(--text-muted)",
                    fontWeight: 400,
                  }}
                >
                  · {list.length} {list.length === 1 ? "release" : "releases"}
                </span>
              </a>
            </DocH2>
            <div style={{ display: "grid", gap: 8 }}>
              {list.map((r) => (
                <article
                  key={`${pkg}-${r.version}`}
                  style={{
                    background: "var(--bg)",
                    padding: "12px 14px",
                    borderRadius: 6,
                    boxShadow: SHADOW_BORDER,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 12,
                      marginBottom: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <code
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 13,
                        color: "var(--accent)",
                        fontWeight: 600,
                      }}
                    >
                      v{r.version}
                    </code>
                    <a
                      href={`https://www.npmjs.com/package/@ar-agents/${pkg}/v/${r.version}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 11,
                        fontFamily: FONT_MONO,
                        color: "var(--text-muted)",
                      }}
                    >
                      npm ↗
                    </a>
                  </div>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      margin: 0,
                      fontFamily:
                        "var(--font-geist-sans), Arial, sans-serif",
                      fontSize: 13,
                      color: "var(--text-body)",
                      lineHeight: 1.55,
                    }}
                  >
                    {r.body}
                  </pre>
                </article>
              ))}
            </div>
          </section>
        ))}

      {byPackage.size === 0 && (
        <DocBlock>
          <DocP>
            No CHANGELOG.md files were found at build time. This usually
            means the build is running outside the monorepo. Check{" "}
            <a
              href="https://github.com/ar-agents/ar-agents/tree/main/packages"
              style={{ color: "var(--accent)" }}
            >
              the source tree
            </a>{" "}
            for per-package release history.
          </DocP>
        </DocBlock>
      )}

      <DocH2>Where to track releases live</DocH2>
      <DocP>
        Releases are tagged in git as{" "}
        <code style={{ fontFamily: FONT_MONO }}>
          @ar-agents/{`{pkg}`}@{`{version}`}
        </code>
        . Subscribe to{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/releases"
          style={{ color: "var(--accent)" }}
        >
          the GitHub releases feed
        </a>{" "}
        for push notifications, or watch{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/blob/main/.github/workflows/release.yml"
          style={{ color: "var(--accent)" }}
        >
          release.yml
        </a>{" "}
        for the publish flow.
      </DocP>
    </DocShell>
  );
}
