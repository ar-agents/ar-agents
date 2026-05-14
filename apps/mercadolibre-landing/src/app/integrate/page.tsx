import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Integrate — @ar-agents/mercadolibre",
  description:
    "Three paths to adopt: try, partner, license. Procurement-friendly, IP-clear, reversible.",
};

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

export default function IntegratePage() {
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
            Three ways to adopt
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
            For solo devs, agencies, SaaS hosts, or marketplace operators —
            from zero-friction try-before-you-commit through to a formal
            commercial integration. Every path is reversible.
          </p>
        </header>

        <PathCard
          tier="A"
          title="Try"
          subtitle="No commitment. ~5 minutes."
          tagline="The default path for most adopters."
          when="You want to use the toolkit in your own product. Solo dev, agency, or SaaS."
          steps={[
            {
              n: 1,
              t: "Install",
              c: <Mono>{`pnpm add @ar-agents/mercadolibre`}</Mono>,
            },
            {
              n: 2,
              t: "Wire to your AI agent",
              c: (
                <Mono multiline>{`import { MeliClient } from "@ar-agents/mercadolibre";
import { meliTools } from "@ar-agents/mercadolibre/ai-sdk";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

const tools = meliTools(client, {
  siteId: "MLA",
  sellerId: 12345,
});`}</Mono>
              ),
            },
            {
              n: 3,
              t: "Optional: read the cookbook",
              c: (
                <span>
                  12 production recipes covering OAuth, daily-triage agents,
                  webhooks, HITL, ACP feeds, and more →{" "}
                  <ExtLink href="https://github.com/ar-agents/ar-agents/tree/main/packages/mercadolibre/cookbook">
                    cookbook/
                  </ExtLink>
                  .
                </span>
              ),
            },
          ]}
          obligations={[
            "MIT license — keep the copyright notice if you redistribute.",
            "No data collection — the lib runs in your runtime.",
            "No SLA — best-effort community support via GitHub issues.",
          ]}
          rev="Total. Just `pnpm remove`."
          color="default"
        />

        <PathCard
          tier="B"
          title="Partner"
          subtitle="Co-maintain, formal contributor relationship. ~30 days."
          tagline="Right when MELI / a marketplace wants to formalize without IP transfer."
          when="You're an established team that wants influence on the roadmap, public co-credit, or a formal seat at the maintenance table."
          steps={[
            {
              n: 1,
              t: "Open 3+ substantive PRs",
              c: (
                <span>
                  Bug fixes, new test coverage, new cookbook recipes, or
                  documentation improvements. Substance &gt; volume.
                </span>
              ),
            },
            {
              n: 2,
              t: "Email naza@helloastro.co with subject [co-maintain]",
              c: (
                <span>
                  Include links to your PRs and a 1-line statement of intent.
                  Response in 7 days.
                </span>
              ),
            },
            {
              n: 3,
              t: "30-day trial",
              c: (
                <span>
                  Triage rights on the repo. Joint decision-making on PRs. End
                  of trial = permanent maintainer slot if both sides agree.
                </span>
              ),
            },
          ]}
          obligations={[
            "MIT license preserved.",
            "Co-maintainer commits to ~5 hrs/week minimum during active periods.",
            "Joint decisions on roadmap, BREAKING changes, version cuts.",
            "Co-maintained line in README + CHANGELOG.",
            "No compensation, no contract — pure technical reputation trade.",
          ]}
          rev="Either side can walk with 30 days notice. Repo stays MIT."
          color="accent"
        />

        <PathCard
          tier="C"
          title="License"
          subtitle="Commercial integration. Terms negotiable."
          tagline="Right when an enterprise needs SLA, indemnification, or IP control."
          when="You're a marketplace, payments processor, or large SaaS that wants legal certainty + co-marking + a contracted handoff."
          steps={[
            {
              n: 1,
              t: "Email naza@helloastro.co with subject [vendor]",
              c: (
                <span>
                  Tell us your jurisdiction, the scope (exclusive vs
                  non-exclusive), and any specific clauses you need
                  (indemnification, audit rights, escrow, etc.). Response in
                  72 hours.
                </span>
              ),
            },
            {
              n: 2,
              t: "Diligence call",
              c: (
                <span>
                  60 minutes to walk through architecture, supply chain, data
                  privacy, security posture. Same answers as on{" "}
                  <Link
                    href="/operated-by"
                    style={{
                      color: "var(--accent-text)",
                      textDecoration: "underline",
                    }}
                  >
                    /operated-by
                  </Link>
                  , just narrated.
                </span>
              ),
            },
            {
              n: 3,
              t: "Term sheet",
              c: (
                <span>
                  We use a simple template based on the standards of the OSS
                  community (e.g., Sentry-style fair source, dual MIT +
                  commercial). Counter-proposals welcome. Closing target:
                  ~30-45 days from intent.
                </span>
              ),
            },
          ]}
          obligations={[
            "Public package may be sunset, deprecated, or co-maintained — your call.",
            "IP assignment depends on terms (full transfer / exclusive / non-exclusive).",
            "30-90 day handoff with author providing technical advisory.",
            "Insurance / E&O coverage available via a third-party endorser if required.",
          ]}
          rev="Terms-dependent. Default term sheet includes a fork-back clause if maintenance lapses."
          color="strong"
        />

        <p
          style={{
            marginTop: 56,
            fontSize: 13,
            color: "var(--text-muted)",
            fontFamily: FONT_MONO,
            lineHeight: 1.6,
            maxWidth: 760,
          }}
        >
          For all three paths, the technical surface is identical — same
          package, same tests, same vendor questionnaire on{" "}
          <Link
            href="/operated-by"
            style={{
              color: "var(--accent-text)",
              textDecoration: "underline",
            }}
          >
            /operated-by
          </Link>
          . What changes is the legal envelope around it.
        </p>
      </div>
    </main>
  );
}

