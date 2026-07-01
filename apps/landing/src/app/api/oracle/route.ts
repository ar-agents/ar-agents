/**
 * GET /api/oracle?id=<entityId> — the GRANULAR profile for an AUTHENTICATED
 * consumer (bank / PSP / marketplace / agent framework). Richer than the public
 * good-standing oracle: the full incident log + the daily history + the score
 * breakdown + the PII-FREE ubo status, in one call.
 *
 * Auth: an admin-minted consumer key (`x-oracle-key: orc_...`) OR the global admin
 * token. Fail-closed. Still PII-FREE (no UBO name / gov id; that stays on the
 * admin UBO route). No-store; per-consumer rate-limited.
 */

import { jsonCors, preflight } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { authenticateConsumer } from "@/lib/oracle-consumer";
import { getRecord } from "@/lib/registry-store";
import { scoreEntry } from "@/lib/good-standing-score";
import { incidentSummary, listIncidents } from "@/lib/registry-incidents";
import { getHistory } from "@/lib/registry-history";
import { getUboStatus } from "@/lib/ubo";

export const runtime = "nodejs";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET(req: Request): Promise<Response> {
  const auth = await authenticateConsumer(req);
  if (!auth) {
    return jsonCors(
      { ok: false, error: "unauthorized", note: "send x-oracle-key: orc_... (admin-minted) or the admin token" },
      { status: 401, ...NO_STORE },
    );
  }

  // Per-caller rate limit (consumer id or admin).
  const who = auth.kind === "consumer" ? auth.consumer.id : "admin";
  if (!rateLimit(`oracle-granular:${who}`, clientIp(req), 120, 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429, ...NO_STORE });
  }

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return jsonCors({ ok: false, error: "missing id" }, { status: 400, ...NO_STORE });

  const rec = await getRecord(id);
  if (!rec) return jsonCors({ ok: false, error: "not_found" }, { status: 404, ...NO_STORE });

  const [summary, incidents, history, ubo] = await Promise.all([
    incidentSummary(id),
    listIncidents(id),
    getHistory(id),
    getUboStatus(id),
  ]);

  const nonAttesting = rec.status === "forming" || rec.status === "stale";
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

  return jsonCors(
    {
      ok: true,
      entity: {
        id: rec.id,
        name: rec.name,
        type: rec.type,
        status: rec.status,
        jurisdiction: rec.jurisdiction,
        publicUrl: rec.publicUrl,
      },
      goodStanding: {
        state: rec.goodStanding.state,
        attesting: !nonAttesting,
        headlineScore: rec.goodStanding.lastScore,
        headlineRating: rec.goodStanding.lastRating,
        lastCheckedAt: rec.goodStanding.lastCheckedAt,
        dimensionalScore: score.overall,
        dimensionalRating: score.rating,
        dimensions: score.dimensions,
      },
      ubo, // PII-FREE status (present/level/method/bankable) or null
      incidentSummary: summary,
      incidents,
      history,
      meta: {
        by: auth.kind,
        ...(auth.kind === "consumer" ? { consumer: auth.consumer.label } : {}),
      },
    },
    NO_STORE,
  );
}

export async function OPTIONS(): Promise<Response> {
  return preflight();
}
