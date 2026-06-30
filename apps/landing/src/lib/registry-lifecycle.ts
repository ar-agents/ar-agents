/**
 * Registry lifecycle: the validated STATE MACHINE + the DB-ready seam.
 *
 * Every status / good-standing transition goes through here so it is (a) checked
 * against an allow-list (no illegal jumps — e.g. a revoked entity can't silently
 * become active), and (b) recorded in the daily history + optionally the incident
 * log. registry-store stays the dumb storage layer; THIS module is the
 * orchestration boundary a future DB swap localizes to.
 *
 * Two small machines, matching the existing model's deliberate separation:
 *   - RegistryStatus  (the lifecycle: forming/draft/live/deprecated/stale)
 *   - GoodStandingState (the verdict: unverified/active/suspended/revoked)
 * `revoked` is the terminal KILL state (the guardrail kill-switch target).
 */

import {
  getRecord,
  upsertRecord,
  setGoodStanding,
  type RegistryRecord,
  type RegistryStatus,
  type GoodStandingState,
} from "./registry-store";
import { appendIncident, incidentSummary, type IncidentSeverity } from "./registry-incidents";
import { recordHistoryPoint } from "./registry-history";
import { scoreEntry } from "./good-standing-score";

/** Allowed status transitions. from===to is always allowed (idempotent no-op). */
export const STATUS_TRANSITIONS: Record<RegistryStatus, RegistryStatus[]> = {
  forming: ["live", "stale", "draft"],
  stale: ["forming", "live", "deprecated"],
  draft: ["live", "deprecated", "forming"],
  live: ["deprecated", "draft"],
  deprecated: ["live"],
};

/** Allowed good-standing transitions. `revoked` is terminal (no automatic return). */
export const GOOD_STANDING_TRANSITIONS: Record<GoodStandingState, GoodStandingState[]> = {
  unverified: ["active", "suspended", "revoked"],
  active: ["unverified", "suspended", "revoked"],
  suspended: ["active", "unverified", "revoked"],
  revoked: [],
};

export function canTransitionStatus(from: RegistryStatus, to: RegistryStatus): boolean {
  if (from === to) return true;
  return STATUS_TRANSITIONS[from].includes(to);
}

export function canTransitionGoodStanding(from: GoodStandingState, to: GoodStandingState): boolean {
  if (from === to) return true;
  return GOOD_STANDING_TRANSITIONS[from].includes(to);
}

export type TransitionError = "not_found" | "illegal_transition";
export type TransitionResult =
  | { ok: true; record: RegistryRecord }
  | { ok: false; error: TransitionError };

interface TransitionOpts {
  reason?: string;
  source?: string;
  incident?: { severity: IncidentSeverity; kind?: string };
}

/** Compute + persist today's history point for a record (best-effort). */
async function historize(rec: RegistryRecord): Promise<void> {
  const summary = await incidentSummary(rec.id);
  const sc = scoreEntry({
    status: rec.status,
    state: rec.goodStanding.state,
    conformanceScore: rec.goodStanding.lastScore,
    lastCheckedAt: rec.goodStanding.lastCheckedAt,
    incidents: {
      openCritical: summary.openCritical,
      openWarning: summary.openWarning,
      openInfo: summary.openInfo,
    },
  });
  await recordHistoryPoint(rec.id, {
    status: rec.status,
    state: rec.goodStanding.state,
    score: sc.overall,
    rating: sc.rating,
  });
}

/** Transition an entity's registry STATUS (lifecycle). Validated + historized. */
export async function transitionStatus(
  id: string,
  to: RegistryStatus,
  opts: TransitionOpts = {},
): Promise<TransitionResult> {
  const rec = await getRecord(id);
  if (!rec) return { ok: false, error: "not_found" };
  if (!canTransitionStatus(rec.status, to)) return { ok: false, error: "illegal_transition" };

  const next: RegistryRecord = { ...rec, status: to, updatedAt: new Date().toISOString() };
  const saved = await upsertRecord(next);
  if (!saved) return { ok: false, error: "not_found" };

  if (opts.incident) {
    await appendIncident(id, {
      kind: opts.incident.kind ?? `status:${to}`,
      severity: opts.incident.severity,
      note: opts.reason ?? `status -> ${to}`,
      source: opts.source ?? "admin",
    });
  }
  await historize(saved);
  return { ok: true, record: saved };
}

/** Transition an entity's GOOD-STANDING verdict. Validated + historized. The
 * kill-switch is `transitionGoodStanding(id, "revoked", { incident: {severity:"critical"} })`. */
export async function transitionGoodStanding(
  id: string,
  to: GoodStandingState,
  opts: TransitionOpts = {},
): Promise<TransitionResult> {
  const rec = await getRecord(id);
  if (!rec) return { ok: false, error: "not_found" };
  if (!canTransitionGoodStanding(rec.goodStanding.state, to)) {
    return { ok: false, error: "illegal_transition" };
  }

  const saved = await setGoodStanding(id, {
    state: to,
    ...(opts.reason ? { reason: opts.reason } : {}),
  });
  if (!saved) return { ok: false, error: "not_found" };

  if (opts.incident) {
    await appendIncident(id, {
      kind: opts.incident.kind ?? `good-standing:${to}`,
      severity: opts.incident.severity,
      note: opts.reason ?? `good-standing -> ${to}`,
      source: opts.source ?? "admin",
    });
  }
  await historize(saved);
  return { ok: true, record: saved };
}
