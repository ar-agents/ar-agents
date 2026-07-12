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
 *    section is a read with no network dependency and no `available: false`
 *    state of its own (an empty log is a valid, available state). ROADMAP.md
 *    M3-6: when the local log reads empty (this isolate has no KV of its
 *    own, or just recycled), fall back to ar-agents.ar's per-society durable
 *    sink (`./audit-sink`) that every tool call already dual-writes to, so
 *    the cockpit's "Acciones recientes" survives serverless recycling even
 *    without KV_REST_API_URL/TOKEN configured on this project.
 *  - Treasury (ROADMAP.md M2-4d): the society's CDP wallet address + its
 *    current on-chain USDC balance, a direct read against the provider (not
 *    ar-agents.ar), so an owner who just sent a manual USDC top-up can
 *    confirm it landed without needing the agent to run a tool call first.
 *    `usd` is the same human-decimal number a caller would put in
 *    `@ar-agents/treasury`'s `TreasuryState.usd` for this society -- this is
 *    the acceptance's "balance visible in TreasuryState": the read the agent
 *    (or a founder looking at the cockpit) uses to populate that field, not
 *    a separate persisted TreasuryState object of its own (this app has none
 *    -- the treasury package's state is caller-tracked, not stored).
 */

import { getUsdcBalanceAtomic } from "@ar-agents/wallet-cdp";
import { localAuditDroppedWrites, readLocalAudit } from "./audit-log";
import { readSinkTail, sinkAuditDroppedWrites } from "./audit-sink";
import { getCdpWallet } from "./clients";

const TIMEOUT_MS = 6_000;

/** Race a promise against `TIMEOUT_MS`, no retries -- same posture as this
 *  module's `getJson` fetch calls (`AbortSignal.timeout`), just for a call
 *  that isn't `fetch` (the CDP SDK call `getUsdcBalanceAtomic` makes has no
 *  abort-signal parameter of its own). A hung CDP read must never stall the
 *  rest of this diagnostic endpoint. */
function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
    ),
  ]);
}

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
  /** Writes lost to a LOCAL storage failure since this isolate booted (see
   *  `localAuditDroppedWrites`). Cheap, best-effort, resets on cold start;
   *  surfaced so silent data loss is visible instead of hidden. */
  droppedWrites: number;
  /** Writes lost forwarding to ar-agents.ar's durable per-society sink
   *  (ROADMAP.md M3-6, see `./audit-sink`), tracked separately from
   *  `droppedWrites` so which leg is failing is visible, not conflated. */
  sinkDroppedWrites: number;
}

const MAX_AUDIT_ENTRIES = 20;

/** Structural subset both `LocalAuditEntry` and the sink's `SinkAuditEntry`
 *  satisfy -- lets the fallback below pick either source without a cast. */
interface MinimalAuditEntry {
  id: string;
  ts: string;
  tool: string;
  governance: string;
  errored: boolean;
  summary?: string;
}

export async function fetchAuditStatus(): Promise<AuditStatus> {
  const [localEntries, droppedWrites, sinkDroppedWrites] = await Promise.all([
    readLocalAudit(MAX_AUDIT_ENTRIES),
    Promise.resolve(localAuditDroppedWrites()),
    Promise.resolve(sinkAuditDroppedWrites()),
  ]);
  // Fast path: the local log already has entries -> no network dependency.
  // Only fall back to the platform sink's tail when local reads empty.
  const entries: MinimalAuditEntry[] =
    localEntries.length > 0 ? localEntries : await readSinkTail(MAX_AUDIT_ENTRIES);
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
    sinkDroppedWrites,
  };
}

export interface TreasuryStatus {
  available: boolean;
  /** The society's CDP wallet address on Base -- public information (an
   *  on-chain address, not a secret), this is where an owner sends a manual
   *  USDC top-up. Null when no wallet is configured for this society. */
  address: string | null;
  /** CDP network identifier, e.g. "base-sepolia" or "base". */
  network: string;
  asset: "USDC";
  /** Atomic USDC base units (6 decimals), the exact on-chain integer. Null
   *  when unavailable (no wallet, or the provider read failed/timed out). */
  balanceAtomic: string | null;
  /** Human-decimal USDC balance -- the number a caller puts in
   *  `@ar-agents/treasury`'s `TreasuryState.usd` for this society. Null
   *  under the same conditions as `balanceAtomic`. */
  usd: number | null;
}

/**
 * The society's wallet address + current USDC balance (ROADMAP.md M2-4d).
 * Degrades to `available: false` (never throws) when no wallet is
 * configured OR the provider read fails/times out -- same posture as every
 * other section in this module. Unlike the sections above, this hits the
 * CDP provider directly (not ar-agents.ar), via the SAME `getCdpWallet()`
 * the agent loop provisions from (`./clients`), so this reads the real
 * society wallet, not a second/different one.
 */
export async function fetchTreasuryStatus(): Promise<TreasuryStatus> {
  const network = process.env.CDP_NETWORK?.trim() || "base-sepolia";
  const unavailable = (address: string | null): TreasuryStatus => ({
    available: false,
    address,
    network,
    asset: "USDC",
    balanceAtomic: null,
    usd: null,
  });

  // Wrapped in one try/catch (not just around the balance read below): even
  // `getCdpWallet()` itself, though it is documented to never throw, must
  // never be able to take this whole diagnostic endpoint down if that
  // contract is ever violated -- same "one flaky upstream never fails the
  // response" posture as every other section in this module.
  try {
    const account = await getCdpWallet();
    if (!account) return unavailable(null);

    try {
      const balanceAtomic = await withTimeout(
        getUsdcBalanceAtomic(account, { network }),
        "getUsdcBalanceAtomic",
      );
      return {
        available: true,
        address: account.address,
        network,
        asset: "USDC",
        balanceAtomic,
        usd: Number(balanceAtomic) / 1_000_000,
      };
    } catch {
      return unavailable(account.address);
    }
  } catch {
    return unavailable(null);
  }
}
