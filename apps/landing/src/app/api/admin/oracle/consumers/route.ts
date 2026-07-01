/**
 * /api/admin/oracle/consumers — INTERNAL, admin-only (REGISTRY_ADMIN_TOKEN,
 * constant-time, fail-closed). Manage oracle consumer keys.
 *
 *   GET                      -> list consumers (metadata only; never the keys).
 *   POST { label }           -> mint a key; the raw key is returned ONCE.
 *   POST { revoke: <id> }    -> revoke a consumer.
 */

import { jsonCors, preflight } from "@/lib/cors";
import { constantTimeEqual } from "@/lib/incorporate-auth";
import { mintConsumerKey, listConsumers, revokeConsumer } from "@/lib/oracle-consumer";

export const runtime = "nodejs";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

async function isAdmin(req: Request): Promise<boolean> {
  const configured = process.env.REGISTRY_ADMIN_TOKEN?.trim();
  if (!configured) return false;
  const presented =
    req.headers.get("x-admin-token")?.trim() ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!presented) return false;
  return constantTimeEqual(presented, configured);
}

export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return jsonCors({ ok: false, error: "unauthorized" }, { status: 401, ...NO_STORE });
  }
  return jsonCors({ ok: true, consumers: await listConsumers() }, NO_STORE);
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return jsonCors({ ok: false, error: "unauthorized" }, { status: 401, ...NO_STORE });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonCors({ ok: false, error: "invalid_json" }, { status: 400, ...NO_STORE });
  }

  if (typeof body.revoke === "string" && body.revoke.trim()) {
    const ok = await revokeConsumer(body.revoke.trim());
    if (!ok) return jsonCors({ ok: false, error: "not_found" }, { status: 404, ...NO_STORE });
    return jsonCors({ ok: true, revoked: body.revoke.trim() }, NO_STORE);
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return jsonCors({ ok: false, error: "label required" }, { status: 400, ...NO_STORE });
  const minted = await mintConsumerKey(label);
  if (!minted) return jsonCors({ ok: false, error: "unwritable_or_at_capacity" }, { status: 503, ...NO_STORE });
  // The raw key is returned exactly once.
  return jsonCors(
    { ok: true, consumer: minted.consumer, key: minted.key, note: "store this key now; it is not retrievable again" },
    NO_STORE,
  );
}

export async function OPTIONS() {
  return preflight();
}
