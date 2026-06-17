/**
 * Recipe 25 — Sociedad-IA quarterly compliance report.
 *
 * # Pattern
 *
 * Every quarter, a sociedad-IA must produce — for AFIP/ARCA, for AAIP
 * (data protection), and for whoever else asks — a self-audit summary
 * covering the last 90 days of operational activity. Recipe 25 is the
 * pure function that generates that report from the audit-log alone.
 *
 * Input: a list of sessionIds active in the quarter (e.g. one per
 * customer interaction, or one per business day, depending on session
 * granularity policy).
 *
 * Output: a single JSON document with:
 *
 *   - Header (sociedad metadata, period, generation time, schema URL)
 *   - Per-session: full entry timeline + verification result
 *   - Aggregates: total entries, total verified, total tampered, total
 *     errored, governance breakdown (algorithm-only / audit-logged /
 *     mocked-upstream / requires-confirmation counts), p50/p95/p99
 *     duration per tool
 *   - Anomalies: late timestamps (clock skew > 5 min), governance
 *     class shifts mid-session (unusual), errored entries with
 *     governance "audit-logged" (LLM call failed; needed remediation)
 *   - Self-disclosure: any session with tampered entries is flagged
 *     and the report's HMAC over its own JSON makes the disclosure
 *     itself tamper-evident
 *
 * The report is shaped to be the answer to a single regulator question:
 * "I want a complete picture of what your sociedad-IA did last quarter,
 * verifiable end-to-end, with no expectation of me trusting your
 * recollection." Hand them this JSON + the underlying live verify URLs;
 * everything they need to forensically reconstruct is in the document.
 *
 * # Companion to RFC-004 § 9
 *
 * RFC-004 § 9 lists the four artifacts a regulator can demand without a
 * court order: session inventory, full export, verification proof,
 * operational narrative. Recipe 25 is the operational narrative — and
 * it bundles in the session inventory + the verification proof, so the
 * regulator gets one self-contained document instead of N HTTP fetches.
 *
 * # When to use
 *
 * - Quarterly self-audit cycle (calendar quarters Q1/Q2/Q3/Q4).
 * - Regulator requests an ad-hoc window (parameterize start/end).
 * - Customer requests a "what did your sociedad do for me?" extract
 *   (filter sessionIds to that customer's; reuse the same function).
 * - Internal SOC/ops review (anomalies block on this report).
 *
 * # Edge Runtime
 *
 * Pure data shaping over the fetched audit; runs anywhere Node 18+ or
 * Edge fetch is available. No filesystem access. Stateless.
 */

import { fetchAudit } from "@ar-agents/incorporate";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Shape of a single audit entry per RFC-004 § 2. */
interface AuditEntry {
  id: string;
  sessionId: string;
  ts: string;
  tool: string;
  governance:
    | "algorithm-only"
    | "audit-logged"
    | "mocked-upstream"
    | "requires-confirmation";
  input: unknown;
  output?: unknown;
  errored?: boolean;
  durationMs?: number;
  hmac: string | null;
}

interface AuditPayload {
  sessionId: string;
  entries: AuditEntry[];
  total?: number;
  verified?: number;
  tampered?: number;
  hmacWired?: boolean;
}

/** Sociedad-IA self-disclosure metadata. */
interface SociedadMetadata {
  denominacion: string;
  operatorCuit: string;
  jurisdiction: "AR";
  rfcConformance: string[];      // e.g. ["rfc-001-v1", "rfc-004-draft"]
  auditBaseUrl: string;          // for re-fetch by the regulator
}

interface ReportInput {
  sociedad: SociedadMetadata;
  periodStart: string;           // ISO-8601 UTC
  periodEnd: string;             // ISO-8601 UTC
  sessionIds: string[];          // sessions active in the period
  baseUrl?: string;              // /arg deployment, default ar-agents.ar
}

interface SessionSummary {
  sessionId: string;
  entriesCount: number;
  verified: number;
  tampered: number;
  errored: number;
  durationMs: { p50: number; p95: number; p99: number } | null;
  governanceBreakdown: Record<AuditEntry["governance"], number>;
  firstTs: string | null;
  lastTs: string | null;
  toolUsage: Record<string, number>;
  anomalies: Anomaly[];
}

