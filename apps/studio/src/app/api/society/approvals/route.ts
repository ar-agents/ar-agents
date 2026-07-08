/**
 * `GET /api/society/approvals` (auth): the full pending-approvals list for
 * the account's society, via the stored admin capability token.
 * `POST /api/society/approvals` (auth): approve or deny one pending item.
 * See docs/CONTRACT.md.
 */

import { z } from "zod";
import { authenticate, getStoredSociety } from "@/lib/account";
import { pendingApprovalsPrivate, resolveApproval } from "@/lib/aragents";
import { kvRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** Best-effort extraction of the upstream's own error code, so a specific
 *  failure (e.g. "aprobacion_inexistente") reaches the UI instead of a
 *  generic one, without trusting the shape of the upstream body. */
function upstreamErrorCode(data: unknown): string {
  if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string") {
    return (data as { error: string }).error;
  }
  return "upstream_error";
}

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const society = await getStoredSociety(auth.accountId);
  if (!society) {
    return Response.json({ ok: false, error: "sin_sociedad" }, { status: 404 });
  }

  const upstream = await pendingApprovalsPrivate(society.sessionId, society.adminToken);
  if (!upstream.ok) {
    return Response.json({ ok: false, error: "upstream_error" }, { status: upstream.status ?? 502 });
  }
  return Response.json({ ok: true, approvals: upstream.data.pending ?? [] });
}

const ResolveBodySchema = z.object({
  id: z.string().trim().min(1),
  approved: z.boolean(),
});

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  if (!(await kvRateLimit("society-approvals-resolve", auth.accountId, 60, 60 * 60))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const society = await getStoredSociety(auth.accountId);
  if (!society) {
    return Response.json({ ok: false, error: "sin_sociedad" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = ResolveBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "cuerpo_invalido", detail: parsed.error.format() },
      { status: 400 },
    );
  }

  const upstream = await resolveApproval({
    id: parsed.data.id,
    approved: parsed.data.approved,
    adminToken: society.adminToken,
  });
  if (!upstream.ok) {
    return Response.json(
      { ok: false, error: upstreamErrorCode(upstream.data) },
      { status: upstream.status ?? 502 },
    );
  }
  return Response.json(upstream.data);
}
