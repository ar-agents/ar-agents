"use client";

import { useState } from "react";
import Link from "next/link";

interface Check {
  id: string;
  label: string;
  weight: number;
  status: "pass" | "fail" | "skip" | "warn";
  detail: string;
  source?: string;
  httpStatus?: number;
}

interface Certification {
  generatedAt: string;
  target: { baseUrl: string; sessionId: string | null };
  score: number;
  rating: "A" | "B" | "C" | "D" | "F" | "N/A";
  rfcConformance: {
    "rfc-002-v1": "pass" | "partial" | "fail" | "skip";
    "rfc-004-draft": "pass" | "partial" | "fail" | "skip";
  };
  checks: Check[];
  notes: string[];
}

const RATING_COLOR: Record<Certification["rating"], string> = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#eab308",
  D: "#f97316",
  F: "#ef4444",
  "N/A": "#737373",
};

const STATUS_COLOR: Record<Check["status"], string> = {
  pass: "#22c55e",
  warn: "#eab308",
  fail: "#ef4444",
  skip: "#737373",
};

const STATUS_LABEL: Record<Check["status"], string> = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
  skip: "SKIP",
};

const RFC_CONFORMANCE_COLOR: Record<Certification["rfcConformance"]["rfc-002-v1"], string> = {
  pass: "#22c55e",
  partial: "#eab308",
  fail: "#ef4444",
  skip: "#737373",
};

