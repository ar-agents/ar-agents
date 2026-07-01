/**
 * Registry incident log (KV-backed, in-memory fallback, edge-safe, best-effort).
 *
 * An incident is an append-only event against a registry entity: a suspension, a
 * guardrail breach, a garbage-collector staling, an external signal. A
 * counterparty's risk view reads the summary, and the `incidents` good-standing
 * dimension is derived from the OPEN ones.
 *
 * Bounded per entity (a ring of the most recent MAX_PER_ENTITY) so an abusive or
 * runaway writer cannot grow KV unboundedly. Mirrors registry-store's
 * isKvWired() + in-memory fallback so behaviour is consistent and the EDGE
 * good-standing route can import it.
 */

import { kv } from "@vercel/kv";
import { withKvLock } from "./kv-lock";

export type IncidentSeverity = "info" | "warning" | "critical";

export interface Incident {
  id: string;
  entityId: string;
  /** ISO timestamp. */
  at: string;
  /** Short slug, e.g. "suspended", "guardrail-breach", "stale". */
  kind: string;
  severity: IncidentSeverity;
  note: string;
  /** Who/what raised it, e.g. "admin", "garbage-collector", "guardrail". */
  source: string;
  /** ISO when resolved; absent = still OPEN (drags the score). */
  resolvedAt?: string;
}

export interface IncidentSummary {
  total: number;
  open: number;
  openCritical: number;
  openWarning: number;
  openInfo: number;
  worstOpen: IncidentSeverity | null;
  lastAt: string | null;
}

const MAX_PER_ENTITY = 50;
const KEY = (entityId: string) => `registry:incidents:${entityId}`;
const mem = new Map<string, Incident[]>();

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

async function read(entityId: string): Promise<Incident[]> {
  if (!isKvWired()) return mem.get(entityId)?.slice() ?? [];
  try {
    const list = await kv.get<Incident[]>(KEY(entityId));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function write(entityId: string, list: Incident[]): Promise<void> {
  const bounded = list.slice(-MAX_PER_ENTITY);
  if (!isKvWired()) {
    mem.set(entityId, bounded);
    return;
  }
  try {
    await kv.set(KEY(entityId), bounded);
  } catch {
    // best-effort
  }
}

/** Append an incident. Best-effort: returns the stored incident, or null on error.
 * The read→push→write runs under a per-entity lock so two concurrent appends can't
 * both read N and both write N+1 (which would drop one incident, and a dropped
 * open-critical one silently inflates the good-standing score). */
export async function appendIncident(
  entityId: string,
  partial: { kind: string; severity: IncidentSeverity; note: string; source: string; at?: string },
): Promise<Incident | null> {
  if (!entityId) return null;
  try {
    return await withKvLock(`registry:incidents:${entityId}`, async () => {
      const inc: Incident = {
        id: crypto.randomUUID(),
        entityId,
        at: partial.at ?? new Date().toISOString(),
        kind: partial.kind.slice(0, 64),
        severity: partial.severity,
        note: partial.note.slice(0, 500),
        source: partial.source.slice(0, 64),
      };
      const list = await read(entityId);
      list.push(inc);
      await write(entityId, list);
      return inc;
    });
  } catch {
    return null;
  }
}

/** All incidents for an entity, NEWEST first. */
export async function listIncidents(entityId: string): Promise<Incident[]> {
  const list = await read(entityId);
  return list.slice().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Mark an incident resolved. Returns false if the id is unknown. Idempotent.
 * Read→modify→write under the per-entity lock so a concurrent append can't clobber
 * the resolution (or vice-versa). Best-effort: lock contention → false. */
export async function resolveIncident(entityId: string, incidentId: string): Promise<boolean> {
  try {
    return await withKvLock(`registry:incidents:${entityId}`, async () => {
      const list = await read(entityId);
      const idx = list.findIndex((i) => i.id === incidentId);
      if (idx < 0) return false;
      const cur = list[idx];
      if (!cur) return false;
      if (cur.resolvedAt) return true; // already resolved
      list[idx] = { ...cur, resolvedAt: new Date().toISOString() };
      await write(entityId, list);
      return true;
    });
  } catch {
    return false;
  }
}

const SEV_RANK: Record<IncidentSeverity, number> = { info: 1, warning: 2, critical: 3 };

/** Aggregate the incident state for the score + a counterparty's risk view. */
export async function incidentSummary(entityId: string): Promise<IncidentSummary> {
  const list = await read(entityId);
  let open = 0;
  let openCritical = 0;
  let openWarning = 0;
  let openInfo = 0;
  let worstOpen: IncidentSeverity | null = null;
  let lastAt: string | null = null;
  for (const i of list) {
    if (!lastAt || i.at > lastAt) lastAt = i.at;
    if (i.resolvedAt) continue;
    open++;
    if (i.severity === "critical") openCritical++;
    else if (i.severity === "warning") openWarning++;
    else openInfo++;
    if (!worstOpen || SEV_RANK[i.severity] > SEV_RANK[worstOpen]) worstOpen = i.severity;
  }
  return { total: list.length, open, openCritical, openWarning, openInfo, worstOpen, lastAt };
}

/** Test-only: clear the in-memory fallback store between cases. */
export function __resetIncidentsForTests(): void {
  mem.clear();
}
