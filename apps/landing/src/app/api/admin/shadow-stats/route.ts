import { jsonCors, preflight } from "@/lib/cors";
import { constantTimeEqual } from "@/lib/incorporate-auth";
import { getShadowStats } from "@/lib/shadow";

/**
 * GET /api/admin/shadow-stats  — INTERNAL, admin-only.
 *
 * The READER for the shadow-onboarding latent-demand metric (lib/shadow.ts):
 * aggregate counters only, NO PII. Gated on the global REGISTRY_ADMIN_TOKEN
 * (constant-time, fail-closed when unset). INTERNAL by posture: this route is
 * deliberately NOT advertised in agents.json / /api/discovery / openapi /
 * llms.txt, and never cached.
 *
 * Optional ?days=N (1..70, default 30) sizes the aggregation window.
 */
export const runtime = "nodejs";

async function isAdmin(req: Request): Promise<boolean> {
  const configured = process.env.REGISTRY_ADMIN_TOKEN?.trim();
  if (!configured) return false; // fail-closed: disabled when unset
  const presented =
    req.headers.get("x-admin-token")?.trim() ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!presented) return false;
  return constantTimeEqual(presented, configured);
}

export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
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
