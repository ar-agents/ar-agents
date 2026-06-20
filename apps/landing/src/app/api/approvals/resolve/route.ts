/**
 * `POST /api/approvals/resolve`, the administrator approves or denies a pending
 * action. Authorized by matching the caller's CUIT against the society's signed
 * constitution; the decision is recorded as a signed durable audit act (art.
 * 102). Body: { id, approved: boolean, administrador: { nombre, cuit } }.
 */

import { authorizeAndResolve } from "@/lib/approvals";
import { jsonCors, preflight } from "@/lib/cors";
import { clientIp, kvRateLimit, rateLimit } from "@/lib/ratelimit";

export const runtime = "edge";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit("approvals-resolve", ip, 60, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("approvals-resolve", ip, 60, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonCors({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const b = raw as {
    id?: unknown;
    approved?: unknown;
    adminToken?: unknown;
    nombre?: unknown;
  };
  const id = typeof b.id === "string" ? b.id.trim() : "";
  if (!id) return jsonCors({ ok: false, error: "falta_id" }, { status: 400 });
  if (typeof b.approved !== "boolean") {
    return jsonCors({ ok: false, error: "falta_approved" }, { status: 400 });
  }
  const adminToken = typeof b.adminToken === "string" ? b.adminToken.trim() : "";
  const nombre = typeof b.nombre === "string" ? b.nombre.trim() : undefined;
  if (!adminToken) {
    return jsonCors({ ok: false, error: "falta_token" }, { status: 400 });
  }

  const r = await authorizeAndResolve({ id, approved: b.approved, adminToken, nombre });
  if (!r.ok) return jsonCors({ ok: false, error: r.error }, { status: r.status });
  return jsonCors({ ok: true, request: r.request, audit: { entry: r.entry } });
}

export async function OPTIONS() {
  return preflight();
}
