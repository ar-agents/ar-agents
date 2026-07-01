/**
 * /api/admin/registry — INTERNAL, admin-only (REGISTRY_ADMIN_TOKEN, constant-time,
 * fail-closed). The operational surface over the registry STATE MACHINE:
 *
 *   GET  ?id=<slug>   -> one entity's full risk view: record + dimensional score
 *                        breakdown + incident log + daily history.
 *   GET  (no id)      -> a compact admin index (id/name/status/verdict/score).
 *   POST {id,target,to,reason?,incidentSeverity?,incidentKind?}
 *                     -> drive a validated transition (status OR good-standing).
 *                        The KILL-SWITCH is target:"good-standing", to:"revoked".
 *
 * Deliberately NOT advertised in agents.json / /api/discovery / openapi / llms.txt
 * (it lives under /api/admin, which the public-posture guard forbids from any
 * discovery surface) and never cached.
 */

import { jsonCors, preflight } from "@/lib/cors";
import { constantTimeEqual } from "@/lib/incorporate-auth";
import {
  getRecord,
  listRecords,
  setRailPosture,
  setKeyPosture,
  type RegistryStatus,
  type GoodStandingState,
  type RailPosture,
  type KeyPosture,
} from "@/lib/registry-store";
import {
  transitionStatus,
  transitionGoodStanding,
  type TransitionResult,
} from "@/lib/registry-lifecycle";
import { scoreEntry } from "@/lib/good-standing-score";
import { listIncidents, incidentSummary, type IncidentSeverity } from "@/lib/registry-incidents";
import { getHistory } from "@/lib/registry-history";

export const runtime = "nodejs";

const VALID_STATUS = new Set<RegistryStatus>(["forming", "stale", "draft", "live", "deprecated"]);
const VALID_GS = new Set<GoodStandingState>(["unverified", "active", "suspended", "revoked"]);
const VALID_SEV = new Set<IncidentSeverity>(["info", "warning", "critical"]);

async function isAdmin(req: Request): Promise<boolean> {
  const configured = process.env.REGISTRY_ADMIN_TOKEN?.trim();
  if (!configured) return false; // fail-closed: disabled when unset
  const presented =
    req.headers.get("x-admin-token")?.trim() ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!presented) return false;
  return constantTimeEqual(presented, configured);
}

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

async function entityView(id: string) {
  const rec = await getRecord(id);
  if (!rec) return null;
  const summary = await incidentSummary(id);
  const score = scoreEntry({
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
  return {
    record: rec,
    score,
    incidentSummary: summary,
    incidents: await listIncidents(id),
    history: await getHistory(id),
  };
}

export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return jsonCors({ ok: false, error: "unauthorized" }, { status: 401, ...NO_STORE });
  }
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (id) {
    const view = await entityView(id);
    if (!view) return jsonCors({ ok: false, error: "not_found" }, { status: 404, ...NO_STORE });
    return jsonCors({ ok: true, ...view }, NO_STORE);
  }
  // Compact index (cheap: no per-entity incident/score fan-out).
  const all = await listRecords();
  const entities = all.slice(0, 500).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    state: r.goodStanding.state,
    lastScore: r.goodStanding.lastScore,
    source: r.source,
    updatedAt: r.updatedAt,
  }));
  return jsonCors({ ok: true, count: entities.length, entities }, NO_STORE);
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return jsonCors({ ok: false, error: "unauthorized" }, { status: 401, ...NO_STORE });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonCors({ ok: false, error: "invalid_json" }, { status: 400, ...NO_STORE });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const target = typeof body.target === "string" ? body.target : "";
  const to = typeof body.to === "string" ? body.to : "";
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : undefined;
  const incidentSeverity =
    typeof body.incidentSeverity === "string" && VALID_SEV.has(body.incidentSeverity as IncidentSeverity)
      ? (body.incidentSeverity as IncidentSeverity)
      : undefined;
  const incidentKind = typeof body.incidentKind === "string" ? body.incidentKind.slice(0, 64) : undefined;

  if (!id) return jsonCors({ ok: false, error: "missing id" }, { status: 400, ...NO_STORE });

  // Rail posture: a PII-free USD-rail declaration (not a lifecycle transition).
  if (target === "rail-posture") {
    const rp =
      typeof body.railPosture === "object" && body.railPosture
        ? (body.railPosture as Record<string, unknown>)
        : {};
    const usdRail =
      rp.usdRail === "ousd" || rp.usdRail === "usdc" || rp.usdRail === "other" || rp.usdRail === null
        ? (rp.usdRail as "ousd" | "usdc" | "other" | null)
        : undefined;
    const posture: RailPosture = {
      ...(usdRail !== undefined ? { usdRail } : {}),
      ...(typeof rp.ousdEnabled === "boolean" ? { ousdEnabled: rp.ousdEnabled } : {}),
      ...(typeof rp.yieldEnabled === "boolean" ? { yieldEnabled: rp.yieldEnabled } : {}),
    };
    const rec = await setRailPosture(id, posture);
    if (!rec) return jsonCors({ ok: false, error: "not_found" }, { status: 404, ...NO_STORE });
    return jsonCors({ ok: true, record: rec }, NO_STORE);
  }

  // Key posture: a PII-free key-control declaration (custodial vs ubo_controlled).
  if (target === "key-posture") {
    const kp =
      typeof body.keyPosture === "object" && body.keyPosture
        ? (body.keyPosture as Record<string, unknown>)
        : {};
    const mode =
      kp.mode === "custodial" || kp.mode === "ubo_controlled"
        ? (kp.mode as "custodial" | "ubo_controlled")
        : undefined;
    const posture: KeyPosture = { ...(mode !== undefined ? { mode } : {}) };
    const rec = await setKeyPosture(id, posture);
    if (!rec) return jsonCors({ ok: false, error: "not_found" }, { status: 404, ...NO_STORE });
    return jsonCors({ ok: true, record: rec }, NO_STORE);
  }

  const opts = {
    ...(reason ? { reason } : {}),
    source: "admin",
    ...(incidentSeverity
      ? { incident: { severity: incidentSeverity, ...(incidentKind ? { kind: incidentKind } : {}) } }
      : {}),
  };

  let result: TransitionResult;
  if (target === "status") {
    if (!VALID_STATUS.has(to as RegistryStatus)) {
      return jsonCors({ ok: false, error: "invalid status" }, { status: 400, ...NO_STORE });
    }
    result = await transitionStatus(id, to as RegistryStatus, opts);
  } else if (target === "good-standing") {
    if (!VALID_GS.has(to as GoodStandingState)) {
      return jsonCors({ ok: false, error: "invalid good-standing state" }, { status: 400, ...NO_STORE });
    }
    result = await transitionGoodStanding(id, to as GoodStandingState, opts);
  } else {
    return jsonCors(
      { ok: false, error: "target must be 'status', 'good-standing', 'rail-posture', or 'key-posture'" },
      { status: 400, ...NO_STORE },
    );
  }

  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return jsonCors({ ok: false, error: result.error }, { status, ...NO_STORE });
  }
  return jsonCors({ ok: true, record: result.record }, NO_STORE);
}

export async function OPTIONS() {
  return preflight();
}
