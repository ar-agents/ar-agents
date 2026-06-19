/**
 * `GET /api/approvals/pending?society=<id>`, the actions awaiting a human.
 *
 * Powers the administrator's dashboard: the queue of deferred, approval-level
 * acts a society's agent wants to take. Public read (the pending governance of a
 * society is semi-public, like its audit log); resolving them is CUIT-gated.
 */

import { pendingApprovals } from "@/lib/approvals";
import { jsonCors, preflight } from "@/lib/cors";

export const runtime = "edge";

export async function GET(req: Request) {
  const society = new URL(req.url).searchParams.get("society")?.trim() ?? "";
  if (!society) {
    return jsonCors({ ok: false, error: "falta_society" }, { status: 400 });
  }
  const pending = await pendingApprovals(society);
  return jsonCors(
    { ok: true, society, pending },
    { headers: { "Cache-Control": "public, max-age=5" } },
  );
}

export async function OPTIONS() {
  return preflight();
}
