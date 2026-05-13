/**
 * `GET /api/play/audit/[sessionId]/csv`, RFC 4180 CSV export of the
 * session's audit log. For accountants who want to pivot in Excel /
 * Sheets / Numbers / a finance dashboard.
 *
 * Headers (one row per entry):
 *   ts, tool, governance, durationMs, errored, hmac, input, output
 *
 * `input` and `output` are JSON-stringified into a single cell so the
 * row stays flat. `ts` is ISO-8601 UTC. `errored` is "true" / "false"
 * (empty string when the field was absent on the original entry).
 *
 * UTF-8 BOM included so Excel renders accents correctly without manual
 * encoding setup.
 *
 * Cache: 60s (the audit log is append-only with HMAC, staleness is
 * accounted for; CSV exports usually feed daily reconciliation jobs
 * that don't need real-time freshness).
 *
 * Why expose CSV alongside JSON: pivot-tables in spreadsheets are the
 * native tool of the audience that audits compliance. A contador
 * shouldn't have to install jq + know what /api/play/audit/?verify=1
 * means. They double-click the file, it opens in Excel, columns parse,
 * pivot the tool column.
 */

import { isSessionIdValid, readAudit, type AuditEntry } from "@/lib/audit";

export const runtime = "nodejs";

const CSV_HEADERS = [
  "ts",
  "tool",
  "governance",
  "durationMs",
  "errored",
  "hmac",
  "input",
  "output",
] as const;

/**
 * Escape a cell per RFC 4180:
 *   - If the cell contains comma, double-quote, or newline, wrap in
 *     double quotes.
 *   - Inside a wrapped cell, double up double quotes.
 *
 * Applies to every cell unconditionally, wrapping never hurts; mixed
 * wrapping makes pivot tables fragile.
 */
function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '""';
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function entryToRow(entry: AuditEntry): string {
  return [
    csvCell(entry.ts),
    csvCell(entry.tool),
    csvCell(entry.governance),
    csvCell(entry.durationMs ?? ""),
    csvCell(entry.errored === undefined ? "" : entry.errored ? "true" : "false"),
    csvCell(entry.hmac ?? ""),
    csvCell(entry.input),
    csvCell(entry.output),
  ].join(",");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;
  if (!isSessionIdValid(sessionId)) {
    return new Response("invalid_session_id", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const entries = await readAudit(sessionId);
  // RFC 4180 line ending is CRLF; many spreadsheet tools accept LF too,
  // CRLF is universal.
  const lines = [
    CSV_HEADERS.map(csvCell).join(","),
    ...entries.map(entryToRow),
  ];
  // Excel detects UTF-8 from the BOM; without it, accented chars get
  // mangled on Windows.
  const body = "﻿" + lines.join("\r\n");
  // Filename pattern: ar-agents-audit-{8-char-prefix}-{YYYYMMDD}.csv
  // Useful when the user downloads multiple in a row.
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `ar-agents-audit-${sessionId.slice(0, 8)}-${today}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control":
        "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      "x-row-count": String(entries.length),
    },
  });
}
