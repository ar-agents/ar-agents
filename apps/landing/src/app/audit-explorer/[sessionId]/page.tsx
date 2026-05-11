import type { Metadata } from "next";
import Link from "next/link";
import { isSessionIdValid, readAudit, verifySession, type AuditEntry } from "@/lib/audit";
import { JsonLd } from "../../json-ld";

export const runtime = "nodejs";
export const revalidate = 10;

interface Props {
  params: Promise<{ sessionId: string }>;
}

export async function generateMetadata(
  { params }: Props,
): Promise<Metadata> {
  const { sessionId } = await params;
  return {
    title: `/audit-explorer/${sessionId} · session forensic view · ar-agents`,
    description: `Forensic investigation view of audit-log session ${sessionId}: governance breakdown, tool usage, duration histogram, anomalies, HMAC verification counts.`,
    alternates: { canonical: `https://ar-agents.vercel.app/audit-explorer/${sessionId}` },
  };
}

interface Aggregates {
  governance: Record<AuditEntry["governance"], number>;
  toolUsage: Record<string, number>;
  durationsByTool: Record<string, number[]>;
  errored: number;
  durationsAll: number[];
}

function aggregate(entries: AuditEntry[]): Aggregates {
  const a: Aggregates = {
    governance: {
      "algorithm-only": 0,
      "audit-logged": 0,
      "mocked-upstream": 0,
      "requires-confirmation": 0,
    },
    toolUsage: {},
    durationsByTool: {},
    errored: 0,
    durationsAll: [],
  };
  for (const e of entries) {
    a.governance[e.governance]++;
    a.toolUsage[e.tool] = (a.toolUsage[e.tool] ?? 0) + 1;
    if (e.errored) a.errored++;
    if (typeof e.durationMs === "number") {
      a.durationsAll.push(e.durationMs);
      (a.durationsByTool[e.tool] ??= []).push(e.durationMs);
    }
  }
  return a;
}

function p(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
  return sorted[idx];
}

const GOV_COLOR: Record<AuditEntry["governance"], string> = {
  "algorithm-only": "#737373",
  "audit-logged": "#0a72ef",
  "mocked-upstream": "#eab308",
  "requires-confirmation": "#22c55e",
};