export function CertifierClient() {
  const [url, setUrl] = useState("https://ar-agents.ar");
  const [sessionId, setSessionId] = useState("ar-agents-sociedad-automatizada");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cert, setCert] = useState<Certification | null>(null);

  async function runCertification() {
    if (!url.trim()) {
      setError("Paste a URL first.");
      return;
    }
    setLoading(true);
    setError(null);
    setCert(null);
    try {
      const params = new URLSearchParams({ url: url.trim() });
      if (sessionId.trim()) params.set("sessionId", sessionId.trim());
      const r = await fetch(`/api/certifier?${params.toString()}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setCert(data as Certification);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "48px 24px 96px",
        color: "var(--text-body)",
        fontSize: 15,
        lineHeight: 1.6,
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
          }}
        >
          /certifier · live · no install
        </p>
        <h1
          style={{
            fontSize: 32,
            lineHeight: 1.15,
            fontWeight: 500,
            color: "var(--text-strong)",
            marginBottom: 12,
            letterSpacing: "-0.01em",
          }}
        >
          RFC conformance certifier.
        </h1>
        <p style={{ fontSize: 16 }}>
          Paste any base URL. The certifier fetches its public endpoints
          + scores RFC-002 + RFC-004 conformance in seconds. Score 0-100
          with per-check breakdown. No setup. No install. Run against
          your automated company, someone else&apos;s, or this site itself.
        </p>
      </header>

      {/* Form */}
      <section
        style={{
          padding: 20,
          background: "var(--bg-tint)",
          borderRadius: 8,
          boxShadow: "var(--card-shadow)",
          marginBottom: 24,
        }}
      >
        <label style={labelStyle}>
          Base URL
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-company.vercel.app"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Sample sessionId (optional, defaults to ar-agents-sociedad-automatizada)
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="ar-agents-sociedad-automatizada"
            style={inputStyle}
          />
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={runCertification}
            disabled={loading}
            style={{
              background: "var(--accent)",
              color: "var(--bg)",
              border: "none",
              padding: "10px 20px",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Running checks…" : "Certify"}
          </button>
          <small style={{ color: "var(--text-muted)" }}>
            Runs ~9 HTTP checks against the target. Cached 60s per URL.
          </small>
        </div>
      </section>

      {error && (
        <section
          style={{
            padding: 16,
            background: "#ef444422",
            color: "#ef4444",
            borderRadius: 8,
            marginBottom: 24,
            fontSize: 14,
          }}
        >
          {error}
        </section>
      )}

      {cert && (
        <section style={{ marginBottom: 32 }}>
          {/* Top scoreboard */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <ScoreCard
              big={`${cert.score}`}
              label="Overall score"
              color={RATING_COLOR[cert.rating]}
              annotation={`Rating: ${cert.rating}`}
            />
            <ScoreCard
              big={cert.rfcConformance["rfc-002-v1"]}
              label="RFC-002 v1"
              color={RFC_CONFORMANCE_COLOR[cert.rfcConformance["rfc-002-v1"]]}
            />
            <ScoreCard
              big={cert.rfcConformance["rfc-004-draft"]}
              label="RFC-004 draft"
              color={RFC_CONFORMANCE_COLOR[cert.rfcConformance["rfc-004-draft"]]}
            />
            <ScoreCard
              big={`${cert.checks.filter((c) => c.status === "pass").length}/${cert.checks.length}`}
              label="Checks passing"
              color="#737373"
            />
          </div>

          {cert.notes.length > 0 && (
            <div
              style={{
                padding: 14,
                background: "#eab30822",
                borderLeft: "3px solid #eab308",
                borderRadius: 4,
                marginBottom: 20,
                fontSize: 13.5,
              }}
            >
              {cert.notes.map((n, i) => (
                <div key={i} style={{ marginBottom: 4 }}>{n}</div>
              ))}
            </div>
          )}

          {/* Check list */}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {cert.checks.map((c) => (
              <li
                key={c.id}
                style={{
                  padding: 14,
                  background: "var(--bg-tint)",
                  borderRadius: 6,
                  boxShadow: "var(--card-shadow)",
                  marginBottom: 8,
                  borderLeft: `3px solid ${STATUS_COLOR[c.status]}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-strong)" }}>
                      {c.label}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-body)", marginTop: 4 }}>
                      {c.detail}
                    </div>
                    {c.source && (
                      <a
                        href={c.source}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "var(--text-muted)",
                          fontSize: 11,
                          textDecoration: "underline",
                          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                          marginTop: 4,
                          display: "inline-block",
                          wordBreak: "break-all",
                        }}
                      >
                        {c.source}{c.httpStatus ? ` · HTTP ${c.httpStatus}` : ""}
                      </a>
                    )}
                  </div>
                  <Badge text={STATUS_LABEL[c.status]} color={STATUS_COLOR[c.status]} />
                </div>
              </li>
            ))}
          </ul>

          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>
              Raw JSON
            </summary>
            <pre
              style={{
                marginTop: 12,
                padding: 14,
                background: "var(--bg-tint)",
                borderRadius: 6,
                fontSize: 11.5,
                lineHeight: 1.5,
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                overflow: "auto",
                maxHeight: 360,
              }}
            >
              {JSON.stringify(cert, null, 2)}
            </pre>
          </details>
        </section>
      )}

      {/* Explanation */}
      <section
        style={{
          marginTop: 32,
          paddingTop: 24,
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 12, fontWeight: 500, color: "var(--text-strong)" }}>
          What this checks
        </h2>
        <ul style={{ paddingLeft: 24, marginBottom: 16, fontSize: 14 }}>
          <li style={{ marginBottom: 6 }}>
            <strong>RFC-002:</strong>{" "}
            <code style={codeStyle}>/.well-known/agents.json</code> exists +
            has issuer.jurisdiction + endpoints.auditRead + rfcConformance.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>RFC-004:</strong> audit-read endpoint responds, verify=1
            returns counts, CSV export works.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Tooling:</strong> OpenAPI 3.x spec available, sitemap
            present, security headers (HSTS + X-Content-Type-Options).
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Discovery:</strong>{" "}
            <code style={codeStyle}>/api/discovery</code> alt path responds.
          </li>
        </ul>

        <h2 style={{ fontSize: 18, marginBottom: 12, fontWeight: 500, color: "var(--text-strong)", marginTop: 24 }}>
          What this does NOT check
        </h2>
        <ul style={{ paddingLeft: 24, marginBottom: 16, fontSize: 14 }}>
          <li style={{ marginBottom: 6 }}>
            <strong>HMAC validity</strong>, the certifier relies on the
            target&apos;s own verify=1 endpoint. To verify independently,
            fetch the entries + the public key (RFC-004 § 5) + run the
            cryptographic check client-side.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Business legitimacy</strong>, passing 100/100 means the
            technical scaffolding is in place. It does NOT mean the
            automated company is doing legal business; that&apos;s the
            regulator&apos;s job.
          </li>
          <li style={{ marginBottom: 6 }}>
            <strong>Operational health</strong>, endpoint up/down at this
            moment ≠ ran legitimately for 6 months. Use{" "}
            <Link href="/examples" style={linkStyle}>
              cookbook recipe 25
            </Link>{" "}
            for the long-horizon view.
          </li>
        </ul>

        <h2 style={{ fontSize: 18, marginBottom: 12, fontWeight: 500, color: "var(--text-strong)", marginTop: 24 }}>
          Programmatic access
        </h2>
        <p style={{ fontSize: 14, marginBottom: 12 }}>
          Hit the API directly. Same checks, same scoring, no UI:
        </p>
        <pre
          style={{
            padding: 12,
            background: "var(--bg-tint)",
            borderRadius: 6,
            fontSize: 12,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            overflow: "auto",
            marginBottom: 16,
          }}
        >
{`curl "https://ar-agents.ar/api/certifier?url=https://your-sociedad.vercel.app"
curl "https://ar-agents.ar/api/certifier?url=...&sessionId=abc12345"`}
        </pre>
      </section>

      <footer
        style={{
          marginTop: 64,
          paddingTop: 24,
          borderTop: "1px solid var(--border-subtle)",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        ar-agents.ar ·{" "}
        <Link href="/rfcs/002" style={linkStyle}>RFC-002</Link>{" · "}
        <Link href="/rfcs/004" style={linkStyle}>RFC-004</Link>{" · "}
        <Link href="/test-vectors" style={linkStyle}>/test-vectors</Link>{" · "}
        <Link href="/registro" style={linkStyle}>/registro</Link>{" · "}
        <Link href="/" style={linkStyle}>/</Link>
      </footer>
    </main>
  );
}

function ScoreCard({
  big,
  label,
  color,
  annotation,
}: {
  big: string | number;
  label: string;
  color: string;
  annotation?: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 300,
          color: "var(--text-strong)",
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          lineHeight: 1.1,
          textTransform: "uppercase",
        }}
      >
        {big}
      </div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginTop: 4,
        }}
      >
        {label}
      </div>
      {annotation && (
        <div style={{ fontSize: 11, marginTop: 4, color }}>{annotation}</div>
      )}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: "0.06em",
        padding: "3px 8px",
        background: `${color}22`,
        color,
        borderRadius: 4,
        fontWeight: 500,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {text}
    </span>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-strong)",
  marginBottom: 6,
  marginTop: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 4,
  padding: "10px 12px",
  background: "var(--bg)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 6,
  color: "var(--text-body)",
  fontSize: 14,
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
};

const linkStyle: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 12.5,
  padding: "1px 5px",
  background: "var(--bg-tint)",
  borderRadius: 4,
  color: "var(--text-strong)",
};
