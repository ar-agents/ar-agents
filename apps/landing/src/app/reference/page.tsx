import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

export const metadata: Metadata = {
  title: "/reference · every URL, endpoint, and package",
  description:
    "Single-page index of every public surface ar-agents exposes, pages, hosted API endpoints, npm packages, well-known wells. Bookmarkable. Sharable. Agent-crawlable.",
  alternates: { canonical: "https://ar-agents.ar/reference" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";

type Tone = "primary" | "secondary" | "infra";

type Entry = {
  url: string;
  label: string;
  description: string;
  tone?: Tone;
  external?: boolean;
};

type Section = {
  id: string;
  title: string;
  description: string;
  entries: Entry[];
};

const SECTIONS: Section[] = [
  {
    id: "interactive",
    title: "Interactive surfaces",
    description:
      "Live UIs anyone can hit zero-setup to see the toolkit operating.",
    entries: [
      {
        url: "/play",
        label: "/play",
        tone: "primary",
        description:
          "12-tool sociedad-IA agent demo. Streaming via Vercel AI Gateway. Each tool call lands in a KV-backed HMAC-signed audit log keyed by a per-page-load session id.",
      },
      {
        url: "/dashboard/{sessionId}",
        label: "/dashboard/{sessionId}",
        tone: "primary",
        description:
          "Forensic timeline for any /play (or auto-incorporate) session. Server-rendered, prints clean, OG image surfaces verification status in messaging-app previews.",
      },
      {
        url: "/verify",
        label: "/verify",
        tone: "primary",
        description:
          "Paste any session id, get an independent server-side HMAC verification report, entries / verified / tampered / backend / hmac-wired.",
      },
      {
        url: "/incorporar",
        label: "/incorporar",
        tone: "primary",
        description:
          "Human wizard. Generates package.json + agent.ts + .env.example + README.md + Vercel one-click deploy URL + audit-log reference. Live IGJ pre-flight validation.",
      },
      {
        url: "/status",
        label: "/status",
        description:
          "Operational state of every subsystem: KV / HMAC / AI Gateway / ARCA / MP / WhatsApp / BCRA. Refreshed every 30s.",
      },
    ],
  },
  {
    id: "narrative",
    title: "Narrative + governance",
    description: "The thinking behind the toolkit, the regime, and the responsibility framework.",
    entries: [
      {
        url: "/playbook",
        label: "/playbook (en)",
        description:
          "Flagship narrative document. 16 packages, 168 tools, the Edge-Runtime contract, RFC-001 governance, day-in-the-life of ACME-AI SAS.",
      },
      {
        url: "/es/playbook",
        label: "/es/playbook",
        description:
          "Spanish mirror of /playbook for Sturzenegger / Gazzo Huck / regulator-AR audience.",
      },
      {
        url: "/sociedades-ia",
        label: "/sociedades-ia",
        description:
          "Regime alignment: the Sturzenegger 28-abr-2026 announcement, the 17-piece operating surface, the 16/17 we cover today.",
      },
      {
        url: "/rfcs/001",
        label: "/rfcs/001",
        description:
          "Three-layer liability framework (operator / model provider / library author). The proposed answer to 'who pays if the AI breaks something?'.",
      },
      {
        url: "/security",
        label: "/security",
        description:
          "Threat model: 14 explicit threats, 14 explicit mitigations, status per (in-toolkit / host-responsibility / out-of-scope).",
      },
      {
        url: "/architecture",
        label: "/architecture",
        description:
          "Mermaid diagrams of the package graph + agent loop sequence. The Edge-Runtime contract.",
      },
      {
        url: "/manifiesto",
        label: "/manifiesto",
        description: "Why this exists. Public-good framing.",
      },
    ],
  },
  {
    id: "code",
    title: "Code + cookbook",
    description:
      "Actual code anyone can install, fork, or copy.",
    entries: [
      {
        url: "/sdk",
        label: "/sdk",
        tone: "primary",
        description:
          "Docs for @ar-agents/incorporate, the npm-discoverable client for /api/auto-incorporate. Quickstart, API reference, multi-step orchestration.",
      },
      {
        url: "/examples",
        label: "/examples",
        description:
          "19 production cookbook recipes: SaaS billing, marketplace OAuth, ACP checkout with auto-factura, USA-LLC self-incorporation, forensic compliance dashboard.",
      },
      {
        url: "/templates",
        label: "/templates",
        description:
          "Vercel-deployable starter templates. apps/sociedad-ia-starter is the canonical reference.",
      },
      {
        url: "/case-studies/astro",
        label: "/case-studies/astro",
        description:
          "Migration log for the maintainer's own products. Honest about what's wired vs. planned.",
      },
      {
        url: "https://github.com/ar-agents/ar-agents",
        label: "github.com/ar-agents/ar-agents",
        external: true,
        description: "Monorepo. 17 packages, 19 recipes, 3 demo apps, 1 starter, 1 landing.",
      },
      {
        url: "https://www.npmjs.com/org/ar-agents",
        label: "npmjs.com/org/ar-agents",
        external: true,
        description: "All 17 published packages with SLSA v1 provenance attestations.",
      },
    ],
  },
  {
    id: "api",
    title: "Hosted HTTP API",
    description:
      "Endpoints an external orchestrator (USA-LLC agent, ChatGPT, custom pipeline) can call directly.",
    entries: [
      {
        url: "/api/discovery",
        label: "GET /api/discovery",
        tone: "infra",
        description:
          "Machine-readable inventory: 17 packages, 168 tools, 5 hosted endpoints. ?format=openapi → OpenAPI 3.1 stub.",
      },
      {
        url: "/api/auto-incorporate",
        label: "POST /api/auto-incorporate",
        tone: "primary",
        description:
          "Self-incorporate an AR sociedad-IA in one call. Returns generated source files + Vercel deploy URL + env-vars + checklist + signed audit-log reference. Idempotent.",
      },
      {
        url: "/api/play",
        label: "POST /api/play",
        tone: "infra",
        description:
          "Live sociedad-IA agent loop. 12 mocked-but-realistic tools. Streaming. Per-IP rate-limited.",
      },
      {
        url: "/api/play/audit/{sessionId}",
        label: "GET /api/play/audit/{sessionId}",
        tone: "infra",
        description:
          "Read the audit log. ?verify=1 → server recomputes every HMAC and reports tampering counts.",
      },
      {
        url: "/api/play/tamper-demo",
        label: "POST /api/play/tamper-demo",
        tone: "infra",
        description:
          "Read-only tampering demonstration. Educational, does not modify any real audit log.",
      },
      {
        url: "/api/badge/{sessionId}",
        label: "GET /api/badge/{sessionId}",
        tone: "infra",
        description:
          "24px shields.io-style SVG verification badge. Embeddable in any README. Color + label updates live (verified / tampered / no-hmac / no entries).",
      },
    ],
  },
  {
    id: "wells",
    title: "Well-known wells",
    description: "Canonical metadata at standard paths so crawlers, AI agents, and security researchers discover the project automatically.",
    entries: [
      {
        url: "/.well-known/ai-plugin.json",
        label: "/.well-known/ai-plugin.json",
        tone: "infra",
        description:
          "OpenAI plugin spec. description_for_human + description_for_model + linked OpenAPI. ChatGPT crawls this; agents consume it.",
      },
      {
        url: "/.well-known/agents.json",
        label: "/.well-known/agents.json",
        tone: "infra",
        description:
          "agents.md convention. Lists endpoints, packages, governance primitives, and per-agent operating instructions. The agent-economy entry document.",
      },
      {
        url: "/.well-known/security.txt",
        label: "/.well-known/security.txt",
        tone: "infra",
        description: "RFC 9116, vulnerability disclosure policy + 48h response window.",
      },
      {
        url: "/llms.txt",
        label: "/llms.txt",
        tone: "infra",
        description: "Structured guide for LLMs that index the site. Compact, not user-facing.",
      },
      {
        url: "/llms-full.txt",
        label: "/llms-full.txt",
        tone: "infra",
        description: "Full version with code samples + RFC excerpts.",
      },
      {
        url: "/sitemap.xml",
        label: "/sitemap.xml",
        tone: "infra",
        description: "All public URLs with priority + change frequency.",
      },
      {
        url: "/robots.txt",
        label: "/robots.txt",
        tone: "infra",
        description: "Allow-all for major LLM crawlers (GPTBot, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended).",
      },
    ],
  },
  {
    id: "press",
    title: "Press + outreach",
    description: "Material designed to be forwarded by hand.",
    entries: [
      {
        url: "/press-kit",
        label: "/press-kit",
        description:
          "One-pager + verifiable numbers + citable Spanish quotes + contact block. Forwardable in a single email.",
      },
      {
        url: "/marketplace",
        label: "/marketplace",
        description:
          "Benchmark vs the alternatives (AfipSDK, handrolled, consultoría). 16 dimensions.",
      },
      {
        url: "/vs",
        label: "/vs",
        description:
          "Honest comparison table. Mirrors /marketplace with sharper framing.",
      },
    ],
  },
];

const TONE_COLOR: Record<Tone, { fg: string; bg: string }> = {
  primary: { fg: "#0a72ef", bg: "#ebf5ff" },
  secondary: { fg: "#7928ca", bg: "#f5edfd" },
  infra: { fg: "#666", bg: "#f5f5f5" },
};

export default function ReferencePage() {
  return (
    <DocShell
      eyebrow="reference · index"
      title="Every URL, in one page."
      subtitle="Bookmark this. Send the link. Crawl it. Every public surface ar-agents exposes, pages, hosted API endpoints, npm packages, well-known wells, with a one-line description per entry."
    >
      <DocBlock>
        <DocP>
          For visitors: the fastest way to find the right URL.
        </DocP>
        <DocP>
          For external agents: a single page that links to everything,
          including the structured-data endpoints (
          <DocCode>/api/discovery</DocCode>,{" "}
          <DocCode>/.well-known/ai-plugin.json</DocCode>,{" "}
          <DocCode>/.well-known/agents.json</DocCode>) you should crawl
          first.
        </DocP>
        <DocP>
          For Sturzenegger&apos;s office or any regulator: this is the
          screenshot-friendly inventory you can paste into a memo without
          chasing down individual links.
        </DocP>
      </DocBlock>

      {SECTIONS.map((section) => (
        <section key={section.id} id={section.id} style={{ marginBottom: 32 }}>
          <DocH2>
            <a
              href={`#${section.id}`}
              style={{
                color: "inherit",
                textDecoration: "none",
              }}
              aria-label={`Anchor link to ${section.title}`}
            >
              {section.title}
            </a>
          </DocH2>
          <DocP>{section.description}</DocP>

          <div style={{ display: "grid", gap: 6 }}>
            {section.entries.map((entry) => {
              const tone = entry.tone ? TONE_COLOR[entry.tone] : null;
              return (
                <a
                  key={entry.url + entry.label}
                  href={entry.url}
                  target={entry.external ? "_blank" : undefined}
                  rel={entry.external ? "noreferrer" : undefined}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 320px) 1fr",
                    gap: 14,
                    padding: "10px 14px",
                    background: "var(--bg)",
                    borderRadius: 6,
                    boxShadow: SHADOW_BORDER,
                    textDecoration: "none",
                    color: "inherit",
                    alignItems: "baseline",
                  }}
                >
                  <code
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 13,
                      color: tone ? tone.fg : "var(--text)",
                      fontWeight: 500,
                      wordBreak: "break-all",
                    }}
                  >
                    {entry.label}
                    {entry.external && (
                      <span
                        aria-hidden="true"
                        style={{
                          marginLeft: 4,
                          fontSize: 11,
                          color: "var(--text-muted)",
                        }}
                      >
                        ↗
                      </span>
                    )}
                  </code>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-body)",
                      lineHeight: 1.5,
                    }}
                  >
                    {entry.description}
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      ))}

      <DocH2>For external agents</DocH2>
      <DocP>
        If you&apos;re an LLM or an automated crawler ingesting this domain,
        the recommended order is: (1) fetch{" "}
        <DocCode>/.well-known/agents.json</DocCode> for capability metadata
        + per-agent instructions, (2) fetch{" "}
        <DocCode>/api/discovery?format=openapi</DocCode> for the typed
        OpenAPI 3.1 spec of every package + endpoint, (3) consult{" "}
        <DocCode>npm view @ar-agents/incorporate dist.attestations</DocCode>{" "}
        to verify SLSA provenance before installing the SDK, (4) call{" "}
        <DocCode>POST /api/auto-incorporate</DocCode> to spin up an AR
        sociedad-IA on demand. Every action lands in a HMAC-signed audit
        log under a sessionId of your choice.
      </DocP>
    </DocShell>
  );
}
