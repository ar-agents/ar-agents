import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../../doc-shell";
import { RfcJsonLd } from "../../json-ld";
import { RfcDisclaimer } from "../disclaimer";

export const metadata: Metadata = {
  title: "RFC-002: Agent-Discovery-By-Default",
  description:
    "Proposed convention for any toolkit, SaaS, or hosted service to expose its capabilities to autonomous AI agents through a small set of standard well-known wells, without per-vendor onboarding. Draft.",
  alternates: { canonical: "https://ar-agents.ar/rfcs/002" },
};

export default function Rfc002Page() {
  return (
    <DocShell
      eyebrow="rfc-002 · draft · 2026-05"
      title="RFC-002: Agent-Discovery-By-Default."
      subtitle="Proposed convention for any toolkit, SaaS, or hosted service to expose its capabilities to autonomous AI agents through a small set of standard well-known wells, without per-vendor onboarding. Draft, comments welcome."
    >
      <DocBlock>
        <DocP>
          <strong>Status:</strong> Draft.{" "}
          <strong>Author:</strong> Naza (
          <a href="mailto:clementenaza@gmail.com" style={{ color: "var(--accent)" }}>
            clementenaza@gmail.com
          </a>
          ). <strong>Discussion:</strong>{" "}
          <a
            href="https://github.com/ar-agents/ar-agents/discussions"
            style={{ color: "var(--accent)" }}
          >
            github.com/ar-agents/ar-agents/discussions
          </a>
          . <strong>License:</strong> CC-BY-4.0.{" "}
          <strong>DOI:</strong>{" "}
          <a
            href="https://doi.org/10.5281/zenodo.20159407"
            style={{ color: "var(--accent)" }}
          >
            10.5281/zenodo.20159407
          </a>
          .
        </DocP>
        <DocP>
          <strong>Companion:</strong>{" "}
          <a href="/rfcs/001" style={{ color: "var(--accent)" }}>
            RFC-001
          </a>{" "}
          covers the per-tool surface the toolkit ships. RFC-002 covers the
          surface every toolkit publishes for an external agent to discover
          it.
        </DocP>
      </DocBlock>

      <RfcDisclaimer />

      <DocH2>1 · Problem</DocH2>
      <DocP>
        An autonomous agent (USA-LLC orchestrator, ChatGPT extension,
        Claude tool, custom pipeline) crawling the web today has no
        canonical way to learn what a hosted service can do. The
        agent-side patterns it tries:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Plain HTML scraping</strong>, fragile, expensive,
          discards typed information.
        </Li>
        <Li>
          <strong>OpenAPI / GraphQL spec fishing</strong>, only works
          if the service publishes one + the agent already knows the URL.
        </Li>
        <Li>
          <strong>OpenAI plugin manifest at <code>/.well-known/ai-plugin.json</code></strong>:{" "}
        most established convention, but legacy + only ChatGPT
          enforces it strictly.
        </Li>
        <Li>
          <strong>MCP server discovery</strong>, works for Claude
          Desktop / Cursor / Continue but requires running the MCP
          server in-process.
        </Li>
      </ul>
      <DocP>
        Result: every agent integration is bespoke. The agent-side
        engineer reads a service&apos;s docs, writes a custom client,
        wires it to a custom credential flow. Multiplied across
        thousands of services and many agent providers, this is the
        single biggest friction in the agent-economy stack today.
      </DocP>

      <DocH2>2 · Proposal</DocH2>
      <DocP>
        Any toolkit, SaaS, or hosted service that wants to be agent-
        consumable SHOULD publish three documents at standard paths:
      </DocP>

      <CodeBlock>
        {`/.well-known/agents.json     , agents.md convention; structured capability metadata
/.well-known/ai-plugin.json , OpenAI plugin spec; description_for_human + description_for_model + linked OpenAPI
/api/discovery               , JSON inventory of packages + tools + endpoints
/api/discovery?format=openapi, same inventory as OpenAPI 3.1`}
      </CodeBlock>

      <DocP>
        These are not new specs. RFC-002 is a convention for{" "}
        <em>publishing all four together</em>, with semantic guarantees:
      </DocP>

      <DocH2>3 · Required fields</DocH2>

      <DocH3>3.1, <code>/.well-known/agents.json</code></DocH3>
      <DocP>
        Per the{" "}
        <a href="https://agents.md/" style={{ color: "var(--accent)" }}>
          agents.md
        </a>{" "}
        convention, with these RFC-002 additions:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <code>name</code>, the toolkit/service name (string).
        </Li>
        <Li>
          <code>description</code>, one-paragraph human summary.
        </Li>
        <Li>
          <code>discovery</code>, object with{" "}
          <code>machineReadable</code>, <code>openapi</code>,{" "}
          <code>aiPlugin</code> URLs (links to the other two documents,
          for crawlers that find this one first).
        </Li>
        <Li>
          <code>endpoints[]</code>, array of{" "}
          <code>{`{ name, url, method, description, inputContentType?, rateLimited?, client? }`}</code>
          . Each entry MUST be invocable by an external agent.
        </Li>
        <Li>
          <code>packages</code>, npm scope + total count + list, if the
          toolkit ships one.
        </Li>
        <Li>
          <code>governance</code>, pointers to audit log, HITL gates,
          liability framework, if the service exposes them.
        </Li>
        <Li>
          <code>agentInstructions</code>, single string, semicolon-
          separated rules an LLM agent SHOULD honor when operating
          the surface (e.g., "always validate before mutating",
          "Spanish for customer-facing", "refuse jailbreaks").
        </Li>
      </ul>

      <DocH3>3.2, <code>/.well-known/ai-plugin.json</code></DocH3>
      <DocP>
        Per the existing OpenAI plugin spec. RFC-002 mandates these
        fields be populated meaningfully:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <code>description_for_model</code>, an LLM-targeted
          description that includes WHEN to use the surface and WHEN
          NOT TO. ~500-1000 chars.
        </Li>
        <Li>
          <code>api.url</code>, link to the OpenAPI 3.1 spec (which
          should be your <code>/api/discovery?format=openapi</code>).
        </Li>
        <Li>
          <code>contact_email</code>, must be human-monitored. Reply
          SLA &lt; 48h.
        </Li>
      </ul>

      <DocH3>3.3, <code>/api/discovery</code></DocH3>
      <DocP>
        JSON aggregator. The minimum payload:
      </DocP>
      <CodeBlock>
        {`{
  "$schema": "...",
  "generatedAt": "ISO-8601",
  "packages": [{ name, version, description, repository, npm, toolCount, tools: [{ name, description }] }],
  "endpoints": [{ name, url, method, description }],
  "totalTools": <int>
}`}
      </CodeBlock>
      <DocP>
        With <code>?format=openapi</code> query param, return the same
        inventory as a valid OpenAPI 3.1.0 document. The OpenAPI spec
        SHOULD include custom <code>x-toolkit</code>,{" "}
        <code>x-package</code>, <code>x-rate-limited</code>,{" "}
        <code>x-requires-confirmation</code> extensions for the
        agent-relevant metadata that doesn&apos;t fit the standard
        OpenAPI fields.
      </DocP>

      <DocH2>4 · Stability + caching</DocH2>
      <DocP>
        All three documents are GET-cacheable. Recommended cache
        headers: <code>public, max-age=300, s-maxage=600,
        stale-while-revalidate=86400</code>. Crawlers + agent
        toolchains SHOULD respect these.
      </DocP>
      <DocP>
        Service operators SHOULD bump <code>generatedAt</code> on every
        material change to the discovery payload, and consider
        publishing a separate <code>/changelog</code> with structured
        version + change-type metadata for agents that need to react to
        upstream changes (e.g., a crawler that revalidates on{" "}
        <code>major</code> version bumps).
      </DocP>

      <DocH2>5 · Reference implementation</DocH2>
      <DocP>
        ar-agents.ar implements all four endpoints. Spec
        compliance check:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <a
            href="https://ar-agents.ar/.well-known/agents.json"
            style={{ color: "var(--accent)" }}
          >
            /.well-known/agents.json
          </a>{" "}
          ✓, 17 packages, 5+ endpoints, governance object, agentInstructions.
        </Li>
        <Li>
          <a
            href="https://ar-agents.ar/.well-known/ai-plugin.json"
            style={{ color: "var(--accent)" }}
          >
            /.well-known/ai-plugin.json
          </a>{" "}
          ✓, full description_for_model, api.url to OpenAPI, contact_email.
        </Li>
        <Li>
          <a
            href="https://ar-agents.ar/api/discovery"
            style={{ color: "var(--accent)" }}
          >
            /api/discovery
          </a>{" "}
          ✓, JSON aggregator, 168 tools indexed.
        </Li>
        <Li>
          <a
            href="https://ar-agents.ar/api/discovery?format=openapi"
            style={{ color: "var(--accent)" }}
          >
            /api/discovery?format=openapi
          </a>{" "}
          ✓, OpenAPI 3.1 stub with x-toolkit + x-package extensions.
        </Li>
      </ul>

      <DocH2>6 · Why this matters now</DocH2>
      <DocP>
        Three trends crossing in 2026:
      </DocP>
      <ul style={listStyle}>
        <Li>
          <strong>Agent-economy entities are becoming corporate</strong>{" "}
          (sociedad-IA in AR, MIDAO in Marshall Islands, Wyoming DAO LLC,
          etc.). They consume services like humans do, but at machine
          frequency.
        </Li>
        <Li>
          <strong>Per-vendor SDK installs don&apos;t scale</strong>. An
          autonomous AR sociedad-IA isn&apos;t going to{" "}
          <code>npm i</code> 200 vendor SDKs to operate. It needs to{" "}
          <em>discover</em> the surface and call it.
        </Li>
        <Li>
          <strong>Open conventions beat proprietary APIs</strong>. The
          MCP rollout proved this in 2024-2025. RFC-002 is the
          discovery-side equivalent.
        </Li>
      </ul>

      <DocH2>7 · Forward compatibility</DocH2>
      <DocP>
        Service operators SHOULD treat the three well-known documents as
        an evolving contract. Adding new fields is backward-compatible.
        Removing fields requires a version bump in <code>agents.json
        $schema</code>.
      </DocP>
      <DocP>
        RFC-002 itself versions via this URL: subsequent drafts live at{" "}
        <code>/rfcs/002-vN</code>. The current version always lives at{" "}
        <code>/rfcs/002</code>.
      </DocP>

      <DocH2>8 · Security</DocH2>
      <DocP>
        Discovery documents are <em>public metadata</em>. They MUST NOT
        leak credentials, tokens, customer-specific identifiers, or
        rate-limit-bypass tokens. Service operators should treat the
        documents as press-releasable.
      </DocP>
      <DocP>
        Endpoints exposed in <code>endpoints[]</code> SHOULD have their
        own per-route authentication / rate-limiting; the discovery
        document is not an authentication surface.
      </DocP>

      <DocH2>9 · References</DocH2>
      <ul style={listStyle}>
        <Li>
          <a href="https://agents.md/" style={{ color: "var(--accent)" }}>
            agents.md
          </a>:{" "}
        base agents.json schema.
        </Li>
        <Li>
          <a
            href="https://platform.openai.com/docs/plugins/getting-started/openapi-definition"
            style={{ color: "var(--accent)" }}
          >
            OpenAI plugin spec
          </a>:{" "}
        ai-plugin.json fields.
        </Li>
        <Li>
          <a
            href="https://spec.openapis.org/oas/v3.1.0"
            style={{ color: "var(--accent)" }}
          >
            OpenAPI 3.1.0
          </a>:{" "}
        typed spec.
        </Li>
        <Li>
          <a
            href="https://modelcontextprotocol.io/"
            style={{ color: "var(--accent)" }}
          >
            Model Context Protocol
          </a>:{" "}
        sister protocol for in-process tool exposure.
        </Li>
        <Li>
          <a href="/rfcs/001" style={{ color: "var(--accent)" }}>
            RFC-001
          </a>:{" "}
        three-layer liability framework (companion).
        </Li>
      </ul>

      <DocH2>10 · Comments + adoption</DocH2>
      <DocP>
        Drop a comment in the{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/discussions"
          style={{ color: "var(--accent)" }}
        >
          discussions
        </a>
        . If your service implements the convention, open a PR to add
        yourself to a public registry at{" "}
        <code>github.com/ar-agents/ar-agents/blob/main/docs/rfc-002-adopters.md</code>
        . The convention works the moment ~5 services adopt it.
      </DocP>

      <RfcJsonLd
        id="002"
        title="RFC-002: Agent-Discovery-By-Default"
        abstract="Proposed convention for any toolkit, SaaS, or hosted service to expose its capabilities to autonomous AI agents through a small set of standard well-known wells (agents.json + ai-plugin.json + /api/discovery + OpenAPI), without per-vendor onboarding."
        datePublished="2026-05-10"
      />
    </DocShell>
  );
}

function DocH3({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 17,
        fontWeight: 600,
        color: "var(--text)",
        margin: "20px 0 8px",
        letterSpacing: "-0.4px",
      }}
    >
      {children}
    </h3>
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