function PathCard({
  tier,
  title,
  subtitle,
  tagline,
  when,
  steps,
  obligations,
  rev,
  color,
}: {
  tier: string;
  title: string;
  subtitle: string;
  tagline: string;
  when: string;
  steps: { n: number; t: string; c: React.ReactNode }[];
  obligations: string[];
  rev: string;
  color: "default" | "accent" | "strong";
}) {
  const borderColor =
    color === "strong"
      ? "var(--accent-strong)"
      : color === "accent"
        ? "var(--accent-text)"
        : "var(--border-color)";
  return (
    <section
      style={{
        background: "var(--bg-tint)",
        borderRadius: 12,
        padding: "28px 28px 24px",
        marginBottom: 24,
        boxShadow: "var(--shadow-border)",
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
            fontWeight: 600,
          }}
        >
          path {tier}
        </span>
        <h2
          style={{
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          {title}
        </h2>
        <span
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
          }}
        >
          {subtitle}
        </span>
      </div>
      <div
        style={{
          fontSize: 14,
          color: "var(--text-body)",
          marginBottom: 18,
          lineHeight: 1.5,
        }}
      >
        <strong>{tagline}</strong> &nbsp;{when}
      </div>

      <ol
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 18px",
          display: "grid",
          gap: 14,
        }}
      >
        {steps.map((s) => (
          <li
            key={s.n}
            style={{
              display: "grid",
              gridTemplateColumns: "32px 1fr",
              gap: 14,
              alignItems: "start",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: borderColor,
                color: "var(--accent-strong-text, white)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONT_MONO,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {s.n}
            </div>
            <div>
              <div
                style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}
              >
                {s.t}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-body)", lineHeight: 1.55 }}>
                {s.c}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <details
        style={{
          fontSize: 12,
          fontFamily: FONT_MONO,
          color: "var(--text-muted)",
          paddingTop: 8,
          borderTop: "1px solid var(--border-color)",
        }}
      >
        <summary style={{ cursor: "pointer", padding: "6px 0" }}>
          obligations + reversibility
        </summary>
        <ul
          style={{
            margin: "8px 0 4px",
            paddingLeft: 22,
            lineHeight: 1.6,
          }}
        >
          {obligations.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
        <div style={{ marginTop: 8 }}>
          <strong>Reversibility:</strong> {rev}
        </div>
      </details>
    </section>
  );
}

function Mono({
  children,
  multiline = false,
}: {
  children: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <code
      style={{
        fontFamily: FONT_MONO,
        fontSize: multiline ? 12 : 13,
        background: "var(--bg)",
        padding: multiline ? "12px 14px" : "2px 6px",
        borderRadius: 4,
        display: multiline ? "block" : "inline",
        whiteSpace: multiline ? "pre" : "nowrap",
        overflowX: multiline ? "auto" : "visible",
        lineHeight: multiline ? 1.6 : 1.4,
      }}
    >
      {children}
    </code>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
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
