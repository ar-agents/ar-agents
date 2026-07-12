/**
 * `POST /api/society-audit/append` (ROADMAP.md M3-6): a constituted
 * society's own deploy dual-writes one local audit entry here, so its
 * operating history survives serverless recycling even without its own
 * KV_REST_API_URL/TOKEN. See apps/sociedad-ia-starter/src/lib/audit-sink.ts
 * for the caller.
 *
 * Auth: the society's own gate token (`@/lib/gate-token`), the SAME
 * credential `/api/approvals/gate` already requires -- proving the caller
 * IS that society by possession, not by knowledge of its public id. Unlike
 * `/api/approvals/gate`'s require-if-present carve-out for pre-gate-token
 * societies, this endpoint is new: every society gets a gate token at
 * constitution (unconditionally, see incorporate-attested/route.ts), so
 * there is no legacy caller to keep working. Fail closed, no carve-out.
 *
 * Isolation: this is the crux of M3-6. A society's entries live in a KV
 * key namespaced by its own id, but namespacing alone doesn't stop a
 * stranger who learns that id (ids appear in public audit links) from
 * writing into it -- the gate-token check does. A society can only write
 * its OWN namespace because only it holds its own token.
 */

import { isSessionIdValid } from "@/lib/audit";
import { jsonCors, preflight } from "@/lib/cors";
import { hasGateToken, verifyGateToken } from "@/lib/gate-token";
import { clientIp, kvRateLimit, rateLimit } from "@/lib/ratelimit";
import { appendSocietyAuditEntry } from "@/lib/society-audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = clientIp(req);
  // Pre-auth, per-IP damping: cheap protection against an anonymous flood
  // before we even look at the body.
  if (!rateLimit("society-audit-append", ip, 240, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("society-audit-append", ip, 240, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonCors({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const b = raw as { society?: unknown; gateToken?: unknown; entry?: unknown };
  const society = typeof b.society === "string" ? b.society.trim() : "";
  const gateToken = typeof b.gateToken === "string" ? b.gateToken : "";
  if (!society || !isSessionIdValid(society)) {
    return jsonCors({ ok: false, error: "falta_society" }, { status: 400 });
  }
  // Fail closed: no gate token minted (or a wrong one presented) refuses,
  // no exceptions. See the file header for why this endpoint has no
  // legacy carve-out unlike /api/approvals/gate.
  if (!(await hasGateToken(society)) || !(await verifyGateToken(society, gateToken))) {
    return jsonCors({ ok: false, error: "gate_token_invalido" }, { status: 403 });
  }

  // Post-auth, per-society limit: bounds a runaway (but authenticated)
  // agent loop independently of the pre-auth per-IP damping above -- a
  // valid token from one deploy shouldn't be able to flood its own
  // namespace unbounded either.
  if (!(await kvRateLimit("society-audit-append-society", society, 240, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const ok = await appendSocietyAuditEntry(society, b.entry);
  if (!ok) {
    return jsonCors({ ok: false, error: "entrada_invalida" }, { status: 400 });
  }
  return jsonCors({ ok: true });
}

export async function OPTIONS() {
  return preflight();
}
