/**
 * Recipe 19 — Forensic-grade compliance dashboard powered by the
 * `/api/play/audit/{sessionId}` endpoint.
 *
 * Every operator running an Argentine sociedad-IA accumulates an
 * append-only HMAC-signed audit log under a sessionId. RFC-001 § 9.2
 * makes that log legally probative — but "legally probative" only
 * matters if a regulator can actually inspect it. This recipe is the
 * compliance-side companion: a Node.js process that ingests audit
 * entries on a schedule, checks for tampering, and routes alerts to
 * the operator's SOC + the contador's monthly summary.
 *
 * # Pattern
 *
 * 1. Pull the latest audit entries via `fetchAudit(sessionId, { verify: true })`
 *    from `@ar-agents/incorporate` — same primitives the incorporation flow uses.
 * 2. Reconcile the verified count + tampered count + entry count against
 *    expected ranges. Tampering immediately escalates.
 * 3. Bucket entries by tool, governance class, and durationMs to surface
 *    operational anomalies (e.g., a `crear_factura` tool started running
 *    in 12s instead of <1s — that's an AFIP slowdown worth noting).
 * 4. Stream a daily digest to the contador (Slack, email, WhatsApp)
 *    summarizing volume + categories + any anomalies.
 *
 * # When to use
 *
 * - Multi-tenant marketplace operating many sociedades-IA, one audit log
 *   per tenant. Daily compliance roll-up scales linearly.
 * - Regulated SaaS where the audit log is contractually required to be
 *   monitored, not just retained.
 * - Periodic third-party audit cycles where the auditor wants a
 *   reproducible forensic report (the JSON returned by `?verify=1` is
 *   already that report).
 *
 * # Edge Runtime
 *
 * Yes. The client is fetch-based, zero deps. Schedule via Vercel Cron
 * (`vercel.json → crons`) or Cloudflare Workers Cron Triggers — either
 * works.
 *
 * # Production-only assertions
 *
 * The audit log is HMAC-signed with `AUDIT_HMAC_SECRET` server-side.
 * The verifier here delegates to `?verify=1` (so the secret never
 * leaves the server) but the consumer can independently re-verify by
 * re-implementing the canonical-JSON + HMAC check. The agent endpoint
 * uses constant-time comparison; the read endpoint exposes per-entry
 * hmac so external libraries can recompute.
 */

import { fetchAudit } from "@ar-agents/incorporate";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  sessionId: string;
  ts: string; // ISO 8601
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

interface AuditEnvelope {
  sessionId: string;
  backend: "vercel-kv" | "in-memory";
  count: number;
  entries: AuditEntry[];
  verification?: {
    total: number;
    verified: number;
    tampered: number;
    hmacWired: boolean;
  };
}

