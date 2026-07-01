/**
 * GET /api/cron/registry-gc — Registry Garbage Collector (Vercel Cron).
 *
 * Keeps the registry corpus HIGH-SIGNAL: a `forming` stub minted at an entity's
 * birth that shows NO formation progress (no checklist advance / audit activity)
 * past the staleness threshold is flipped to `stale`. The flip goes through the
 * validated lifecycle transitionStatus, so it is historized + logged as an
 * incident. It is REVERSIBLE: a `stale` entry that resumes progress can be moved
 * back to `forming` (STATUS_TRANSITIONS.stale includes "forming"), and `stale` is
 * explicitly NON-ATTESTING in the oracle, so a stalled stub never looks bankable.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` (fail-closed when
 * unset). A human/agent can also trigger it with the REGISTRY_ADMIN_TOKEN. Node
 * runtime. `?dryRun=1` reports what WOULD be staled without mutating.
 */

import { jsonCors } from "@/lib/cors";
import { constantTimeEqual } from "@/lib/incorporate-auth";
import { listRecords, type RegistryRecord } from "@/lib/registry-store";
import { transitionStatus } from "@/lib/registry-lifecycle";

export const runtime = "nodejs";

const STALE_AFTER_DAYS = 45;
const DAY_MS = 86_400_000;
const MAX_PER_RUN = 500; // bound the work per invocation

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

async function authorized(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  // Manual admin trigger (x-admin-token or Bearer with the admin token).
  const admin = process.env.REGISTRY_ADMIN_TOKEN?.trim();
  const presented =
    req.headers.get("x-admin-token")?.trim() || (auth || "").replace(/^Bearer\s+/i, "").trim();
  if (admin && presented && (await constantTimeEqual(presented, admin))) return true;
  return false;
}

/** The staleness clock: last formation progress, else the birth timestamp. */
function lastProgressMs(rec: RegistryRecord): number {
  const iso = rec.formation?.lastProgressAt ?? rec.createdAt;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export async function runRegistryGc(
  dryRun: boolean,
  nowMs: number,
): Promise<{
  scanned: number;
  candidates: string[];
  staled: string[];
  failed: string[];
  dryRun: boolean;
  staleAfterDays: number;
}> {
  const all = await listRecords();
  const cutoff = nowMs - STALE_AFTER_DAYS * DAY_MS;
  const candidates = all
    .filter((r) => r.status === "forming")
    .filter((r) => {
      const ms = lastProgressMs(r);
      return ms > 0 && ms < cutoff;
    })
    .slice(0, MAX_PER_RUN);

  const staled: string[] = [];
  const failed: string[] = [];
  if (!dryRun) {
    for (const r of candidates) {
      try {
        const res = await transitionStatus(r.id, "stale", {
          reason: `garbage-collector: no formation progress in >${STALE_AFTER_DAYS}d`,
          source: "garbage-collector",
          incident: { severity: "info", kind: "stale-gc" },
        });
        if (res.ok) staled.push(r.id);
        else failed.push(r.id);
      } catch {
        failed.push(r.id);
      }
    }
  }
  return {
    scanned: all.filter((r) => r.status === "forming").length,
    candidates: candidates.map((r) => r.id),
    staled,
    failed,
    dryRun,
    staleAfterDays: STALE_AFTER_DAYS,
  };
}

export async function GET(req: Request): Promise<Response> {
  if (!(await authorized(req))) {
    return jsonCors(
      { ok: false, error: "unauthorized", note: "Vercel Cron Bearer CRON_SECRET, or x-admin-token" },
      { status: 401, ...NO_STORE },
    );
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const result = await runRegistryGc(dryRun, Date.now());
  return jsonCors({ ok: true, ...result }, NO_STORE);
}
