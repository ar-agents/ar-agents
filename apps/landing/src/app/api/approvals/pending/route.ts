/**
 * `GET /api/approvals/pending?society=<id>`, the actions awaiting a human.
 *
 * Powers the administrator's dashboard: the queue of deferred, approval-level
 * acts a society's agent wants to take.
 *
 * Two views (DeepSec: argsPreview can carry amounts, counterparties, CUITs,
 * account/invoice details — IDOR-style disclosure since society ids are public):
 *  - PUBLIC (no/invalid token): redacted metadata only — id, tool, status,
 *    createdAt, resolvedAt/By. No `argsPreview`, no `argsHash` (the hash aids
 *    correlation of the underlying args).
 *  - PRIVATE (valid society admin capability token via the `x-admin-token`
 *    header): full objects incl. `argsPreview`, served `private, no-store`.
 *    Same capability the resolve endpoint requires. The token goes in a header,
 *    never the query string, so it isn't logged.
 */

import { pendingApprovals, type ApprovalRequest } from "@/lib/approvals";
import { verifyAdminToken } from "@/lib/admin-token";
import { jsonCors, preflight } from "@/lib/cors";

export const runtime = "edge";

/** Public view: non-sensitive metadata only (drop argsPreview + argsHash). */
function redactApproval(
  r: ApprovalRequest,
): Omit<ApprovalRequest, "argsPreview" | "argsHash"> {
  const { argsPreview: _preview, argsHash: _hash, ...rest } = r;
  void _preview;
  void _hash;
  return rest;
}

export async function GET(req: Request) {
  const society = new URL(req.url).searchParams.get("society")?.trim() ?? "";
  if (!society) {
    return jsonCors({ ok: false, error: "falta_society" }, { status: 400 });
  }

  const token = req.headers.get("x-admin-token")?.trim() ?? "";
  const authorized = token ? await verifyAdminToken(society, token) : false;

  const pending = await pendingApprovals(society);
  if (authorized) {
    // Full view for the society admin — never cache the sensitive args.
    return jsonCors(
      { ok: true, society, authorized: true, pending },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return jsonCors(
    { ok: true, society, authorized: false, pending: pending.map(redactApproval) },
    { headers: { "Cache-Control": "public, max-age=5" } },
  );
}

export async function OPTIONS() {
  return preflight();
}
