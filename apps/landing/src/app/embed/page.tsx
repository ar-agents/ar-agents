import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { EmbedClient } from "./embed-client";

export const metadata: Metadata = {
  title: "/embed · audit-log verification badges + iframes for your site",
  description:
    "Copy-paste snippets to embed an ar-agents verification badge or live audit-log iframe in your README, landing, or status page. Updates live based on the audit log's verification state. Free, no auth.",
  alternates: { canonical: "https://ar-agents.ar/embed" },
};

export default function EmbedPage() {
  return (
    <DocShell
      eyebrow="embed · viral surface"
      title="Embed the verification proof in your site."
      subtitle="One copy-paste, your sociedad automatizada's audit-log verification status renders inline anywhere. README badges, status pages, vendor profiles, marketing landings, all live, all server-recomputed every 60s, all auditable."
    >
      <DocBlock>
        <DocP>
          When an external party visits your sociedad automatizada&apos;s website,
          they have no way to know if your audit log is clean. Telling
          them &quot;I have a clean log, trust me&quot; is the
          opposite of forensic. The badge embed solves this in 1 line:
          a 24px SVG that recomputes the verification state every 60s,
          server-side, against the same canonical-JSON + HMAC-SHA256
          implementation the rest of the toolkit uses.
        </DocP>
        <DocP>
          Use the playground below to try it with any session id, then
          copy the snippet for your README / landing.
        </DocP>
      </DocBlock>

      <DocH2>Try it</DocH2>
      <EmbedClient />

      <DocH2>Standard markdown badge</DocH2>
      <CodeBlock>{`![ar-agents audit](https://ar-agents.ar/api/badge/{sessionId})`}</CodeBlock>
      <DocP>
        Renders inline in any markdown file: GitHub README, GitLab
        snippet, npm package page, BitBucket. The badge color updates
        live: blue when verified, red when tampered, gray when no HMAC
        is wired or the log is empty.
      </DocP>

      <DocH2>HTML img tag</DocH2>
      <CodeBlock>{`<img
  src="https://ar-agents.ar/api/badge/{sessionId}"
  alt="ar-agents audit"
  height="20"
/>`}</CodeBlock>
      <DocP>
        For HTML pages where markdown isn&apos;t available. Specify{" "}
        <DocCode>height=&quot;20&quot;</DocCode> to match shields.io
        sizing exactly; the badge SVG is content-sized so width
        adapts to the verification state string.
      </DocP>

      <DocH2>Linked badge (click to dashboard)</DocH2>
      <CodeBlock>{`<a href="https://ar-agents.ar/dashboard/{sessionId}">
  <img
    src="https://ar-agents.ar/api/badge/{sessionId}"
    alt="ar-agents audit"
    height="20"
  />
</a>`}</CodeBlock>
      <DocP>
        Clicking the badge opens the full forensic dashboard with the
        timeline + tamper-test + share UI. Recommended pattern for
        marketing landings, it gives the visitor a path to dig
        deeper without committing to it.
      </DocP>

      <DocH2>Live audit-log iframe</DocH2>
      <CodeBlock>{`<iframe
  src="https://ar-agents.ar/dashboard/{sessionId}"
  width="100%"
  height="640"
  loading="lazy"
  referrerpolicy="no-referrer"
  sandbox="allow-scripts allow-same-origin"
  title="ar-agents audit log"
></iframe>`}</CodeBlock>
      <DocP>
        Embeds the full live dashboard with SSE streaming. Use this on
        an internal compliance dashboard so a finance / ops team can
        watch the sociedad automatizada&apos;s tool calls in real time without
        leaving their tab. The dashboard sets{" "}
        <DocCode>X-Frame-Options: SAMEORIGIN</DocCode>; iframe-ing on a
        different origin requires the site to set CSP{" "}
        <DocCode>frame-src https://ar-agents.ar</DocCode>.
      </DocP>

      <DocH2>Verification report (programmatic)</DocH2>
      <CodeBlock>{`curl https://ar-agents.ar/api/play/audit/{sessionId}?verify=1
# returns:
# {
#   "sessionId": "...",
#   "backend": "vercel-kv",
#   "count": 5,
#   "entries": [...],
#   "verification": {
#     "total": 5,
#     "verified": 5,
#     "tampered": 0,
#     "hmacWired": true
#   }
# }`}</CodeBlock>
      <DocP>
        For pipelines that want to assert audit-log cleanliness in CI
        (e.g., a deploy gate that fails if any entry is tampered) or in
        a daily compliance digest. See{" "}
        <a href="/examples#19" style={{ color: "var(--accent)" }}>
          cookbook recipe 19
        </a>{" "}
        for the cron-driven pattern.
      </DocP>

      <DocH2>CSV export (for the contador)</DocH2>
      <CodeBlock>{`curl https://ar-agents.ar/api/play/audit/{sessionId}/csv > audit-2026-05.csv
# Pivot in Excel / Sheets / Numbers. One row per entry,
# columns: ts, tool, governance, durationMs, hmac, errored,
# input (JSON-stringified), output (JSON-stringified).`}</CodeBlock>
      <DocP>
        Practical compliance: el contador can ingest the export, run
        any pivot, and reconcile against the bookkeeping. CSV format
        is RFC 4180 compliant, escapes embedded commas / quotes /
        newlines per spec. UTF-8 BOM included so Excel renders
        accents correctly without manual encoding setup.
      </DocP>

      <DocH2>Where the badge gets its data</DocH2>
      <DocP>
        The badge endpoint (
        <DocCode>GET /api/badge/{`{sessionId}`}</DocCode>) calls the
        same{" "}
        <DocCode>verifySession()</DocCode> primitive used by{" "}
        <a href="/verify" style={{ color: "var(--accent)" }}>/verify</a>{" "}
        and the dashboard. The state mapping:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong style={{ color: "#0a72ef" }}>verified · N/M</strong>{" "}
          (blue), every signature recomputes correctly.
        </Li>
        <Li>
          <strong style={{ color: "#ff5b4f" }}>tampered · N</strong>{" "}
          (red), at least one signature mismatches the canonical-JSON
          of its body.
        </Li>
        <Li>
          <strong style={{ color: "#999" }}>no entries</strong> (gray),
          the session id is valid but no tool calls have been logged.
        </Li>
        <Li>
          <strong style={{ color: "#666" }}>no-hmac</strong> (gray), {" "}
          <DocCode>AUDIT_HMAC_SECRET</DocCode> isn&apos;t wired in the
          deploy.
        </Li>
        <Li>
          <strong style={{ color: "#999" }}>invalid id</strong> (gray),
          session id failed the regex validation.
        </Li>
      </ul>
      <DocP>
        Cache: <DocCode>public, max-age=60, s-maxage=60,
        stale-while-revalidate=300</DocCode>. Browsers refetch every
        60s; CDN edges hold for 60s; stale state is allowed up to 5
        more minutes while a fresh fetch is in flight. GitHub&apos;s
        Camo proxy for README badges hits at ~60s anyway, so the cache
        is calibrated to that.
      </DocP>

      <DocH2>Privacy + threat model</DocH2>
      <DocP>
        Audit-log entries are <strong>public-readable by design</strong>.
        The session id is the access token; pick one opaque enough that
        enumeration isn&apos;t a meaningful attack (UUID v4 from{" "}
        <DocCode>crypto.randomUUID()</DocCode> is fine; sequential
        integers are not). The endpoint serves anyone who knows the id;
        it doesn&apos;t require auth.
      </DocP>
      <DocP>
        Don&apos;t log secrets / PII in the entry input/output, {" "}
        whatever lands in <DocCode>entry.input</DocCode> is queryable
        forever (or until KV TTL). The system prompt of the live agent
        explicitly refuses to log credentials; agents you build on top
        should follow the same discipline.
      </DocP>
      <DocP>
        Full threat surface in <a href="/security" style={{ color: "var(--accent)" }}>/security</a>{" "}
        and <a href="/architecture/audit-log" style={{ color: "var(--accent)" }}>/architecture/audit-log</a>.
      </DocP>
    </DocShell>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        background: "var(--bg-tint)",
        padding: 16,
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.55,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        color: "var(--text-body)",
        overflow: "auto",
        boxShadow: "var(--card-shadow)",
        marginBottom: 16,
        whiteSpace: "pre",
      }}
    >
      {children}
    </pre>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ marginBottom: 6, lineHeight: 1.55, color: "var(--text-body)" }}>
      {children}
    </li>
  );
}

const listStyle: React.CSSProperties = {
  paddingLeft: 24,
  fontSize: 14,
  marginBottom: 16,
};
