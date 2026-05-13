import type { Metadata } from "next";
import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { SdkJsonLd } from "../json-ld";

export const metadata: Metadata = {
  title: "/sdk · @ar-agents/incorporate",
  description:
    "Zero-dependency TypeScript client for /api/auto-incorporate. One async call → an Argentine sociedad-IA's full incorporation kit. Works in Node 20+, Edge Runtime, CF Workers, Deno, browsers. SLSA v1 provenance.",
  alternates: { canonical: "https://ar-agents.ar/sdk" },
};

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const SHADOW_BORDER = "rgba(0,0,0,0.08) 0px 0px 0px 1px";
const SHADOW_CARD =
  "rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px";

const INSTALL = `pnpm add @ar-agents/incorporate
# or
npm  install @ar-agents/incorporate
yarn add @ar-agents/incorporate
bun  add @ar-agents/incorporate`;

const QUICKSTART = `import { incorporate } from "@ar-agents/incorporate";

const result = await incorporate({
  denominacion: "ACME-AI SAS",
  tipo: "SOCIEDAD-IA",
  capitalSocial: 1,
  objeto:
    "Operación de servicios digitales y desarrollo de software propio para clientes argentinos.",
});

if (!result.ok) {
  for (const f of result.validation.findings) {
    console.error(\`[\${f.severity}] \${f.field}: \${f.message}\`);
  }
  process.exit(1);
}

console.log("Slug:        ", result.sociedad.slug);
console.log("Deploy URL:  ", result.deploy.oneClickUrl);
console.log("Audit log:   ", result.audit.dashboardUrl);
console.log("HMAC:        ", result.audit.entry.hmac);

// Persist the four generated files. \`config\` is { path: contents }.
import { writeFile, mkdir } from "node:fs/promises";
await mkdir("./out/lib", { recursive: true });
await Promise.all(
  Object.entries(result.config).map(([path, content]) =>
    writeFile(\`./out/\${path}\`, content),
  ),
);`;

const CHAIN_SESSIONS = `// Pass the same sessionId across multiple calls to chain them under
// a single forensic timeline.
const sessionId = crypto.randomUUID();

const r1 = await incorporate({ /* ... */, sessionId });
// later: more incorporations or /api/play tool calls under the same id

const audit = await fetchAudit(sessionId, { verify: true });
// audit.entries → all events in order
// audit.verification.tampered → 0 if log is clean`;

const ERROR_SHAPES = `import {
  incorporate,
  IncorporateError,
  IncorporateValidationError,
} from "@ar-agents/incorporate";

try {
  // Throws IncorporateValidationError on 422 instead of returning a result.
  const result = await incorporateOrThrow({ /* ... */ });
  // ...
} catch (err) {
  if (err instanceof IncorporateValidationError) {
    // Pre-flight rules failed. Findings are an array of { code, severity, field, message }.
    for (const f of err.findings) {
      console.error(f.code, f.field, f.message);
    }
  } else if (err instanceof IncorporateError) {
    // Network / unexpected HTTP. err.status + err.response are populated.
    console.error("HTTP", err.status, err.response);
  } else {
    throw err;
  }
}`;

const CURL_EQUIV = `curl -X POST https://ar-agents.ar/api/auto-incorporate \\
  -H "content-type: application/json" \\
  -d '{
    "denominacion": "ACME-AI SAS",
    "tipo": "SOCIEDAD-IA",
    "capitalSocial": 1,
    "objeto": "Operación de servicios digitales..."
  }'`;

