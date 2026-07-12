/**
 * `GET /api/status`: authenticated diagnostic status for studio's "sociedad
 * en vivo" cockpit (ROADMAP.md M3-2). Read-only, no side effects.
 *
 * Auth: `Authorization: Bearer <STUDIO_STATUS_TOKEN>`, the same fail-closed,
 * constant-time pattern as `/api/agent`'s `AGENT_API_KEY` (see
 * `requireStatusToken` in `lib/guard.ts`), but a separate secret: this is a
 * studio-issued machine credential for a read-only surface, not the
 * token-spending agent loop.
 *
 * Every field beyond client wiring (`clientStatus()`, the exact source
 * page.tsx's diagnostic homepage already uses) degrades independently: see
 * `lib/status.ts` for why each of kill-switch / approvals / audit / treasury
 * (ROADMAP.md M2-4d: wallet address + USDC balance) can be `available: false`
 * on its own without failing this response.
 */

import { NextResponse } from "next/server";
import { clientIp, guardResponse, rateLimit, requireStatusToken } from "@/lib/guard";
import { clientStatus } from "@/lib/clients";
import { fetchApprovalsStatus, fetchAuditStatus, fetchKillSwitchStatus, fetchTreasuryStatus } from "@/lib/status";
import pkg from "../../../../package.json";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = requireStatusToken(req);
  if (!auth.ok) return guardResponse(auth);

  // Light per-IP damping: this is a read-only, token-gated diagnostic
  // endpoint (not the token-spending agent loop), but a leaked token
  // shouldn't let a caller hammer the upstream audit/approvals endpoints.
  if (!rateLimit("status", clientIp(req), 30, 60_000)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  const [killSwitch, approvals, audit, treasury] = await Promise.all([
    fetchKillSwitchStatus(),
    fetchApprovalsStatus(),
    fetchAuditStatus(),
    fetchTreasuryStatus(),
  ]);

  return NextResponse.json({
    ok: true,
    denominacion: process.env.SOCIEDAD_IA_DENOMINACION?.trim() || "Sociedad automatizada",
    version: pkg.version,
    uptimeSeconds: Math.floor(process.uptime()),
    clients: clientStatus(),
    killSwitch,
    approvals,
    audit,
    treasury,
  });
}
