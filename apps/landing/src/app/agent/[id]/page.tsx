import type { Metadata } from "next";
import Link from "next/link";
import {
  getAgentRecord,
  isValidAgentId,
  type AgentRecord,
} from "@/lib/agent-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const norm = id.toLowerCase();
  const title = `Agent ${norm.slice(0, 10)}… · verified identity · ar-agents`;
  return {
    title,
    description:
      "A verifiable agent identity: proof that this key controls its published identity doc, checkable by anyone without trusting ar-agents.",
    alternates: { canonical: `https://ar-agents.ar/agent/${norm}` },
    openGraph: { title, type: "profile", url: `https://ar-agents.ar/agent/${norm}` },
  };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const norm = id.toLowerCase();
  const record = isValidAgentId(norm) ? await getAgentRecord(norm) : null;

  return (
    <main
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "48px 24px 96px",
        color: "var(--text-body)",
        fontSize: 15,
        lineHeight: 1.6,
      }}
    >
      {record ? <Profile record={record} /> : <NotVerified id={norm} valid={isValidAgentId(norm)} />}
    </main>
  );
}

function Profile({ record }: { record: AgentRecord }) {
  const badgeUrl = `https://ar-agents.ar/api/identity/badge/${record.id}`;
  const recordUrl = `/api/identity/${record.id}`;
  return (
    <>
      <header style={{ marginBottom: 24 }}>
        <p style={eyebrow}>verified agent identity</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 500,
              color: "var(--text-strong)",
              letterSpacing: "-0.01em",
              margin: 0,
              fontFamily: FONT_MONO,
              wordBreak: "break-all",
            }}
          >
            {record.name || record.id}
          </h1>
          <span style={pill("#10b981")}>verified</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
          Verified {new Date(record.firstVerifiedAt).toISOString().slice(0, 10)}
          {record.reverifyCount > 1 ? ` · re-checked ${record.reverifyCount}x` : ""}
        </p>
      </header>

      {/* Cryptographically established */}
      <Section title="Proven (cryptographic)">
        <Row k="Scheme" v={record.scheme} />
        <Row
          k={record.scheme === "evm-secp256k1" ? "Address" : "Public key"}
          v={record.subject}
          mono
        />
        {record.chainId ? <Row k="Chain id" v={String(record.chainId)} /> : null}
        {record.accountType ? <Row k="Account type" v={record.accountType} /> : null}
        <Row k="Doc sha256" v={record.docHash} mono />
        <Row k="Binding" v={record.binding.scheme} />
      </Section>

      {/* Self-declared */}
      <Section title="Self-declared (not audited)">
        <Row k="Name" v={record.name || "—"} />
        <Row k="Operator" v={record.operator || "—"} />
        <Row
          k="Homepage"
          v={
            record.homepage ? (
              <a href={record.homepage} style={link} rel="nofollow noopener" target="_blank">
                {record.homepage}
              </a>
            ) : (
              "—"
            )
          }
        />
        <Row k="Jurisdiction" v={record.jurisdiction || "—"} />
        {record.origin ? <Row k="Origin" v={record.origin} mono /> : null}
        {record.evidence && Object.keys(record.evidence).length > 0 ? (
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Evidence links (self-declared, verify them yourself):</span>
            <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
              {Object.entries(record.evidence).map(([k, v]) => (
                <li key={k} style={{ fontSize: 13 }}>
                  {k}:{" "}
                  {typeof v === "string" && v.startsWith("http") ? (
                    <a href={v} style={link} rel="nofollow noopener" target="_blank">
                      {v}
                    </a>
                  ) : (
                    String(v)
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      {/* Verify it yourself */}
      <Section title="Verify this yourself">
        <p style={{ fontSize: 14, marginTop: 0 }}>
          Do not trust us. Pull the signed doc and check the signature with the
          open method. If it verifies, the key controls the doc, period.
        </p>
        <pre style={pre}>{`curl -s https://ar-agents.ar${recordUrl}`}</pre>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Method:{" "}
          <a href="https://github.com/ar-agents/ar-agents/tree/main/packages/identity-attest" style={link}>
            @ar-agents/identity-attest/key-binding
          </a>
          . Recompute the doc hash, rebuild the statement, check the signature.
        </p>
      </Section>

      {/* Badge */}
      <Section title="Badge">
        <p style={{ margin: "0 0 10px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={badgeUrl} alt="agent verified badge" style={{ height: 20 }} />
        </p>
        <pre style={pre}>{`[![agent](${badgeUrl})](https://ar-agents.ar/agent/${record.id})`}</pre>
      </Section>

      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 24 }}>
        <Link href="/identity" style={link}>
          Verify your own agent
        </Link>{" "}
        ·{" "}
        <Link href="/registro" style={link}>
          Registry
        </Link>{" "}
        ·{" "}
        <a href="/api/agents" style={link}>
          Directory API
        </a>
      </p>
    </>
  );
}

function NotVerified({ id, valid }: { id: string; valid: boolean }) {
  return (
    <div style={{ paddingTop: 32 }}>
      <p style={eyebrow}>verified agent identity</p>
      <h1 style={{ fontSize: 24, fontWeight: 500, color: "var(--text-strong)", marginBottom: 12 }}>
        No verified agent here yet.
      </h1>
      <p style={{ fontSize: 15 }}>
        {valid
          ? `No agent with id ${id} has been verified (or this deployment has no registry storage wired).`
          : `${id} is not a valid agent id.`}
      </p>
      <p style={{ marginTop: 16 }}>
        <Link href="/identity" style={link}>
          Verify an agent
        </Link>
      </p>
    </div>
  );
}

// ── small presentational helpers ─────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: 20,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        marginBottom: 16,
      }}
    >
      <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "0 0 12px" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "5px 0", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: "var(--text-muted)", minWidth: 110 }}>{k}</span>
      <span style={{ fontSize: 13.5, color: "var(--text-body)", fontFamily: mono ? FONT_MONO : undefined, wordBreak: "break-all", flex: 1 }}>
        {v}
      </span>
    </div>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 8,
};

const link: React.CSSProperties = { color: "var(--accent)" };

const pre: React.CSSProperties = {
  background: "var(--bg)",
  padding: 14,
  borderRadius: 6,
  fontSize: 12.5,
  lineHeight: 1.5,
  fontFamily: FONT_MONO,
  color: "var(--text-body)",
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  border: "1px solid var(--border-subtle)",
};

function pill(color: string): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    color: "#fff",
    background: color,
    padding: "3px 10px",
    borderRadius: 999,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };
}