interface DailyDigest {
  sessionId: string;
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  totals: { all: number; errored: number; byGovernance: Record<string, number> };
  byTool: Record<string, { count: number; avgDurationMs: number; errors: number }>;
  anomalies: string[];
  /** Highest-priority issue. If null, the day is clean. */
  alert: { severity: "tampered" | "performance" | "errors"; message: string } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: pull + verify + bucket
// ─────────────────────────────────────────────────────────────────────────────

const PERFORMANCE_THRESHOLDS_MS: Record<string, number> = {
  // Per-tool latency expectations. If an entry's durationMs exceeds 4× this,
  // the operator gets pinged. Numbers are heuristic — replace with your
  // observed p95 from /api/play/audit/* over the last 30 days.
  validate_cuit: 50,
  validate_cbu: 50,
  validate_solicitar_cae: 50,
  validate_igj_inscription: 100,
  lookup_cuit_afip: 1500,
  lookup_credit_situation: 1200,
  get_usd_oficial: 800,
  bo_today: 2000,
  igj_get_entity: 1200,
  list_domicilio_inbox: 1500,
  crear_factura: 3000,
  send_whatsapp_text: 800,
  mp_create_subscription: 1500,
  auto_incorporate: 200,
};

export async function buildDailyDigest(
  sessionId: string,
  options: { rangeStart?: Date; rangeEnd?: Date; baseUrl?: string } = {},
): Promise<DailyDigest> {
  const rangeEnd = options.rangeEnd ?? new Date();
  const rangeStart = options.rangeStart ?? new Date(rangeEnd.getTime() - 86_400_000);

  const raw = (await fetchAudit(sessionId, {
    verify: true,
    baseUrl: options.baseUrl,
  })) as AuditEnvelope;

  // Bucket entries to the requested range (24h default).
  const inRange = raw.entries.filter((e) => {
    const t = Date.parse(e.ts);
    return t >= rangeStart.getTime() && t < rangeEnd.getTime();
  });

  const totals = {
    all: inRange.length,
    errored: inRange.filter((e) => e.errored).length,
    byGovernance: groupCount(inRange, (e) => e.governance),
  };

  const byTool: Record<
    string,
    { count: number; avgDurationMs: number; errors: number }
  > = {};
  for (const e of inRange) {
    const slot = (byTool[e.tool] ??= { count: 0, avgDurationMs: 0, errors: 0 });
    slot.count++;
    if (e.errored) slot.errors++;
    if (typeof e.durationMs === "number") {
      // running mean
      slot.avgDurationMs =
        (slot.avgDurationMs * (slot.count - 1) + e.durationMs) / slot.count;
    }
  }

  const anomalies: string[] = [];

  // 1. Tampering — highest-severity escalation.
  const tampered = raw.verification?.tampered ?? 0;
  const hmacWired = raw.verification?.hmacWired ?? false;
  if (!hmacWired) {
    anomalies.push(
      "AUDIT_HMAC_SECRET no está cableado en el deploy — el log no está firmado.",
    );
  }
  if (tampered > 0) {
    anomalies.push(
      `${tampered} entrada${tampered === 1 ? "" : "s"} con tampering detectado en la sesión completa.`,
    );
  }

  // 2. Performance — flag tools whose avg latency is 4× threshold.
  for (const [tool, slot] of Object.entries(byTool)) {
    const threshold = PERFORMANCE_THRESHOLDS_MS[tool];
    if (threshold && slot.avgDurationMs > threshold * 4 && slot.count > 1) {
      anomalies.push(
        `${tool}: avg ${Math.round(slot.avgDurationMs)}ms (esperado <${threshold * 4}ms) en ${slot.count} llamadas.`,
      );
    }
  }

  // 3. Error rate — flag tools above 5% error rate over 10+ calls.
  for (const [tool, slot] of Object.entries(byTool)) {
    if (slot.count >= 10 && slot.errors / slot.count > 0.05) {
      anomalies.push(
        `${tool}: ${slot.errors}/${slot.count} (${Math.round((slot.errors / slot.count) * 100)}%) errores.`,
      );
    }
  }

  // Pick the highest-severity alert.
  let alert: DailyDigest["alert"] = null;
  if (tampered > 0) {
    alert = {
      severity: "tampered",
      message: `URGENTE: ${tampered} entrada(s) con tampering detectado en la sesión ${sessionId}. Investigar acceso al audit log.`,
    };
  } else if (totals.errored / Math.max(totals.all, 1) > 0.1 && totals.all > 10) {
    alert = {
      severity: "errors",
      message: `Tasa de error del día (${totals.errored}/${totals.all}) supera el 10%.`,
    };
  } else if (anomalies.some((a) => a.includes("avg"))) {
    alert = {
      severity: "performance",
      message: anomalies.find((a) => a.includes("avg")) ?? "Performance anomaly",
    };
  }

  return {
    sessionId,
    generatedAt: new Date().toISOString(),
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    totals,
    byTool,
    anomalies,
    alert,
  };
}

function groupCount<T>(arr: T[], key: (v: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of arr) {
    const k = key(v);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sink: contador's monthly summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a digest as a readable Spanish-language summary the contador
 * can paste into a monthly compliance report. Structurally similar to
 * a balance summary — totals + observations.
 */
export function renderForContador(digest: DailyDigest): string {
  const date = digest.rangeEnd.slice(0, 10);
  const lines: string[] = [
    `RESUMEN AUDITORÍA · ${date}`,
    `Sesión: ${digest.sessionId}`,
    "",
    "TOTALES",
    `  Tool calls: ${digest.totals.all}`,
    `  Errores: ${digest.totals.errored}`,
    "",
    "POR CLASE DE GOVERNANCE",
  ];
  for (const [k, v] of Object.entries(digest.totals.byGovernance)) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push("", "POR TOOL");
  const sorted = Object.entries(digest.byTool).sort(
    ([, a], [, b]) => b.count - a.count,
  );
  for (const [tool, slot] of sorted) {
    lines.push(
      `  ${tool}: ${slot.count} llamadas (avg ${Math.round(slot.avgDurationMs)}ms${slot.errors ? `, ${slot.errors} errores` : ""})`,
    );
  }
  if (digest.anomalies.length > 0) {
    lines.push("", "ANOMALÍAS");
    for (const a of digest.anomalies) lines.push(`  - ${a}`);
  }
  if (digest.alert) {
    lines.push(
      "",
      `ALERTA [${digest.alert.severity.toUpperCase()}]`,
      `  ${digest.alert.message}`,
    );
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron entrypoint (drop in /api/cron/compliance-digest in your Next.js app)
// ─────────────────────────────────────────────────────────────────────────────

async function main(sessionId: string) {
  const digest = await buildDailyDigest(sessionId);

  // 1. Always log the structured digest for the operator's metrics pipeline.
  console.log(JSON.stringify(digest));

  // 2. Render a contador-friendly summary for the monthly compliance report.
  console.log(renderForContador(digest));

  // 3. Escalate on tampering or high error rate. In production, replace
  //    these console.warn calls with WhatsApp template / email / PagerDuty.
  if (digest.alert) {
    console.warn(`ESCALATE [${digest.alert.severity}]: ${digest.alert.message}`);
    // await sendWhatsAppTemplate({ to: process.env.SOC_WHATSAPP, template: "audit_alert", ... });
    // await sendEmail({ to: process.env.CONTADOR_EMAIL, subject: "...", body: ... });
  }

  return digest;
}

if (typeof require !== "undefined" && require.main === module) {
  const sid = process.argv[2];
  if (!sid) {
    console.error("usage: pnpm tsx 19-forensic-compliance-dashboard.ts <sessionId>");
    process.exit(1);
  }
  main(sid).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { main };