export default async function AuditExplorerPage({ params }: Props) {
  const { sessionId } = await params;

  if (!isSessionIdValid(sessionId)) {
    return (
      <main style={mainStyle}>
        <h1 style={{ fontSize: 24, fontWeight: 500, marginBottom: 12 }}>
          Invalid sessionId
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
          Pattern: <code style={codeStyle}>{`^[A-Za-z0-9_-]{8,64}$`}</code>
        </p>
      </main>
    );
  }

  const [entries, verification] = await Promise.all([
    readAudit(sessionId),
    verifySession(sessionId),
  ]);

  const agg = aggregate(entries);
  const sortedDurations = [...agg.durationsAll].sort((a, b) => a - b);
  const govTotal = Object.values(agg.governance).reduce((a, b) => a + b, 0) || 1;
  const sortedTools = Object.entries(agg.toolUsage).sort(([, a], [, b]) => b - a);
  const firstTs = entries[0]?.ts ?? null;
  const lastTs = entries[entries.length - 1]?.ts ?? null;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "DataCatalog",
          name: `Audit explorer · ${sessionId}`,
          url: `https://ar-agents.vercel.app/audit-explorer/${sessionId}`,
        }}
      />

      <main style={mainStyle}>
        <header style={{ marginBottom: 24 }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 8,
            }}
          >
            /arg · /audit-explorer · live · {entries.length} entries
          </p>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 500,
              color: "var(--text-strong)",
              marginBottom: 8,
              letterSpacing: "-0.01em",
            }}
          >
            Session <code style={{ ...codeStyle, fontSize: 22 }}>{sessionId}</code>
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
            Forensic view: governance breakdown · tool usage · duration
            quantiles · timeline. Auto-refresh every 10s. Verify counts
            recomputed server-side.
          </p>
        </header>

        {/* Headline numbers */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
            marginBottom: 24,
          }}
        >
          <Card label="Entries total" value={String(entries.length)} />
          <Card label="Verified" value={String(verification.verified)} color="#22c55e" />
          <Card
            label="Tampered"
            value={String(verification.tampered)}
            color={verification.tampered > 0 ? "#ef4444" : "#737373"}
          />
          <Card
            label="HMAC wired"
            value={verification.hmacWired ? "yes" : "no"}
            color={verification.hmacWired ? "#22c55e" : "#eab308"}
          />
          <Card label="Errored" value={String(agg.errored)} color={agg.errored > 0 ? "#eab308" : "#737373"} />
          {/* RFC-005 asymmetric stats — only shown if any entry carries a signature. */}
          {verification.signedAsymmetric > 0 && (
            <Card
              label="Ed25519 signed"
              value={`${verification.signedAsymmetricVerified}/${verification.signedAsymmetric}`}
              color={
                verification.signedAsymmetricVerified === verification.signedAsymmetric
                  ? "#22c55e"
                  : "#ef4444"
              }
            />
          )}
        </section>

        {entries.length === 0 ? (
          <EmptyState sessionId={sessionId} />
        ) : (
          <>
            {/* Governance breakdown bar */}
            <Section title="Governance breakdown">
              <div
                style={{
                  display: "flex",
                  height: 28,
                  background: "var(--bg-tint)",
                  borderRadius: 6,
                  overflow: "hidden",
                  marginBottom: 8,
                  boxShadow: "var(--card-shadow)",
                }}
              >
                {(Object.keys(agg.governance) as AuditEntry["governance"][]).map((k) => {
                  const n = agg.governance[k];
                  if (n === 0) return null;
                  const pct = (n / govTotal) * 100;
                  return (
                    <div
                      key={k}
                      title={`${k}: ${n} (${pct.toFixed(1)}%)`}
                      style={{
                        background: GOV_COLOR[k],
                        width: `${pct}%`,
                        height: "100%",
                      }}
                    />
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12 }}>
                {(Object.keys(agg.governance) as AuditEntry["governance"][]).map((k) => (
                  <span key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: GOV_COLOR[k],
                        display: "inline-block",
                      }}
                    />
                    <code style={codeStyle}>{k}</code> · {agg.governance[k]}
                  </span>
                ))}
              </div>
            </Section>

            {/* Tool usage bars */}
            <Section title="Tool usage (top 12)">
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {sortedTools.slice(0, 12).map(([tool, n]) => {
                  const max = sortedTools[0][1];
                  const w = (n / max) * 100;
                  return (
                    <li
                      key={tool}
                      style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, fontSize: 13 }}
                    >
                      <code
                        style={{
                          ...codeStyle,
                          minWidth: 220,
                          maxWidth: 320,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tool}
                      </code>
                      <div
                        style={{
                          flex: 1,
                          height: 16,
                          background: "var(--bg-tint)",
                          borderRadius: 3,
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: `${w}%`,
                            background: "var(--accent)",
                            opacity: 0.6,
                          }}
                        />
                      </div>
                      <span
                        style={{
                          minWidth: 36,
                          textAlign: "right",
                          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                          fontSize: 12.5,
                          color: "var(--text-strong)",
                        }}
                      >
                        {n}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>

            {/* Duration quantiles */}
            {sortedDurations.length > 0 && (
              <Section title="Latency · overall">
                <div style={{ display: "flex", gap: 16, fontSize: 13, fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                  <span>
                    <strong>p50</strong>{" "}
                    <span style={{ color: "var(--text-strong)" }}>{p(sortedDurations, 50)} ms</span>
                  </span>
                  <span>
                    <strong>p95</strong>{" "}
                    <span style={{ color: "var(--text-strong)" }}>{p(sortedDurations, 95)} ms</span>
                  </span>
                  <span>
                    <strong>p99</strong>{" "}
                    <span style={{ color: "var(--text-strong)" }}>{p(sortedDurations, 99)} ms</span>
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>
                    · n={sortedDurations.length}
                  </span>
                </div>
              </Section>
            )}

            {/* Latest 30 entries with mini-timeline */}
            <Section title={`Timeline (latest ${Math.min(30, entries.length)})`}>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {entries.slice(-30).reverse().map((e) => (
                  <li
                    key={e.id}
                    style={{
                      padding: "8px 12px",
                      borderLeft: `3px solid ${GOV_COLOR[e.governance]}`,
                      background: "var(--bg-tint)",
                      borderRadius: 4,
                      marginBottom: 6,
                      fontSize: 12.5,
                      display: "flex",
                      alignItems: "baseline",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <code style={{ ...codeStyle, fontSize: 11, color: "var(--text-muted)" }}>
                      {e.ts.replace("T", " ").replace("Z", "")}
                    </code>
                    <code style={{ ...codeStyle, fontSize: 12.5 }}>{e.tool}</code>
                    <span
                      style={{
                        fontSize: 10,
                        color: GOV_COLOR[e.governance],
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {e.governance}
                    </span>
                    {typeof e.durationMs === "number" && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {e.durationMs}ms
                      </span>
                    )}
                    {e.errored && (
                      <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 500 }}>
                        ERROR
                      </span>
                    )}
                    {!e.hmac && (
                      <span style={{ fontSize: 10, color: "#eab308" }}>
                        NO-HMAC
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>

            {/* Session span */}
            <Section title="Session span">
              <ul style={{ paddingLeft: 24, fontSize: 13, marginBottom: 12 }}>
                <li>
                  <strong>First entry:</strong>{" "}
                  <code style={codeStyle}>{firstTs}</code>
                </li>
                <li>
                  <strong>Last entry:</strong>{" "}
                  <code style={codeStyle}>{lastTs}</code>
                </li>
              </ul>
            </Section>
          </>
        )}

        {/* Action row */}
        <section
          style={{
            marginTop: 24,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 13,
          }}
        >
          <a href={`/api/play/audit/${sessionId}`} style={btnSty}>
            JSON
          </a>
          <a href={`/api/play/audit/${sessionId}/csv`} style={btnSty}>
            CSV
          </a>
          <a href={`/api/play/audit/${sessionId}?verify=1`} style={btnSty}>
            Verify
          </a>
          <a href={`/api/audit-summary/${sessionId}`} style={btnSty}>
            Summary JSON
          </a>
          <a href={`/api/rfc-003-envelope?sessionId=${sessionId}`} style={btnSty}>
            RFC-003 envelope
          </a>
          <a
            href={`/api/cert-badge?url=https://ar-agents.vercel.app&sessionId=${sessionId}`}
            style={btnSty}
          >
            Cert badge SVG
          </a>
          <a href={`/verify?sessionId=${sessionId}`} style={btnSty}>
            /verify
          </a>
        </section>

        <footer
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: "1px solid var(--border-subtle)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          ar-agents.vercel.app ·{" "}
          <Link href="/" style={linkSty}>/</Link>{" · "}
          <Link href="/architecture/audit-log" style={linkSty}>/architecture/audit-log</Link>{" · "}
          <Link href="/auditor" style={linkSty}>/auditor</Link>
        </footer>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-muted)",
          marginBottom: 12,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        padding: 12,
        background: "var(--bg-tint)",
        borderRadius: 6,
        boxShadow: "var(--card-shadow)",
        borderLeft: `3px solid ${color ?? "#737373"}`,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 300,
          color: "var(--text-strong)",
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function EmptyState({ sessionId }: { sessionId: string }) {
  return (
    <div
      style={{
        padding: 20,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        textAlign: "center",
        fontSize: 14,
        color: "var(--text-muted)",
      }}
    >
      <p>No entries found for session <code style={codeStyle}>{sessionId}</code>.</p>
      <p style={{ marginTop: 8 }}>
        Run a session by{" "}
        <Link href="/play" style={linkSty}>visiting /play</Link>{" "}
        or POSTing to{" "}
        <code style={codeStyle}>/api/play</code>.
      </p>
    </div>
  );
}

const mainStyle: React.CSSProperties = {
  maxWidth: 920,
  margin: "0 auto",
  padding: "48px 24px 96px",
  color: "var(--text-body)",
  fontSize: 15,
  lineHeight: 1.6,
};

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 12.5,
  padding: "1px 5px",
  background: "var(--bg)",
  borderRadius: 4,
  color: "var(--text-strong)",
};

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const btnSty: React.CSSProperties = {
  background: "var(--bg-tint)",
  color: "var(--text-strong)",
  border: "1px solid var(--border-subtle)",
  padding: "6px 12px",
  borderRadius: 4,
  fontSize: 12,
  textDecoration: "none",
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
};
