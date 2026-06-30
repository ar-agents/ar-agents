"use client";

import { useState } from "react";

/**
 * Lean client form for the mock-PSP demo. Posts an entity reference to
 * /api/mock-psp/decide (which queries the public good-standing oracle server
 * side) and renders the accept/reject decision plus the oracle answer it was
 * based on. No business logic lives here — the decision is computed server side.
 */

const MONO = "var(--font-geist-mono), ui-monospace, monospace";

interface DecideResult {
  decision?: "approve" | "reject";
  reason?: string;
  reasonCode?: string;
  query?: { by?: string; value?: string };
  policy?: { minScore?: number; attestingState?: string };
  oracleAnswer?: {
    body?: {
      found?: boolean;
      record?: { id?: string; name?: string; status?: string } | null;
      goodStanding?: {
        state?: string;
        score?: number | null;
        rating?: string | null;
        reason?: string;
        basis?: string;
      } | null;
    };
    sig?: string;
  };
  error?: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  fontSize: 15,
  fontFamily: MONO,
  background: "var(--bg-tint)",
  color: "var(--text)",
  border: "1px solid var(--border-color)",
  borderRadius: 8,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "var(--text-muted)",
  margin: "0 0 6px",
};

export function MockPspClient() {
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DecideResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derive which field the input is (no effect/state): a URL goes to `url`,
  // an all-digits value (with separators) to `cuit`, otherwise a registry `id`.
  function fieldFor(value: string): { url?: string; id?: string; cuit?: string } {
    const v = value.trim();
    if (/^https?:\/\//i.test(v)) return { url: v };
    if (/^[\d.\- ]+$/.test(v) && v.replace(/\D/g, "").length >= 8) return { cuit: v };
    return { id: v };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = ref.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/mock-psp/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fieldFor(trimmed)),
      });
      const data = (await res.json()) as DecideResult;
      if (!res.ok || data.error) {
        setError(data.error || `request failed (${res.status})`);
      } else {
        setResult(data);
      }
    } catch {
      setError("network error");
    } finally {
      setLoading(false);
    }
  }

  const approved = result?.decision === "approve";
  const gs = result?.oracleAnswer?.body?.goodStanding;
  const rec = result?.oracleAnswer?.body?.record;
  const decisionColor = approved ? "#1a7f37" : "#cf222e";

  return (
    <div>
      <form onSubmit={onSubmit} style={{ margin: "0 0 24px" }}>
        <label htmlFor="entity-ref" style={labelStyle}>
          Entity URL, registry id, or CUIT
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            id="entity-ref"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="https://example.ar  ·  ar-agents-ref  ·  20-12345678-6"
            autoComplete="off"
            spellCheck={false}
            style={{ ...inputStyle, flex: "1 1 280px" }}
          />
          <button
            type="submit"
            disabled={loading || !ref.trim()}
            style={{
              padding: "11px 22px",
              fontSize: 15,
              fontWeight: 600,
              fontFamily: MONO,
              color: "#fff",
              background: loading || !ref.trim() ? "var(--text-muted)" : "var(--accent)",
              border: "none",
              borderRadius: 8,
              cursor: loading || !ref.trim() ? "default" : "pointer",
            }}
          >
            {loading ? "Checking…" : "Check"}
          </button>
        </div>
      </form>

      {error ? (
        <p style={{ color: "#cf222e", fontFamily: MONO, fontSize: 14 }}>{error}</p>
      ) : null}

      {result ? (
        <div
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--bg-tint)",
          }}
        >
          <div
            style={{
              padding: "16px 18px",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: "#fff",
                background: decisionColor,
                padding: "4px 12px",
                borderRadius: 999,
              }}
            >
              {approved ? "Approved" : "Rejected"}
            </span>
            <span style={{ fontSize: 14, color: "var(--text-body)", flex: "1 1 200px" }}>
              {result.reason}
            </span>
          </div>

          <dl style={{ margin: 0, padding: "16px 18px", display: "grid", gap: 10 }}>
            <Row label="Queried by" value={`${result.query?.by ?? "-"} = ${result.query?.value ?? "-"}`} />
            <Row label="Found in registry" value={result.oracleAnswer?.body?.found ? "yes" : "no"} />
            {rec ? <Row label="Entity" value={`${rec.name ?? rec.id ?? "-"}`} /> : null}
            {gs ? <Row label="Good-standing state" value={gs.state ?? "-"} /> : null}
            {gs ? (
              <Row
                label="Score / rating"
                value={`${gs.score ?? "-"}${gs.rating ? ` (${gs.rating})` : ""}`}
              />
            ) : null}
            <Row
              label="Policy"
              value={`min score ${result.policy?.minScore ?? "-"}, state must be ${result.policy?.attestingState ?? "active"}`}
            />
            <Row label="Oracle signature" value={result.oracleAnswer?.sig ? "present (Ed25519)" : "not configured"} />
          </dl>

          <details style={{ borderTop: "1px solid var(--border-color)" }}>
            <summary
              style={{
                padding: "12px 18px",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--text-muted)",
                fontFamily: MONO,
              }}
            >
              oracle answer (raw)
            </summary>
            <pre
              style={{
                margin: 0,
                padding: "0 18px 18px",
                overflowX: "auto",
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--text-body)",
                fontFamily: MONO,
              }}
            >
              {JSON.stringify(result.oracleAnswer, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
      <dt style={{ flex: "0 0 160px", color: "var(--text-muted)" }}>{label}</dt>
      <dd style={{ margin: 0, color: "var(--text)", fontFamily: MONO, wordBreak: "break-word" }}>
        {value}
      </dd>
    </div>
  );
}
