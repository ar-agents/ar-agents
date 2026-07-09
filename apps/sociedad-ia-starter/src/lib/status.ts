/**
 * Data sources for `GET /api/status` (ROADMAP.md M3-2): what studio's
 * cockpit reads to show "la sociedad en vivo" without the founder ever
 * visiting this deploy's own URL.
 *
 * Every look-up here is independent, public (no admin/gate token needed:
 * this deploy only holds `SOCIETY_GATE_TOKEN`, not the administrator's
 * capability), and degrades to `available: false` on any failure or missing
 * `SOCIETY_ID`, mirroring the aggregation pattern in
 * apps/studio/src/lib/society.ts's `buildSocietySummary`. One flaky (or
 * unconfigured) upstream must never take down the whole response.
 *
 *  - Kill switch: `GET /api/suspension-status` (same endpoint the agent
 *    loop's `governance.ts` consults for real enforcement; this is a
 *    separate, display-only read so a transient failure here shows "sin
 *    datos" instead of the agent's fail-closed "treat as suspended").
 *  - Pending approvals: `GET /api/approvals/pending`, PUBLIC (redacted)
 *    view: this deploy never receives the administrator's admin token, so
 *    it cannot fetch the full view (that stays a studio-only capability via
 *    `POST /api/society/approvals`).
 *  - Recent actions: THIS deploy's own local signed audit log (`./audit-log`,
 *    ROADMAP.md M3-4 / M3-5), not ar-agents.ar's administrative one. That
 *    remote log (`GET /api/play/audit/{sessionId}`) only ever receives
 *    entries from the incorporate/suspend/approve routes studio calls on
 *    the human's behalf -- it never saw what this society's agent actually
 *    DID at runtime. The local log does: every `POST /api/agent` tool call
 *    is wrapped centrally (`./audit-middleware`) and appended here, so this
 *    section is now a read with no network dependency and no `available:
 *    false` state of its own (an empty log is a valid, available state).
 */

import { localAuditDroppedWrites, readLocalAudit } from "./audit-log";

const TIMEOUT_MS = 6_000;

// Read fresh on every call (not module-load-time constants): this module is
// imported once per process, but SOCIETY_ID/AR_AGENTS_API_BASE can differ per
// test run, and in production reading it lazily costs nothing.
function base(): string {
  return process.env.AR_AGENTS_API_BASE?.trim() || "https://ar-agents.ar";
}
function societyId(): string {
  return process.env.SOCIETY_ID?.trim() || "";
}

async function getJson<T>(path: string): Promise<T | null> {
  if (!societyId()) return null;
  try {
    const res = await fetch(`${base()}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface KillSwitchStatus {
  available: boolean;
  suspended: boolean | null;
}

export async function fetchKillSwitchStatus(): Promise<KillSwitchStatus> {
  const data = await getJson<{ ok?: boolean; suspended?: boolean }>(
    `/api/suspension-status?society=${encodeURIComponent(societyId())}`,
  );
  if (!data || typeof data.suspended !== "boolean") return { available: false, suspended: null };
  return { available: true, suspended: data.suspended };
}

export interface ApprovalSummaryItem {
  id: string;
  tool: string;
  status: string;
  createdAt: string;
}

export interface ApprovalsStatus {
  available: boolean;
  pendingCount: number | null;
  items: ApprovalSummaryItem[] | null;
}

const MAX_APPROVAL_ITEMS = 10;

export async function fetchApprovalsStatus(): Promise<ApprovalsStatus> {
  const data = await getJson<{
    ok?: boolean;
    pending?: Array<{ id: string; tool: string; status: string; createdAt: string }>;
  }>(`/api/approvals/pending?society=${encodeURIComponent(societyId())}`);
  if (!data || !Array.isArray(data.pending)) return { available: false, pendingCount: null, items: null };
  const items = data.pending.slice(0, MAX_APPROVAL_ITEMS).map((p) => ({
    id: p.id,
    tool: p.tool,
    status: p.status,
    createdAt: p.createdAt,
  }));
  return { available: true, pendingCount: data.pending.length, items };
}

export interface AuditActionSummary {
  id: string;
  ts: string;
  tool: string;
  governance: string;
  errored: boolean;
  /** Short, redacted, public-safe description (see ./audit-log). Optional
   *  only for forward/backward JSON-shape tolerance; every entry the local
   *  log produces sets it. */
  summary?: string;
}

export interface AuditStatus {
  available: boolean;
  entries: AuditActionSummary[] | null;
  /** Writes lost to a storage failure since this isolate booted (see
   *  `localAuditDroppedWrites`). Cheap, best-effort, resets on cold start;
   *  surfaced so silent data loss is visible instead of hidden. */
  droppedWrites: number;
}

const MAX_AUDIT_ENTRIES = 20;

export async function fetchAuditStatus(): Promise<AuditStatus> {
  const [entries, droppedWrites] = await Promise.all([
    readLocalAudit(MAX_AUDIT_ENTRIES),
    Promise.resolve(localAuditDroppedWrites()),
  ]);
  return {
    available: true,
    entries: entries.map((e) => ({
      id: e.id,
      ts: e.ts,
      tool: e.tool,
      governance: e.governance,
      errored: e.errored,
      summary: e.summary,
    })),
    droppedWrites,
  };
}
