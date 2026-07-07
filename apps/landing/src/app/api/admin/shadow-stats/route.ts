import { jsonCors, preflight } from "@/lib/cors";
import { isRegistryAdmin } from "@/lib/admin-auth";
import { getShadowStats } from "@/lib/shadow";

/**
 * GET /api/admin/shadow-stats  — INTERNAL, admin-only.
 *
 * The READER for the oracle request-analytics counters (lib/shadow.ts):
 * aggregate counters only, NO PII. Gated on the global REGISTRY_ADMIN_TOKEN
 * (constant-time, fail-closed when unset). INTERNAL by posture: this route is
 * deliberately NOT advertised in agents.json / /api/discovery / openapi /
 * llms.txt, and never cached.
 *
 * Optional ?days=N (1..70, default 30) sizes the aggregation window.
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!(await isRegistryAdmin(req))) {
    return jsonCors({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const days = Number(new URL(req.url).searchParams.get("days"));
  const windowDays = Number.isFinite(days) && days > 0 ? days : 30;
  const stats = await getShadowStats(windowDays);
  return jsonCors({ ok: true, stats }, { headers: { "Cache-Control": "no-store" } });
}

export async function OPTIONS() {
  return preflight();
}
