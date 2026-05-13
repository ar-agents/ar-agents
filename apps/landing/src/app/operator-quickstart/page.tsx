import type { Metadata } from "next";
import Link from "next/link";

/**
 * /operator-quickstart, zero-to-listed-on-/registro in 15 minutes.
 *
 * For the operator who has already deployed their own sociedad-IA (or
 * is about to). Walks through the env vars, the conformance pipeline,
 * and the registry submission.
 *
 * Different from /incorporar (the wizard for FIRST-time incorporation).
 * This page is for "I have a deployment, now what do I do to claim
 * 100/100 conformance?"
 */

export const metadata: Metadata = {
  title: "/operator-quickstart · zero-to-listed in 15 minutes · ar-agents",
  description:
    "Step-by-step for operators who have deployed a sociedad-IA and want to: wire env vars, claim 100/100 conformance on /certifier, get listed on the public /registro. 15 minutes start-to-finish.",
  alternates: { canonical: "https://ar-agents.ar/operator-quickstart" },
};

export default function QuickstartPage() {
  return (
    <main
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "48px 24px 96px",
        color: "var(--text-body)",
        fontSize: 15,
        lineHeight: 1.65,
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 8,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          }}
        >
          /operator-quickstart · 15 minutes
        </p>
        <h1
          style={{
            fontSize: 32,
            lineHeight: 1.1,
            fontWeight: 500,
            color: "var(--text-strong)",
            marginBottom: 14,
            letterSpacing: "-0.01em",
          }}
        >
          From deployed to listed in 15 minutes.
        </h1>
        <p style={{ fontSize: 16 }}>
          You already deployed your sociedad-IA (or are about to via the{" "}
          <A href="/incorporar">wizard</A> or the{" "}
          <A href="https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter">
            starter
          </A>
          ). This page is the rest: env vars, conformance pipeline,
          public registry. Run end-to-end in 15 minutes; if any step
          fails, every check has a remediation pointer.
        </p>
      </header>

      <Step
        n={1}
        title="Wire the audit-log env vars"
        minutes={3}
      >
        <P>
          On your Vercel project (or wherever you deployed), set these
          six environment variables under <em>Production</em>:
        </P>
        <Code>{`AUDIT_HMAC_SECRET            <random 32+ char base64>          # RFC-004 v1 HMAC key
AUDIT_ED25519_PRIVATE_KEY    <PKCS8 base64url>                # RFC-005 § 4 private key
AUDIT_ED25519_PUBLIC_KEY     <SPKI base64url>                 # for self-verify
AUDIT_ED25519_KEY_ID         your-sociedad-key-2026-05        # matches keys.json
KV_REST_API_URL              https://*.upstash.io             # audit-log storage
KV_REST_API_TOKEN            <your token>`}</Code>
        <P>
          Generate the Ed25519 keypair via{" "}
          <A href="/examples">cookbook recipe 29</A>, it prints both
          the public-keys JSON (drop into your repo at{" "}
          <Code inline>public/.well-known/sociedad-ia/keys.json</Code>)
          and the private key (paste into the env var above).
        </P>
      </Step>

      <Step n={2} title="Publish your /.well-known/agents.json" minutes={2}>
        <P>
          Drop this file at{" "}
          <Code inline>public/.well-known/agents.json</Code> in your
          deployment&apos;s root. Replace the placeholders.
        </P>
        <Code>{`{
  "$schema": "https://ar-agents.ar/schemas/agents.v1.json",
  "name": "<your-sociedad-name>",
  "homepage": "https://your-sociedad.example",
  "license": "MIT",
  "issuer": {
    "jurisdiction": "AR",
    "type": "sociedad-ia",
    "operatorName": "<your full legal name>",
    "operatorCuit": "20-12345678-9",
    "supervisionRegime": "rfc-001-v1",
    "denominacion": "<your sociedad's denominación social>"
  },
  "rfcConformance": [
    "rfc-001-v1",
    "rfc-002-v1",
    "rfc-004-draft",
    "rfc-005-draft"
  ],
  "auditEndpoints": {
    "auditRead":   "https://your-sociedad.example/api/play/audit/{sessionId}",
    "auditVerify": "https://your-sociedad.example/api/play/audit/{sessionId}?verify=1",
    "auditCsv":    "https://your-sociedad.example/api/play/audit/{sessionId}/csv"
  }
}`}</Code>
        <P>
          If your deployment doesn&apos;t run audit endpoints (e.g.
          you&apos;re a single-library demo), drop{" "}
          <Code inline>rfc-004-draft</Code> + the{" "}
          <Code inline>auditEndpoints</Code> block from the manifest.
          The certifier honors what you claim: skipping checks for
          unclaimed RFCs, failing only on overclaim.
        </P>
      </Step>

      <Step n={3} title="Redeploy + verify" minutes={3}>
        <P>
          Trigger a redeploy so the env vars + the well-known files
          are picked up. Then run the certifier:
        </P>
        <Code>{`# Run the public certifier against your URL
curl "https://ar-agents.ar/api/certifier?url=https://your-sociedad.example" \\
  | jq '.score, .rating, .rfcConformance'`}</Code>
        <P>
          Expect <Code inline>score: 100, rating: &quot;A&quot;</Code>.
          If the score is lower, the per-check breakdown tells you
          which check failed + how to fix it. Run{" "}
          <A href="/examples">recipe 28</A> (operator readiness) for
          a more detailed pre-launch breakdown.
        </P>
      </Step>

      <Step n={4} title="Run a session to populate the audit log" minutes={2}>
        <P>
          With the env vars wired, any{" "}
          <Code inline>appendAudit()</Code> call in your app will write
          an entry with both <Code inline>hmac</Code> (RFC-004 v1) and{" "}
          <Code inline>signature</Code> (RFC-005 v1 Ed25519) fields.
          Run a session through your app, then verify:
        </P>
        <Code>{`# Read the session with HMAC + Ed25519 verification
curl "https://your-sociedad.example/api/play/audit/SESSION_ID?verify=1" | jq '.verification'

# Expected output:
# {
#   "total": N,
#   "verified": N,                       ← HMAC verified
#   "tampered": 0,
#   "hmacWired": true,
#   "signedAsymmetric": N,               ← entries dual-signed
#   "signedAsymmetricVerified": N         ← Ed25519 verified offline
# }`}</Code>
      </Step>

      <Step n={5} title="Submit to /registro" minutes={5}>
        <P>
          Run{" "}
          <A href="/examples">cookbook recipe 30</A> with a config JSON
          describing your sociedad. It will:
        </P>
        <ul style={ulSty}>
          <li style={liSty}>
            Run recipe 28 (operator readiness), must pass{" "}
            <Code inline>readiness: &quot;ready&quot;</Code> or{" "}
            <Code inline>&quot;almost&quot;</Code>.
          </li>
          <li style={liSty}>
            Run recipe 26 (certifier), must score ≥ 60 (rating C+).
          </li>
          <li style={liSty}>
            Validate honesty heuristics (CUIT format, demo-vs-productive
            disclosure language).
          </li>
          <li style={liSty}>
            Print a copy-paste Markdown PR body for the registry
            submission.
          </li>
        </ul>
        <P>
          Open a PR against{" "}
          <A href="https://github.com/ar-agents/ar-agents">github.com/ar-agents/ar-agents</A>{" "}
          modifying{" "}
          <Code inline>apps/landing/src/app/registro/page.tsx</Code>{" "}
          with the entry. Merge typically within hours; live in /registro
          on the next build (~1h).
        </P>
      </Step>

      <Section title="What you get when you finish">
        <ul style={ulSty}>
          <li style={liSty}>
            A green <strong>A · 100/100</strong> cert badge for your
            sociedad, embeddable in your own site via{" "}
            <Code inline>https://ar-agents.ar/api/cert-badge?url=YOUR_URL</Code>
          </li>
          <li style={liSty}>
            A row on the public <A href="/registro">/registro</A> with
            a live conformance sparkline (populated by the daily Vercel
            cron at <Code inline>/api/auto-monitor</Code>).
          </li>
          <li style={liSty}>
            Audit-log entries dual-signed with HMAC + Ed25519, verifiable
            offline using your public key at{" "}
            <Code inline>/.well-known/sociedad-ia/keys.json</Code>.
          </li>
          <li style={liSty}>
            A quarterly compliance report can be generated by running{" "}
            <A href="/examples">recipe 25</A> against your sessionIds.
          </li>
        </ul>
      </Section>

      <Section title="If something breaks">
        <P>
          Open an issue at{" "}
          <A href="https://github.com/ar-agents/ar-agents/issues">
            github.com/ar-agents/ar-agents/issues
          </A>{" "}
          with: your sociedad URL + the certifier output (
          <Code inline>curl https://ar-agents.ar/api/certifier?url=YOUR_URL</Code>
          ). The per-check breakdown narrows the cause quickly.
        </P>
      </Section>

      <footer
        style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: "1px solid var(--border-subtle)",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        ar-agents.ar ·{" "}
        <Link href="/" style={linkSty}>/</Link>{" · "}
        <Link href="/highlights" style={linkSty}>/highlights</Link>{" · "}
        <Link href="/incorporar" style={linkSty}>/incorporar</Link>{" · "}
        <Link href="/examples" style={linkSty}>/examples</Link>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        marginTop: 36,
        paddingTop: 24,
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <h2
        style={{
          fontSize: 20,
          fontWeight: 500,
          color: "var(--text-strong)",
          marginBottom: 14,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Step({
  n,
  title,
  minutes,
  children,
}: {
  n: number;
  title: string;
  minutes: number;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
            width: 28,
            height: 28,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {n}
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 500,
            color: "var(--text-strong)",
            margin: 0,
            flex: 1,
          }}
        >
          {title}
        </h2>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          }}
        >
          ~{minutes} min
        </span>
      </div>
      <div style={{ paddingLeft: 40 }}>{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ marginBottom: 12 }}>{children}</p>;
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  if (external) {
    return (
      <a href={href} style={linkSty}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} style={linkSty}>
      {children}
    </Link>
  );
}

function Code({ children, inline = false }: { children: React.ReactNode; inline?: boolean }) {
  if (inline) {
    return (
      <code
        style={{
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 13,
          padding: "1px 5px",
          background: "var(--bg-tint)",
          borderRadius: 4,
          color: "var(--text-strong)",
        }}
      >
        {children}
      </code>
    );
  }
  return (
    <pre
      style={{
        padding: 14,
        background: "var(--bg-tint)",
        borderRadius: 8,
        fontSize: 12.5,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        lineHeight: 1.55,
        overflow: "auto",
        marginBottom: 12,
        boxShadow: "var(--card-shadow)",
        whiteSpace: "pre",
        color: "var(--text-body)",
      }}
    >
      {children}
    </pre>
  );
}

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const ulSty: React.CSSProperties = {
  paddingLeft: 24,
  marginBottom: 12,
};

const liSty: React.CSSProperties = {
  marginBottom: 8,
  lineHeight: 1.55,
};
