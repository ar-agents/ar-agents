/**
 * `GET /api/play/audit/[sessionId]`, public audit log for a /play
 * session. Each entry is HMAC-SHA256-signed; consumers can re-compute
 * the signature against `AUDIT_HMAC_SECRET` (server-side only) to
 * confirm authenticity, OR call this endpoint with `?verify=1` to ask
 * the server to verify and report tampering counts.
 *
 * RFC-001 § 9.2: this endpoint is the forensic interface. Anyone
 * inspecting a sociedad-IA's claimed operating history hits it with
 * the session id pulled from the audit reference.
 */

import { NextResponse } from "next/server";
import {
  backend,
  isSessionIdValid,
  readAudit,
  verifySession,
} from "@/lib/audit";

export const runtime = "edge";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;
  if (!isSessionIdValid(sessionId)) {
    return NextResponse.json(
      { error: "invalid_session_id" },
      { status: 400 },
    );
  }
  const url = new URL(req.url);
  const wantsVerify = url.searchParams.get("verify") === "1";

  const entries = await readAudit(sessionId);
  const result: Record<string, unknown> = {
    sessionId,
    backend: backend(),
    count: entries.length,
    entries,
  };
  if (wantsVerify) {
    const stats = await verifySession(sessionId);
    result.verification = stats;
  }
  return NextResponse.json(result, {
    headers: {
      "cache-control":
        "public, max-age=10, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