type Anomaly =
  | {
      kind: "clock-skew";
      entryId: string;
      previousTs: string;
      currentTs: string;
      skewMs: number;
    }
  | {
      kind: "governance-shift";
      entryIdA: string;
      governanceA: AuditEntry["governance"];
      entryIdB: string;
      governanceB: AuditEntry["governance"];
    }
  | {
      kind: "llm-error-without-fallback";
      entryId: string;
      tool: string;
    }
  | {
      kind: "tampered-entry";
      entryId: string;
    }
  | {
      kind: "missing-hmac-in-production";
      entryId: string;
    };

interface QuarterlyReport {
  $schema: string;
  generatedAt: string;
  schemaVersion: "1.0";
  sociedad: SociedadMetadata;
  period: { start: string; end: string };
  aggregates: {
    sessionsCount: number;
    entriesCount: number;
    verified: number;
    tampered: number;
    errored: number;
    governanceBreakdown: Record<AuditEntry["governance"], number>;
    toolUsage: Record<string, number>;
    durationMsByTool: Record<string, { p50: number; p95: number; p99: number }>;
  };
  sessions: SessionSummary[];
  anomalies: Anomaly[];
  conclusion: ReportConclusion;
  reportHmac: string | null;     // optional: HMAC over canonical(report-minus-this-field)
}

