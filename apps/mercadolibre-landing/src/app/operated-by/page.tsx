import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Operated by — @ar-agents/mercadolibre",
  description:
    "Vendor security questionnaire pre-filled. Honest answers about legal, SLA, incident response, SBOM, bus factor.",
};

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

export default function OperatedByPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: FONT_SANS,
        color: "var(--text)",
        padding: "80px 24px 120px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            textDecoration: "underline",
            textUnderlineOffset: 4,
          }}
        >
          ← back to landing
        </Link>

        <header style={{ margin: "32px 0 28px" }}>
          <h1
            style={{
              fontSize: "clamp(34px, 7vw, 44px)",
              margin: 0,
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: "-0.04em",
            }}
          >
            Operated by
          </h1>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.55,
              color: "var(--text-body)",
              maxWidth: 720,
              margin: "16px 0 0",
            }}
          >
            A vendor questionnaire, pre-filled. Adopt this package only if the
            answers below match your bar — every line is honest, even when the
            answer is uncomfortable.
          </p>
        </header>

        <Section title="1. Legal / Identity">
          <Row k="Project name" v="@ar-agents/mercadolibre" />
          <Row k="Author / sole maintainer" v="Nazareno Clemente (Argentina)" />
          <Row
            k="Legal entity"
            v="None. Sole proprietorship under personal CUIT 20-41758101-5 (monotributista categoría A)."
          />
          <Row k="Jurisdiction" v="Argentine Republic" />
          <Row k="License" v="MIT (SPDX: MIT)" />
          <Row
            k="Trademarks"
            v="MERCADOLIBRE® is a registered trademark of Mercado Libre S.R.L. The package name uses it in a descriptive, nominative-fair-use sense to identify the API. No license, endorsement, or commercial relationship exists or is claimed."
          />
          <Row k="Repository" v={<Link2 href="https://github.com/ar-agents/ar-agents/tree/main/packages/mercadolibre">github.com/ar-agents/ar-agents</Link2>} />
          <Row k="npm" v={<Link2 href="https://www.npmjs.com/package/@ar-agents/mercadolibre">@ar-agents/mercadolibre</Link2>} />
        </Section>

        <Section title="2. Contact + Disclosure">
          <Row k="General contact" v={<Link2 href="mailto:naza@helloastro.co">naza@helloastro.co</Link2>} />
          <Row
            k="Security disclosures"
            v={
              <span>
                Email{" "}
                <Link2 href="mailto:naza@helloastro.co?subject=%5Bsecurity%5D">
                  naza@helloastro.co
                </Link2>{" "}
                with subject prefix <code>[security]</code>. PGP / age-encryption available on request.
              </span>
            }
          />
          <Row k="First-response target" v="72 hours (best-effort, no SLA)" />
          <Row k="Coordinated disclosure window" v="30 days minimum" />
          <Row k="Bug bounty" v="None. Reports are credited; not paid." />
          <Row
            k="Public security policy"
            v={<Link2 href="https://github.com/ar-agents/ar-agents/blob/main/packages/mercadolibre/SECURITY.md">SECURITY.md</Link2>}
          />
        </Section>

        <Section title="3. SLA / Incident Response">
          <Row k="Production SLA" v="None. Best-effort community support." />
          <Row k="Incident response runbook" v="None published. Single maintainer triage; coordinated disclosure window enforced." />
          <Row k="Status page" v="None. Track via GitHub releases + npm publish history." />
          <Row k="Rollback procedure" v={<span>Pin a specific version (not <code>latest</code>). Use <code>npm deprecate</code> if a version is found unsafe in production.</span>} />
          <Row k="Vendor lock-in mitigation" v="MIT license + the fork right. Anyone can fork at any time." />
        </Section>

        <Section title="4. Bus factor / Continuity">
          <Row k="Bus factor" v="1 (single maintainer)" badge="risk" />
          <Row
            k="Mitigation"
            v={
              <span>
                The package is MIT-licensed and forkable. We maintain a public{" "}
                <Link2 href="https://github.com/ar-agents/ar-agents/blob/main/packages/mercadolibre/GOVERNANCE.md">
                  GOVERNANCE.md
                </Link2>{" "}
                describing the path to co-maintainer status (open PRs of substance, then a maintainer invitation after demonstrated commitment).
              </span>
            }
          />
          <Row
            k="Co-maintainer invitation"
            v="Open. Email naza@helloastro.co with subject [co-maintain] and a sample PR. Response in 7 days."
          />
          <Row
            k="Estimated total cost-to-replace"
            v="The lib is ~5 KLOC of TypeScript with 142 tests + cookbook + landing + MCP server. A senior eng could reproduce the surface in ~6-8 weeks (~$25-40K USD)."
          />
        </Section>

        <Section title="5. Security posture">
          <Row k="Production CVEs" v="0 (verified via pnpm audit --prod, last run 2026-05-09)" />
          <Row k="Hard-coded secrets" v="None (audited)" />
          <Row k="eval / Function() / dynamic import" v="None" />
          <Row k="HTTP fallbacks" v="None — HTTPS only" />
          <Row k="OAuth tokens" v="Never logged. Telemetry hooks see method + URL + status, never headers or bodies." />
          <Row k="SSRF protection" v={<span>Path validator on <code>MeliClient.buildUrl</code> rejects schemes / authorities / NUL bytes.</span>} />
          <Row k="Penetration test" v="None commissioned. Adversarial multi-agent code review completed 2026-05-09 (14 findings, all addressed)." />
          <Row
            k="Threat model"
            v={<Link2 href="https://github.com/ar-agents/ar-agents/blob/main/packages/mercadolibre/SECURITY.md">SECURITY.md</Link2>}
          />
        </Section>

        <Section title="6. Supply chain">
          <Row k="Build attestation" v="GitHub Actions, public workflow at .github/workflows/ci.yml" />
          <Row k="npm provenance" v="Will be enabled in next minor release (npm 9+ + OIDC)" />
          <Row k="SBOM" v={<span>Auto-generated via <code>pnpm install --json</code>. Available on request.</span>} />
          <Row k="Runtime dependencies" v="2 (zod peer, optional ai peer). No other production deps. No transitive surface." />
          <Row
            k="OpenSSF Scorecard"
            v={
              <Link2 href="https://github.com/ar-agents/ar-agents/actions/workflows/scorecard.yml">
                .github/workflows/scorecard.yml
              </Link2>
            }
          />
          <Row k="Dependabot / Renovate" v="Dependabot enabled (.github/dependabot.yml)" />
        </Section>

        <Section title="7. Data privacy / Compliance">
          <Row k="Data we collect" v="None. The lib runs in your runtime; we have no telemetry pipeline." />
          <Row k="Personal data handling" v="N/A — the lib does not exfiltrate, store, or transmit any data outside of your MELI calls." />
          <Row k="GDPR / Argentine Law 25.326" v="Compliance is the adopter's responsibility (the lib is a transport layer)." />
          <Row k="Data residency" v="N/A — no data is stored by the lib." />
        </Section>

        <Section title="8. Quality signals">
          <Row k="Tests" v="142 (128 unit + 4 integration vs MELI live API + 10 property-based)" />
          <Row k="Type checking" v="TypeScript strict + exactOptionalPropertyTypes + isolatedModules" />
          <Row k="Validation" v="publint + arethetypeswrong: all 🟢" />
          <Row k="Bundle size" v="11 KB brotli (full ESM + all deps)" />
          <Row k="LLM-as-judge eval" v={<Link2 href="https://github.com/ar-agents/ar-agents/blob/main/packages/mercadolibre/evals/results.md">18.7 / 20 mean across 10 scenarios</Link2>} />
          <Row k="Daily integration cron" v="GitHub Actions, runs against live MELI public API at 12:00 UTC" />
        </Section>

        <Section title="9. Production latency (snapshot)">
          <Row
            k="Methodology"
            v="50 sequential runs at concurrency 10 against bridge-hello.ar-agents.ar, measured from a Buenos Aires client."
          />
          <Row
            k="When"
            v="2026-05-09 17:30 UTC (re-run anytime via test/bench/loadtest.mjs in the repo)"
          />
          <Row
            k="GET /.well-known/acp.json"
            v="p50 44ms · p95 1253ms · p99 1349ms · 0 errors. p95 includes one Vercel cold start; subsequent runs fit the p50."
          />
          <Row
            k="GET /.well-known/agentic-feed.json"
            v="p50 30ms · p95 46ms · p99 105ms · 0 errors"
          />
          <Row
            k="GET /api/feed/products"
            v="p50 31ms · p95 228ms · p99 229ms · 0 errors (with valid Opt-In header; default returns 403)"
          />
          <Row
            k="POST /api/acp/checkout_sessions"
            v="p50 167ms · p95 396ms · p99 399ms · 0 errors"
          />
        </Section>

        <Section title="10. Termination">
          <Row k="If we shut down" v="The npm package remains published; the GitHub repo remains public; the MIT license preserves your right to fork." />
          <Row k="Notice period" v="Best-effort; no contractual notice." />
          <Row k="Data export" v="N/A — no data is held by the lib." />
        </Section>

        <p
          style={{
            marginTop: 64,
            fontSize: 13,
            color: "var(--text-muted)",
            fontFamily: FONT_MONO,
            lineHeight: 1.6,
            maxWidth: 760,
          }}
        >
          This page is intended as a transparency artifact for security,
          procurement, and legal reviewers. Every answer is honest. If your
          adoption bar requires more (dedicated SLA, indemnification, audit
          rights, etc.), email{" "}
          <Link2 href="mailto:naza@helloastro.co?subject=%5Bvendor%5D">
            naza@helloastro.co
          </Link2>{" "}
          to discuss a commercial agreement.
        </p>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          margin: "0 0 12px",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          display: "grid",
          gap: 0,
          background: "var(--bg-tint)",
          borderRadius: 10,
          boxShadow: "var(--shadow-border)",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Row({
  k,
  v,
  badge,
}: {
  k: string;
  v: React.ReactNode;
  badge?: "risk" | "ok";
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(200px, 1fr) 2fr",
        gap: 16,
        padding: "12px 16px",
        borderTop: "1px solid var(--border-color)",
        alignItems: "start",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontFamily: FONT_MONO,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
          paddingTop: 2,
        }}
      >
        {k}
        {badge === "risk" && (
          <span
            style={{
              marginLeft: 8,
              padding: "2px 6px",
              borderRadius: 3,
              background: "rgba(255, 100, 0, 0.14)",
              color: "#cc4400",
              fontSize: 10,
              letterSpacing: "0.06em",
            }}
          >
            risk
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55 }}>
        {v}
      </div>
    </div>
  );
}

function Link2({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        color: "var(--accent-text)",
        textDecoration: "underline",
        textUnderlineOffset: 3,
      }}
    >
      {children}
    </a>
  );
}
