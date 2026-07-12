/**
 * Dual-write client for ar-agents.ar's per-society durable audit sink
 * (ROADMAP.md M3-6): `POST /api/society-audit/append` and
 * `GET /api/society-audit/tail` on apps/landing.
 *
 * Why this exists: `./audit-log`'s local KV falls back to an in-memory
 * array whenever this deploy has no `KV_REST_API_URL`/`KV_REST_API_TOKEN`
 * of its own, which loses every entry between serverless recycles (found
 * live 2026-07-09 running the M3-4 proof). Handing every society the
 * platform's OWN KV credentials would fix durability but break isolation --
 * those credentials read the whole KV store, studio's account records
 * included. So instead this deploy forwards its own local entries to a
 * platform-hosted sink authenticated by THIS society's own gate token
 * (`SOCIETY_GATE_TOKEN`, already minted at constitution and already sent
 * to `/api/approvals/gate` by `./governance.ts`): a society can only
 * write/read the namespace its own token unlocks, so society A can never
 * read or poison society B's operating history even though both entries
 * live in the same shared KV instance on ar-agents.ar.
 *
 * Both directions are best-effort by construction: a sink failure must
 * never break the tool call being audited (append) nor make `/api/status`
 * fail (tail read). Each failure mode is counted separately from the local
 * counter in `./audit-log` so a dropped write is visible, not silent.
 */

import type { LocalAuditEntry } from "./audit-log";

const TIMEOUT_MS = 4_000;

function base(): string {
  return process.env.AR_AGENTS_API_BASE?.trim() || "https://ar-agents.ar";
}
function societyId(): string {
  return process.env.SOCIETY_ID?.trim() || "";
}
function gateToken(): string {
  return process.env.SOCIETY_GATE_TOKEN?.trim() || "";
}

/** Whether this deploy has enough identity to reach the platform sink at
 *  all. A bare local checkout / dev environment never does -- that is NOT
 *  a dropped write (there is nothing configured to drop), so callers must
 *  check this before counting a failure. */
function sinkConfigured(): boolean {
  return Boolean(societyId() && gateToken());
}

// globalThis-backed, same rationale as ./audit-log's `mem`: a route module
// can get its own module instance in dev, and per-module state would make
// the dropped counter disagree between /api/agent and /api/status.
const g = globalThis as typeof globalThis & {
  __starterAuditSinkMem?: { dropped: number };
};
g.__starterAuditSinkMem ??= { dropped: 0 };
const mem = g.__starterAuditSinkMem;

/**
 * Forward one already-signed local entry to the platform sink. NEVER
 * throws: a network error, timeout, or non-2xx response increments the
 * dropped counter and otherwise returns silently. The caller
 * (`./audit-middleware`'s `withLocalAudit`) already recorded the entry
 * locally; this is a best-effort second copy, not the source of truth for
 * the tool call's own outcome.
 */
export async function writeToSink(entry: LocalAuditEntry): Promise<void> {
  if (!sinkConfigured()) return;
  try {
    const res = await fetch(`${base()}/api/society-audit/append`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ society: societyId(), gateToken: gateToken(), entry }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) mem.dropped++;
  } catch {
    mem.dropped++;
  }
}

/** Shape the sink returns; a structural subset of `LocalAuditEntry` (public
 *  fields only -- the sink never returns anything this app didn't already
 *  send it). */
export interface SinkAuditEntry {
  id: string;
  ts: string;
  tool: string;
  governance: string;
  errored: boolean;
  summary?: string;
}

/**
 * Read the platform sink's tail for this society. `./status.ts`'s audit
 * section falls back to this ONLY when the local log reads empty (fast
 * path: an already-populated local log never touches the network). Never
 * throws: any failure reads as "no entries", matching the local log's own
 * degrade-to-empty posture.
 */
export async function readSinkTail(limit = 20): Promise<SinkAuditEntry[]> {
  if (!sinkConfigured()) return [];
  try {
    const res = await fetch(
      `${base()}/api/society-audit/tail?society=${encodeURIComponent(societyId())}&limit=${encodeURIComponent(String(limit))}`,
      {
        headers: { "x-gate-token": gateToken() },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; entries?: SinkAuditEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

/** Writes lost forwarding to the platform sink since this isolate booted.
 *  Cheap, best-effort, resets on cold start -- surfaced in `GET /api/status`
 *  alongside `localAuditDroppedWrites` so silent data loss on EITHER leg is
 *  visible instead of hidden. */
export function sinkAuditDroppedWrites(): number {
  return mem.dropped;
}

/** Test-only: reset in-memory state between tests. */
export function __resetAuditSinkForTests(): void {
  mem.dropped = 0;
}