interface ReportConclusion {
  /** "clean" | "anomalies-noted" | "tampering-detected" */
  status: "clean" | "anomalies-noted" | "tampering-detected";
  /** Human-readable summary. Short. Regulator opens this first. */
  summary: string;
  /** Concrete remediation items if status != "clean". */
  remediation: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistics helpers
// ─────────────────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function quantiles(values: number[]): { p50: number; p95: number; p99: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

function blankGovernance(): Record<AuditEntry["governance"], number> {
  return {
    "algorithm-only": 0,
    "audit-logged": 0,
    "mocked-upstream": 0,
    "requires-confirmation": 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-session summarization
// ─────────────────────────────────────────────────────────────────────────────

const CLOCK_SKEW_THRESHOLD_MS = 5 * 60 * 1000; // 5 min

function summarizeSession(payload: AuditPayload): SessionSummary {
  const entries = payload.entries;
  const governance = blankGovernance();
  const toolUsage: Record<string, number> = {};
  const durations: number[] = [];
  const anomalies: Anomaly[] = [];
  let errored = 0;

  let prev: AuditEntry | null = null;
  for (const e of entries) {
    governance[e.governance]++;
    toolUsage[e.tool] = (toolUsage[e.tool] ?? 0) + 1;
    if (e.durationMs !== undefined) durations.push(e.durationMs);
    if (e.errored) errored++;

    // Anomaly: clock skew
    if (prev) {
      const prevMs = Date.parse(prev.ts);
      const curMs = Date.parse(e.ts);
      if (Number.isFinite(prevMs) && Number.isFinite(curMs)) {
        const skew = prevMs - curMs;
        if (skew > CLOCK_SKEW_THRESHOLD_MS) {
          anomalies.push({
            kind: "clock-skew",
            entryId: e.id,
            previousTs: prev.ts,
            currentTs: e.ts,
            skewMs: skew,
          });
        }
      }
      // Anomaly: governance shift within session (allowed but worth flagging)
      if (prev.governance !== e.governance) {
        anomalies.push({
          kind: "governance-shift",
          entryIdA: prev.id,
          governanceA: prev.governance,
          entryIdB: e.id,
          governanceB: e.governance,
        });
      }
    }

    // Anomaly: errored LLM call (audit-logged + errored = LLM failed,
    // operator should have a fallback documented).
    if (e.errored && e.governance === "audit-logged") {
      anomalies.push({ kind: "llm-error-without-fallback", entryId: e.id, tool: e.tool });
    }

    // Anomaly: missing HMAC in production. (null hmac in dev OK; in prod
    // it's a fatal misconfig per RFC-004 § 2.)
    if (!e.hmac) {
      anomalies.push({ kind: "missing-hmac-in-production", entryId: e.id });
    }

    prev = e;
  }

  // Tampering: derived from the verify endpoint output, not from anomalies.
  // Each tampered entry is also enumerated as an anomaly so the regulator
  // sees it in one list.
  const tampered = payload.tampered ?? 0;
  if (tampered > 0) {
    // We don't know which entry IDs without re-verifying client-side. Flag
    // the session collectively; downstream caller can drill in.
    anomalies.push({
      kind: "tampered-entry",
      entryId: `(${tampered} entries in session ${payload.sessionId})`,
    });
  }

  return {
    sessionId: payload.sessionId,
    entriesCount: entries.length,
    verified: payload.verified ?? 0,
    tampered,
    errored,
    durationMs: durations.length ? quantiles(durations) : null,
    governanceBreakdown: governance,
    firstTs: entries[0]?.ts ?? null,
    lastTs: entries[entries.length - 1]?.ts ?? null,
    toolUsage,
    anomalies,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-session aggregation
// ─────────────────────────────────────────────────────────────────────────────

function aggregate(
  sessions: SessionSummary[],
  payloads: AuditPayload[],
): QuarterlyReport["aggregates"] {
  const governance = blankGovernance();
  const toolUsage: Record<string, number> = {};
  const durationsByTool: Record<string, number[]> = {};
  let entries = 0;
  let verified = 0;
  let tampered = 0;
  let errored = 0;

  for (const s of sessions) {
    entries += s.entriesCount;
    verified += s.verified;
    tampered += s.tampered;
    errored += s.errored;
    for (const g of Object.keys(governance) as AuditEntry["governance"][]) {
      governance[g] += s.governanceBreakdown[g];
    }
    for (const [tool, n] of Object.entries(s.toolUsage)) {
      toolUsage[tool] = (toolUsage[tool] ?? 0) + n;
    }
  }

  // Per-tool latency aggregation needs the raw entries.
  for (const p of payloads) {
    for (const e of p.entries) {
      if (e.durationMs === undefined) continue;
      const bucket = (durationsByTool[e.tool] ??= []);
      bucket.push(e.durationMs);
    }
  }

  const durationMsByTool: Record<string, { p50: number; p95: number; p99: number }> = {};
  for (const [tool, ds] of Object.entries(durationsByTool)) {
    durationMsByTool[tool] = quantiles(ds);
  }

  return {
    sessionsCount: sessions.length,
    entriesCount: entries,
    verified,
    tampered,
    errored,
    governanceBreakdown: governance,
    toolUsage,
    durationMsByTool,
  };
}

function conclude(
  aggregates: QuarterlyReport["aggregates"],
  anomalies: Anomaly[],
): ReportConclusion {
  if (aggregates.tampered > 0) {
    return {
      status: "tampering-detected",
      summary: `${aggregates.tampered} of ${aggregates.entriesCount} entries failed HMAC verification. This is a chain-of-custody breach; the sociedad-IA cannot represent its operating history as complete for the reported period without remediation.`,
      remediation: [
        "Identify which entries failed verification (drill in per session via /api/play/audit/{sessionId}?verify=1).",
        "If verification failure is due to key rotation without re-signing, document the rotation event and re-sign the affected entries under the new key with an explicit re-signing audit entry.",
        "If verification failure is due to actual tampering, treat as a security incident: identify the access path, rotate keys, notify counterparties per RFC-001 § 9.4.",
        "File a written explanation with the requesting regulator.",
      ],
    };
  }
  if (anomalies.length > 0) {
    const llmErrors = anomalies.filter(a => a.kind === "llm-error-without-fallback").length;
    const skews = anomalies.filter(a => a.kind === "clock-skew").length;
    const missingHmac = anomalies.filter(a => a.kind === "missing-hmac-in-production").length;
    return {
      status: "anomalies-noted",
      summary: `No tampering detected (${aggregates.verified}/${aggregates.entriesCount} entries verified). ${anomalies.length} operational anomalies flagged for review (${llmErrors} LLM-call failures, ${skews} clock-skew events, ${missingHmac} missing-HMAC entries).`,
      remediation: [
        ...(llmErrors > 0
          ? ["Review LLM-call failure paths; document fallback behavior for the errored tools."]
          : []),
        ...(skews > 0
          ? ["Investigate clock-skew events (>5 min between consecutive entries within a session); typical cause is NTP drift or fork-then-merge."]
          : []),
        ...(missingHmac > 0
          ? ["CRITICAL: missing-HMAC entries must not occur in production. Verify AUDIT_HMAC_SECRET is set in the production env and rotate."]
          : []),
      ],
    };
  }
  return {
    status: "clean",
    summary: `${aggregates.verified}/${aggregates.entriesCount} entries verified across ${aggregates.sessionsCount} sessions. No anomalies. No tampering. ${aggregates.errored} errored tool-calls (within expected operational range; no remediation required).`,
    remediation: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Optional: HMAC-sign the report itself (self-disclosure tamper-evidence)
// ─────────────────────────────────────────────────────────────────────────────

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

async function signReport(
  report: Omit<QuarterlyReport, "reportHmac">,
  secret: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(canonical(report)));
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function generateQuarterlyComplianceReport(
  input: ReportInput,
  options: {
    /** If set, the report is signed with this secret for tamper-evidence. */
    reportSigningSecret?: string;
    /** Override fetch impl (for testing). */
    fetchImpl?: typeof fetch;
  } = {},
): Promise<QuarterlyReport> {
  const baseUrl = input.baseUrl ?? "https://ar-agents.ar";

  // 1. Pull every session's audit log + verification result, in parallel.
  const payloads: AuditPayload[] = await Promise.all(
    input.sessionIds.map(async (sessionId) => {
      const data = (await fetchAudit(sessionId, {
        baseUrl,
        verify: true,
        fetchImpl: options.fetchImpl,
      })) as AuditPayload;
      // Defensive: API may not return verify counts in dev (hmacWired=false).
      return {
        sessionId,
        entries: Array.isArray(data.entries) ? data.entries : [],
        total: data.total,
        verified: data.verified,
        tampered: data.tampered,
        hmacWired: data.hmacWired,
      };
    }),
  );

  // 2. Summarize each session.
  const sessions = payloads.map(summarizeSession);

  // 3. Aggregate across sessions.
  const aggregates = aggregate(sessions, payloads);

  // 4. Roll up anomalies.
  const allAnomalies = sessions.flatMap(s => s.anomalies);

  // 5. Conclude.
  const conclusion = conclude(aggregates, allAnomalies);

  // 6. Assemble.
  const base: Omit<QuarterlyReport, "reportHmac"> = {
    $schema: "https://ar-agents.ar/schemas/quarterly-compliance.v1.json",
    generatedAt: new Date().toISOString(),
    schemaVersion: "1.0",
    sociedad: input.sociedad,
    period: { start: input.periodStart, end: input.periodEnd },
    aggregates,
    sessions,
    anomalies: allAnomalies,
    conclusion,
  };

  const reportHmac = options.reportSigningSecret
    ? await signReport(base, options.reportSigningSecret)
    : null;

  return { ...base, reportHmac };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry — node 25-sociedad-ia-quarterly-compliance.ts <config.json>
//
// The config file is a JSON document with the ReportInput shape.
// Example:
// {
//   "sociedad": {
//     "denominacion": "Sociedad-IA Demo SAS",
//     "operatorCuit": "20-12345678-6",
//     "jurisdiction": "AR",
//     "rfcConformance": ["rfc-001-v1", "rfc-004-draft"],
//     "auditBaseUrl": "https://ar-agents.ar"
//   },
//   "periodStart": "2026-04-01T00:00:00.000Z",
//   "periodEnd":   "2026-06-30T23:59:59.999Z",
//   "sessionIds":  ["session-abc", "session-def", "session-ghi"],
//   "baseUrl":     "https://ar-agents.ar"
// }
// ─────────────────────────────────────────────────────────────────────────────

declare const process: { argv: string[] } | undefined;

async function main() {
  if (typeof process === "undefined") return;
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("usage: tsx 25-sociedad-ia-quarterly-compliance.ts <config.json>");
    return;
  }
  const fs = await import("node:fs/promises");
  const cfg = JSON.parse(await fs.readFile(configPath, "utf8")) as ReportInput;
  const secret = (globalThis as { process?: { env?: Record<string, string> } }).process?.env
    ?.AUDIT_HMAC_SECRET;
  const report = await generateQuarterlyComplianceReport(cfg, {
    reportSigningSecret: secret,
  });
  console.log(JSON.stringify(report, null, 2));
}

const isMain = typeof require !== "undefined" && require.main === module;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    if (typeof process !== "undefined" && "exit" in process) {
      (process as unknown as { exit: (code: number) => void }).exit(1);
    }
  });
}
