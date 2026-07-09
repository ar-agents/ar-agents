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
 *  - Recent actions: `GET /api/play/audit/{sessionId}`, the same signed
 *    audit log `POST /api/society/constitute` links founders to in its
 *    response (despite the `/play` path segment, this endpoint serves every
 *    session, not just demo ones; see apps/landing/src/lib/incorporate-run.ts).
 *    Already public with no auth, so no further redaction is needed beyond
 *    picking the descriptive fields (drop the raw `input`/`output` payloads
 *    to keep this response small and readable).
 */

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
}

export interface AuditStatus {
  available: boolean;
  entries: AuditActionSummary[] | null;
}

const MAX_AUDIT_ENTRIES = 20;

export async function fetchAuditStatus(): Promise<AuditStatus> {
  const data = await getJson<{
    entries?: Array<{ id: string; ts: string; tool: string; governance: string; errored?: boolean }>;
  }>(`/api/play/audit/${encodeURIComponent(societyId())}`);
  if (!data || !Array.isArray(data.entries)) return { available: false, entries: null };
  // The upstream list is oldest-first; take the newest slice, then reverse so
  // the cockpit renders most-recent-first without re-sorting client side.
  const entries = data.entries
    .slice(-MAX_AUDIT_ENTRIES)
    .reverse()
    .map((e) => ({ id: e.id, ts: e.ts, tool: e.tool, governance: e.governance, errored: Boolean(e.errored) }));
  return { available: true, entries };
}
