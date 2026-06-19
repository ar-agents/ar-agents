/**
 * `GET /api/suspension-status?society=<id>`, the kill-switch state.
 *
 * Public read so a constituted society's agent can consult its own suspension
 * state on each turn (its central enforcement passes the result as `isHalted`).
 * On a storage error it returns 503 with `suspended: true`, so the consumer
 * FAILS CLOSED: a society that can't confirm it is allowed to act must not act.
 */

import { jsonCors, preflight } from "@/lib/cors";
import { isSuspended } from "@/lib/suspension";

export const runtime = "edge";

export async function GET(req: Request) {
  const society = new URL(req.url).searchParams.get("society")?.trim() ?? "";
  if (!society) {
    return jsonCors({ ok: false, error: "falta_society" }, { status: 400 });
  }
  try {
    const suspended = await isSuspended(society);
    return jsonCors(
      { ok: true, society, suspended },
      { headers: { "Cache-Control": "public, max-age=15, s-maxage=15" } },
    );
  } catch {
    return jsonCors(
      { ok: false, error: "indeterminado", suspended: true },
      { status: 503 },
    );
  }
}

export async function OPTIONS() {
  return preflight();
}
