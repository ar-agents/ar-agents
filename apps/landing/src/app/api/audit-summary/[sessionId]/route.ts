/**
 * GET /api/audit-summary/{sessionId}
 *
 * Lightweight live computation of the recipe-25 aggregates over a single
 * session: governance breakdown, tool usage, duration quantiles, anomaly
 * flags, verification counts. Returns deterministic JSON suitable for
 * dashboards + monitoring + the /audit-explorer page.
 *
 * Node runtime (uses the audit lib + KV).
 */

import { NextResponse } from "next/server";
import { isSessionIdValid, readAudit, verifySession, type AuditEntry } from "@/lib/audit";

export const runtime = "nodejs";

const CLOCK_SKEW_THRESHOLD_MS = 5 * 60 * 1000;

interface Quantiles { p50: number; p95: number; p99: number }

interface Anomaly {
  kind:
    | "clock-skew"
    | "governance-shift"
    | "llm-error-without-fallback"
    | "missing-hmac-in-production";
  detail: string;
  entryId?: string;
}

interface Summary {
  $schema: string;
  generatedAt: string;
  sessionId: string;
  total: number;
  errored: number;
  verification: {
    verified: number;
    tampered: number;
    hmacWired: boolean;
  };
  span: {
    firstTs: string | null;
    lastTs: string | null;
    durationMs: number | null;
  };
  governanceBreakdown: Record<AuditEntry["governance"], number>;
  toolUsage: Record<string, number>;
  durationMsByTool: Record<string, Quantiles>;
  durationMsOverall: Quantiles | null;
  anomalies: Anomaly[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function quantiles(values: number[]): Quantiles {
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

function findAnomalies(entries: AuditEntry[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  let prev: AuditEntry | null = null;
  for (const e of entries) {
    if (prev) {
      const prevMs = Date.parse(prev.ts);
      const curMs = Date.parse(e.ts);
      if (Number.isFinite(prevMs) && Number.isFinite(curMs)) {
        const skew = prevMs - curMs;
        if (skew > CLOCK_SKEW_THRESHOLD_MS) {
          anomalies.push({
            kind: "clock-skew",
            detail: `${(skew / 1000).toFixed(1)}s backwards between ${prev.id} → ${e.id}`,
            entryId: e.id,
          });
        }
      }
      if (prev.governance !== e.governance) {
        anomalies.push({
          kind: "governance-shift",
          detail: `${prev.governance} → ${e.governance}`,
          entryId: e.id,
        });
      }
    }
    if (e.errored && e.governance === "audit-logged") {
      anomalies.push({
        kind: "llm-error-without-fallback",
        detail: `Errored ${e.tool}`,
        entryId: e.id,
      });
    }
    if (!e.hmac) {
      anomalies.push({
        kind: "missing-hmac-in-production",
        detail: "Entry has null hmac field",
        entryId: e.id,
      });
    }
    prev = e;
  }
  return anomalies;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await ctx.params;

  if (!isSessionIdValid(sessionId)) {
    return NextResponse.json(
      {
        error: "Invalid sessionId. Pattern: ^[A-Za-z0-9_-]{8,64}$",
      },
      { status: 400 },
    );
  }

  const [entries, verification] = await Promise.all([
    readAudit(sessionId),
    verifySession(sessionId),
  ]);

  const governance = blankGovernance();
  const toolUsage: Record<string, number> = {};
  const durationsAll: number[] = [];
  const durationsByTool: Record<string, number[]> = {};
  let errored = 0;

  for (const e of entries) {
    governance[e.governance]++;
    toolUsage[e.tool] = (toolUsage[e.tool] ?? 0) + 1;
    if (e.errored) errored++;
    if (typeof e.durationMs === "number") {
      durationsAll.push(e.durationMs);
      (durationsByTool[e.tool] ??= []).push(e.durationMs);
    }
  }

  const durationMsByTool: Record<string, Quantiles> = {};
  for (const [tool, ds] of Object.entries(durationsByTool)) {
    durationMsByTool[tool] = quantiles(ds);
  }

  const firstTs = entries[0]?.ts ?? null;
  const lastTs = entries[entries.length - 1]?.ts ?? null;
  let spanDurationMs: number | null = null;
  if (firstTs && lastTs) {
    const a = Date.parse(firstTs);
    const b = Date.parse(lastTs);
    if (Number.isFinite(a) && Number.isFinite(b)) spanDurationMs = b - a;
  }

  const summary: Summary = {
    $schema: "https://ar-agents.ar/schemas/audit-summary.v1.json",
    generatedAt: new Date().toISOString(),
    sessionId,
    total: entries.length,
    errored,
    verification: {
      verified: verification.verified,
      tampered: verification.tampered,
      hmacWired: verification.hmacWired,
    },
    span: {
      firstTs,
      lastTs,
      durationMs: spanDurationMs,
    },
    governanceBreakdown: governance,
    toolUsage,
    durationMsByTool,
    durationMsOverall: durationsAll.length ? quantiles(durationsAll) : null,
    anomalies: findAnomalies(entries),
  };

  return NextResponse.json(summary, {
    headers: {
      "cache-control": "public, max-age=10, stale-while-revalidate=60",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
