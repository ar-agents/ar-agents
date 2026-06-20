/**
 * `POST /api/approvals/gate`, called by a society's central enforcement.
 *
 * Consume-or-queue: if this exact action (society + tool + args) was already
 * approved, it is consumed and `{ approved: true }` is returned so the act
 * proceeds once; otherwise a pending approval is queued and `{ approved: false,
 * status: "pending" }` is returned so the society DEFERS the act. This is the
 * async art. 102 gate for a deployed, autonomous society.
 */

import { jsonCors, preflight } from "@/lib/cors";
import { gateAction } from "@/lib/approvals";
import { clientIp, kvRateLimit, rateLimit } from "@/lib/ratelimit";
import { societyAdminPrincipal } from "@/lib/suspension";

export const runtime = "edge";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit("approvals-gate", ip, 60, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("approvals-gate", ip, 60, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonCors({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const b = raw as { society?: unknown; tool?: unknown; args?: unknown };
  const society = typeof b.society === "string" ? b.society.trim() : "";
  const tool = typeof b.tool === "string" ? b.tool.trim() : "";
  if (!society || !tool) {
    return jsonCors({ ok: false, error: "falta_society_o_tool" }, { status: 400 });
  }
  // Only a constituted society may queue approvals. Without this, an anonymous
  // caller could poison arbitrary / nonexistent societies' (public) pending
  // queues, drowning a real malicious approval in noise (approval fatigue).
  if (!(await societyAdminPrincipal(society))) {
    return jsonCors({ ok: false, error: "sociedad_sin_registro" }, { status: 404 });
  }
  const result = await gateAction(society, tool, b.args ?? {});
  return jsonCors({ ok: true, ...result });
}

export async function OPTIONS() {
  return preflight();
}