export default function SdkPage() {
  return (
    <DocShell
      eyebrow="sdk · @ar-agents/incorporate"
      title="The agent-economy entry point."
      subtitle="Zero-dependency TypeScript client for /api/auto-incorporate. One async call returns the full AR sociedad-IA incorporation kit: generated source files, Vercel deploy URL, env-var manifest, legal checklist, signed audit-log reference."
    >
      <DocBlock>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <a
            href="https://www.npmjs.com/package/@ar-agents/incorporate"
            target="_blank"
            rel="noreferrer"
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              color: "#0072f5",
              padding: "4px 10px",
              borderRadius: 4,
              boxShadow: SHADOW_BORDER,
              textDecoration: "none",
            }}
          >
            npm v0.2.0
          </a>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              color: "#0a72ef",
              padding: "4px 10px",
              background: "#ebf5ff",
              borderRadius: 4,
            }}
          >
            MIT
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              color: "#22c55e",
              padding: "4px 10px",
              background: "#ecfdf5",
              borderRadius: 4,
            }}
          >
            SLSA v1 provenance
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              color: "#666",
              padding: "4px 10px",
              boxShadow: SHADOW_BORDER,
              borderRadius: 4,
            }}
          >
            ~4 KB · zero deps
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              color: "#666",
              padding: "4px 10px",
              boxShadow: SHADOW_BORDER,
              borderRadius: 4,
            }}
          >
            Node 20+ · Edge · CF Workers · Deno · browsers
          </span>
        </div>
        <DocP>
          <DocCode>@ar-agents/incorporate</DocCode> is the canonical npm
          surface for an external orchestrator (USA-LLC agent, ChatGPT
          extension, Claude tool, custom pipeline) to programmatically
          self-incorporate an Argentine sociedad-IA. The package is a thin
          fetch wrapper, no SDK gymnastics, no runtime adapters. The
          companion human-facing UI is at{" "}
          <a href="/incorporar" style={{ color: "var(--accent)" }}>
            /incorporar
          </a>
          ; same backend, same generated output.
        </DocP>
      </DocBlock>

      <DocH2>Install</DocH2>
      <CodeBlock>{INSTALL}</CodeBlock>

      <DocH2>Quickstart</DocH2>
      <DocP>
        One async call returns the four generated source files, the Vercel
        one-click deploy URL, the env-var manifest, the legal+operational
        checklist, and a signed audit-log reference:
      </DocP>
      <CodeBlock>{QUICKSTART}</CodeBlock>

      <DocH2>The shape of the result</DocH2>
      <DocP>Success returns:</DocP>
      <ul style={listStyle}>
        <Li>
          <code style={inlineCode}>sociedad</code>: <code style={inlineCode}>
            denominacion, tipo, capitalSocial, slug
          </code>
        </Li>
        <Li>
          <code style={inlineCode}>config</code>: object with{" "}
          <code style={inlineCode}>package.json</code>,{" "}
          <code style={inlineCode}>lib/agent.ts</code>,{" "}
          <code style={inlineCode}>.env.example</code>,{" "}
          <code style={inlineCode}>README.md</code>{" "}
          as string values
        </Li>
        <Li>
          <code style={inlineCode}>envVars</code>: array of{" "}
          <code style={inlineCode}>{`{ name, description }`}</code> for the
          host's secrets manager
        </Li>
        <Li>
          <code style={inlineCode}>checklist</code>: 8-step ARCA cert / MP
          token / Meta verify / IGJ inscription roadmap
        </Li>
        <Li>
          <code style={inlineCode}>deploy.oneClickUrl</code>: pre-filled
          Vercel clone URL pointing at <code style={inlineCode}>
            apps/sociedad-ia-starter
          </code>
        </Li>
        <Li>
          <code style={inlineCode}>audit</code>:{" "}
          <code style={inlineCode}>
            {`{ sessionId, backend, entry, url, verifyUrl, dashboardUrl }`}
          </code>:{" "}
        share <code style={inlineCode}>dashboardUrl</code> for a
          forensic timeline page; query{" "}
          <code style={inlineCode}>verifyUrl</code> for a re-verification
          report
        </Li>
      </ul>

      <DocP>
        Validation failure (HTTP 422) returns:{" "}
        <code style={inlineCode}>
          {`{ ok: false, validation: { findings: [...] }, rfc001 }`}
        </code>:{" "}
      handled as a normal outcome the agent fixes and retries.
      </DocP>

      <DocH2>Multi-step orchestration</DocH2>
      <DocP>
        Pass the same <code style={inlineCode}>sessionId</code> across
        multiple incorporations + downstream <code style={inlineCode}>
          /api/play
        </code>{" "}
        tool calls to chain them under a single forensic timeline:
      </DocP>
      <CodeBlock>{CHAIN_SESSIONS}</CodeBlock>

      <DocH2>Errors + validation</DocH2>
      <DocP>
        The thrown vs. returned distinction:{" "}
        <code style={inlineCode}>incorporate()</code> returns validation
        failures as a result;{" "}
        <code style={inlineCode}>incorporateOrThrow()</code> raises{" "}
        <code style={inlineCode}>IncorporateValidationError</code>{" "}
        instead. Network and unexpected HTTP errors raise{" "}
        <code style={inlineCode}>IncorporateError</code> in either case.
      </DocP>
      <CodeBlock>{ERROR_SHAPES}</CodeBlock>

      <DocH2>cURL equivalent</DocH2>
      <DocP>
        For pipelines that don't want a TypeScript dep, the underlying
        endpoint is callable directly:
      </DocP>
      <CodeBlock>{CURL_EQUIV}</CodeBlock>

      <DocH2>Audit log + verification badge</DocH2>
      <DocP>
        Every <code style={inlineCode}>incorporate()</code> call lands a
        signed entry in the session's audit log. Embed the verification
        badge in your README to show your forensic-clean status to anyone
        visiting:
      </DocP>
      <CodeBlock>
        {`![ar-agents audit](https://ar-agents.ar/api/badge/{sessionId})`}
      </CodeBlock>
      <DocP>
        Color + label updates live based on the audit log's verification
        state (verified · 5/5 / tampered · 1 / no-hmac / no entries).
        See the live forensic timeline at{" "}
        <code style={inlineCode}>/dashboard/{`{sessionId}`}</code> and the
        independent re-verification UI at{" "}
        <a href="/verify" style={{ color: "var(--accent)" }}>
          /verify
        </a>
        .
      </DocP>

      <DocH2>Cookbook</DocH2>
      <DocP>
        Recipe 18 in the cookbook is an end-to-end USA-LLC orchestrator
        that uses <code style={inlineCode}>@ar-agents/incorporate</code>{" "}
        to spin up an AR sociedad-IA, materialize the generated files,
        log the incorporation event, and verify the audit log before
        proceeding, RFC-001 § 7 + § 9.2 in 100 lines:
      </DocP>
      <DocP>
        <a
          href="https://github.com/ar-agents/ar-agents/blob/main/packages/mercadopago/cookbook/18-usa-llc-self-incorporates-ar.ts"
          style={{ color: "var(--accent)" }}
        >
          packages/mercadopago/cookbook/18-usa-llc-self-incorporates-ar.ts
        </a>
      </DocP>

      <DocH2>API reference</DocH2>
      <ul style={listStyle}>
        <Li>
          <code style={inlineCode}>incorporate(input, options?)</code>,
          POST. Returns success or validation-failure envelope.
        </Li>
        <Li>
          <code style={inlineCode}>incorporateOrThrow(input, options?)</code>:{" "}
        same as above but throws{" "}
          <code style={inlineCode}>IncorporateValidationError</code> on
          422.
        </Li>
        <Li>
          <code style={inlineCode}>describe(options?)</code>, fetches the
          endpoint's self-description for capability discovery.
        </Li>
        <Li>
          <code style={inlineCode}>fetchAudit(sessionId, options?)</code>:{" "}
        fetches the session's audit log; pass{" "}
          <code style={inlineCode}>{`{ verify: true }`}</code> for HMAC
          verification report.
        </Li>
      </ul>
      <DocP>
        Full input/output types ship as{" "}
        <code style={inlineCode}>.d.ts</code>, see{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/blob/main/packages/incorporate/src/index.ts"
          style={{ color: "var(--accent)" }}
        >
          packages/incorporate/src/index.ts
        </a>
        .
      </DocP>

      <DocH2>License + provenance</DocH2>
      <DocP>
        MIT. Every release ships{" "}
        <a
          href="https://slsa.dev"
          style={{ color: "var(--accent)" }}
        >
          SLSA v1
        </a>{" "}
        npm provenance attestations tying the published tarball to a
        specific GitHub commit + GitHub Actions runner. Verify with{" "}
        <code style={inlineCode}>
          npm view @ar-agents/incorporate dist.attestations
        </code>
        .
      </DocP>
      <SdkJsonLd />
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
        fontFamily: FONT_MONO,
        color: "var(--text-body)",
        overflow: "auto",
        boxShadow: SHADOW_CARD,
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
  paddingLeft: 20,
  fontSize: 14,
  marginBottom: 16,
};

const inlineCode: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 13,
  background: "var(--bg-tint)",
  padding: "1px 6px",
  borderRadius: 4,
  color: "var(--text)",
};
