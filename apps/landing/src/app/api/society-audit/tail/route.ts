/**
 * `GET /api/society-audit/tail?society=<id>&limit=<n>` (ROADMAP.md M3-6):
 * a constituted society's own deploy reads its durable audit tail back from
 * here, used as `/api/status`'s fallback when its local log reads empty
 * (no KV of its own, or just recycled). See
 * apps/sociedad-ia-starter/src/lib/audit-sink.ts for the caller.
 *
 * Auth: the society's own gate token, presented as the `x-gate-token`
 * header (not a query param -- this is a secret, and query strings end up
 * in logs and referrers; `society` itself is already public, it appears in
 * audit links, so it stays a query param like `/api/suspension-status`).
 * Same fail-closed, no-legacy-carve-out posture as the append route.
 */

import { isSessionIdValid } from "@/lib/audit";
import { jsonCors, preflight } from "@/lib/cors";
import { hasGateToken, verifyGateToken } from "@/lib/gate-token";
import { clientIp, kvRateLimit, rateLimit } from "@/lib/ratelimit";
import { readSocietyAuditTail } from "@/lib/society-audit";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

export async function GET(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit("society-audit-tail", ip, 240, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("society-audit-tail", ip, 240, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(req.url);
  const society = url.searchParams.get("society")?.trim() ?? "";
  const gateToken = req.headers.get("x-gate-token")?.trim() ?? "";
  if (!society || !isSessionIdValid(society)) {
    return jsonCors({ ok: false, error: "falta_society" }, { status: 400 });
  }
  if (!(await hasGateToken(society)) || !(await verifyGateToken(society, gateToken))) {
    return jsonCors({ ok: false, error: "gate_token_invalido" }, { status: 403 });
  }

  if (!(await kvRateLimit("society-audit-tail-society", society, 240, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const limitParam = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(Math.floor(limitParam), MAX_LIMIT))
    : DEFAULT_LIMIT;

  const entries = await readSocietyAuditTail(society, limit);
  return jsonCors({ ok: true, society, entries }, { headers: { "Cache-Control": "no-store" } });
}

export async function OPTIONS() {
  return preflight();
}
