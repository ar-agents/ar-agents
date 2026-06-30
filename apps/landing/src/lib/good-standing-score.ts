/**
 * Dimensional good-standing score (PURE, edge-safe, deterministic).
 *
 * The Sprint-2 oracle carries a single flat `score` (the endpoint-conformance
 * verdict from /api/certifier). That is one signal. A counterparty deciding
 * whether to transact wants a richer, explainable verdict: how conformant, how
 * FRESH that conformance is, how LIVE the entity is, and whether it has open
 * INCIDENTS. This module computes that breakdown from the effective verdict +
 * the entity's incident summary, with a weighted composite + a letter rating.
 *
 * Pure: it takes plain inputs (no RegistryRecord, no KV) so it is trivially
 * testable and safe to call from the EDGE good-standing route. Determinism is
 * achievable by passing `opts.now`.
 *
 * The flat headline `score` in the oracle answer is UNCHANGED (backward compat).
 * This breakdown is ADDITIVE: emitted under `goodStanding.dimensions` +
 * `dimensionalScore`/`dimensionalRating`.
 */

import type { RegistryStatus, GoodStandingState, Rating } from "./registry-store";

export type Dimension = "conformance" | "freshness" | "liveness" | "incidents";

/**
 * Weights over the four dimensions. They need NOT sum to 1: the composite
 * renormalizes over the dimensions that are actually computable for a given
 * entity (conformance + freshness are null when the entity was never certified),
 * so a never-certified-but-live entity still gets a meaningful liveness/incidents
 * composite rather than a flat null.
 */
export const DIMENSION_WEIGHTS: Record<Dimension, number> = {
  conformance: 0.45,
  freshness: 0.2,
  liveness: 0.2,
  incidents: 0.15,
};

/** Open (unresolved) incident counts by severity. Defaults to all-zero. */
export interface IncidentSummaryInput {
  openCritical: number;
  openWarning: number;
  openInfo: number;
}

export interface ScoreInput {
  status: RegistryStatus;
  state: GoodStandingState;
  /** The stored endpoint-conformance verdict (0..100), or null if never certified. */
  conformanceScore: number | null;
  /** ISO of the last certifier check, or null. */
  lastCheckedAt: string | null;
  /** Open-incident summary (defaults to "no open incidents"). */
  incidents?: IncidentSummaryInput;
}

export interface DimensionScore {
  /** 0..100, or null when not computable (e.g. never certified). */
  value: number | null;
  weight: number;
}

export interface ScoreResult {
  /** Weighted composite 0..100 over the COMPUTABLE dimensions, or null if none. */
  overall: number | null;
  rating: Rating;
  dimensions: Record<Dimension, DimensionScore>;
}

const FRESH_FULL_DAYS = 7;
const FRESH_ZERO_DAYS = 90;
const DAY_MS = 86_400_000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Rating bands. N/A ONLY when the composite is null (no computable dimension). */
export function rate(score: number | null): Rating {
  if (score === null) return "N/A";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/** Conformance freshness: full ≤7d, linear decay to 0 at ≥90d, null if unchecked. */
function freshnessScore(lastCheckedAt: string | null, nowMs: number): number | null {
  if (!lastCheckedAt) return null;
  const t = Date.parse(lastCheckedAt);
  if (!Number.isFinite(t)) return null;
  const days = (nowMs - t) / DAY_MS;
  if (days <= FRESH_FULL_DAYS) return 100;
  if (days >= FRESH_ZERO_DAYS) return 0;
  return Math.round(100 * ((FRESH_ZERO_DAYS - days) / (FRESH_ZERO_DAYS - FRESH_FULL_DAYS)));
}

/** Liveness from the lifecycle status + the good-standing verdict. Always computable. */
function livenessScore(status: RegistryStatus, state: GoodStandingState): number {
  if (state === "revoked") return 0; // killed
  if (state === "suspended") return 20;
  switch (status) {
    case "live":
      return state === "active" ? 100 : 50; // live but unverified
    case "draft":
      return 30;
    case "forming":
      return 25;
    case "deprecated":
      return 10;
    case "stale":
      return 10;
    default:
      return 0;
  }
}

/** Open incidents drag the score down, weighted by severity. Monotonic. */
function incidentsScore(s?: IncidentSummaryInput): number {
  if (!s) return 100;
  const penalty = s.openCritical * 35 + s.openWarning * 12 + s.openInfo * 3;
  return clamp(100 - penalty, 0, 100);
}

/** The certifier verdict, clamped, or null. We do NOT inflate from declared RFCs
 * (declared != verified — a null conformance is more honest than a paper proxy). */
function conformanceScore(input: ScoreInput): number | null {
  if (typeof input.conformanceScore === "number" && Number.isFinite(input.conformanceScore)) {
    return clamp(Math.round(input.conformanceScore), 0, 100);
  }
  return null;
}

export function scoreEntry(input: ScoreInput, opts?: { now?: number }): ScoreResult {
  const nowMs = opts?.now ?? Date.now();
  const dims: Record<Dimension, DimensionScore> = {
    conformance: { value: conformanceScore(input), weight: DIMENSION_WEIGHTS.conformance },
    freshness: { value: freshnessScore(input.lastCheckedAt, nowMs), weight: DIMENSION_WEIGHTS.freshness },
    liveness: { value: livenessScore(input.status, input.state), weight: DIMENSION_WEIGHTS.liveness },
    incidents: { value: incidentsScore(input.incidents), weight: DIMENSION_WEIGHTS.incidents },
  };

  let wsum = 0;
  let acc = 0;
  for (const d of Object.values(dims)) {
    if (d.value === null) continue;
    wsum += d.weight;
    acc += d.value * d.weight;
  }
  const overall = wsum > 0 ? Math.round(acc / wsum) : null;
  return { overall, rating: rate(overall), dimensions: dims };
}
