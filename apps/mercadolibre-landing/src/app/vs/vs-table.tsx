"use client";

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

type Cell =
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "partial" }
  | { kind: "text"; text: string };

type Row = {
  feature: string;
  detail?: string;
  ours: Cell;
  archived: Cell;
  naive: Cell;
};

const ROWS: ReadonlyArray<Row> = [
  {
    feature: "Maintained",
    detail: "Last meaningful commit",
    ours: { kind: "text", text: "Active" },
    archived: { kind: "text", text: "Feb 2022" },
    naive: { kind: "text", text: "Your repo" },
  },
  {
    feature: "Typed end-to-end",
    detail: "TypeScript strict + Zod-validated responses",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "partial" },
  },
  {
    feature: "Vercel AI SDK 6 tools",
    detail: "14 drop-in tools with discriminated-union results",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "no" },
  },
  {
    feature: "OAuth single-use refresh-token coalescing",
    detail: "Per-userId mutex + documented CAS pattern",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "no" },
  },
  {
    feature: "Per-seller rate limiter (token bucket)",
    detail: "Default 24/s burst 60, idle-bucket sweep",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "no" },
  },
  {
    feature: "Idempotent-only retry by default",
    detail: "POST/PATCH never retry on 5xx (split-brain risk)",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "no" },
  },
  {
    feature: "/myfeeds 2-day replay + dedup",
    detail: "iterateAllMissedFeeds with (topic, resource, sent) key",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "no" },
  },
  {
    feature: "Claim 2-day SLA defender",
    detail: "Sequential evidence uploads + failedEvidences surface",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "no" },
  },
  {
    feature: "Reputation thermometer alerts",
    detail: "evaluateReputationAlerts + monitorReputation generator",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "no" },
  },
  {
    feature: "Promotion margin guard",
    detail: "autoOptInPromotions skips below configurable floor",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "no" },
  },
  {
    feature: "Heuristic spam classifier for questions",
    detail: "Explainable features, no LLM dependency",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "no" },
  },
  {
    feature: "Edge-runtime native",
    detail: "Web Crypto only, no node:* imports",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "partial" },
  },
  {
    feature: "Telemetry hooks",
    detail: "onRequest / onResponse / onRetry / onRateLimitWait",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "no" },
  },
  {
    feature: "MCP server bundling",
    detail: "@ar-agents/mcp = drop into Claude Desktop / Cursor / Codeium",
    ours: { kind: "yes" },
    archived: { kind: "no" },
    naive: { kind: "no" },
  },
  {
    feature: "Bundle size (brotli)",
    detail: "Full ESM with all deps",
    ours: { kind: "text", text: "11 KB" },
    archived: { kind: "text", text: "n/a" },
    naive: { kind: "text", text: "≥ 80 KB after auth+retry" },
  },
  {
    feature: "Production CVEs",
    ours: { kind: "text", text: "0" },
    archived: { kind: "text", text: "n/a" },
    naive: { kind: "text", text: "Your call" },
  },
  {
    feature: "Tests",
    detail: "Unit + integration vs live MELI + property-based",
    ours: { kind: "text", text: "111 + 4 + 10" },
    archived: { kind: "text", text: "n/a" },
    naive: { kind: "text", text: "Your call" },
  },
];

export function VsTable() {
  return (
    <div
      style={{
        background: "var(--bg-tint)",
        borderRadius: 12,
        boxShadow: "var(--shadow-border)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 1fr) 110px 130px 110px",
          gap: 0,
          fontSize: 12,
          fontFamily: FONT_MONO,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          fontWeight: 600,
          padding: "14px 18px",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div>Feature</div>
        <div style={{ textAlign: "center" }}>This</div>
        <div style={{ textAlign: "center" }}>Archived SDK</div>
        <div style={{ textAlign: "center" }}>Naïve fetch</div>
      </div>
      {ROWS.map((row, i) => (
        <div
          key={row.feature}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 1fr) 110px 130px 110px",
            gap: 0,
            padding: "14px 18px",
            borderTop: i === 0 ? "none" : "1px solid var(--border-color)",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{row.feature}</div>
            {row.detail && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 3,
                  lineHeight: 1.45,
                }}
              >
                {row.detail}
              </div>
            )}
          </div>
          <CellRender cell={row.ours} highlight />
          <CellRender cell={row.archived} />
          <CellRender cell={row.naive} />
        </div>
      ))}
    </div>
  );
}

function CellRender({ cell, highlight = false }: { cell: Cell; highlight?: boolean }) {
  const center: React.CSSProperties = {
    textAlign: "center",
    fontSize: 13,
    fontFamily: FONT_MONO,
  };
  if (cell.kind === "yes") {
    return (
      <div
        style={{
          ...center,
          color: highlight ? "var(--accent-strong)" : "var(--text)",
          fontWeight: 700,
        }}
      >
        ✓
      </div>
    );
  }
  if (cell.kind === "no") {
    return <div style={{ ...center, color: "var(--text-muted)" }}>—</div>;
  }
  if (cell.kind === "partial") {
    return <div style={{ ...center, color: "var(--text-muted)" }}>partial</div>;
  }
  return (
    <div
      style={{
        ...center,
        color: highlight ? "var(--accent-strong)" : "var(--text-body)",
        fontWeight: highlight ? 700 : 500,
        fontSize: 12,
      }}
    >
      {cell.text}
    </div>
  );
}
