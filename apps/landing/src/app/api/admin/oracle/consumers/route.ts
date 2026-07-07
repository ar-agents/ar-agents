/**
 * /api/admin/oracle/consumers — INTERNAL, admin-only (REGISTRY_ADMIN_TOKEN,
 * constant-time, fail-closed). Manage oracle consumer keys.
 *
 *   GET                      -> list consumers (metadata only; never the keys).
 *   POST { label }           -> mint a key; the raw key is returned ONCE.
 *   POST { revoke: <id> }    -> revoke a consumer.
 */

import { jsonCors, preflight } from "@/lib/cors";
import { isRegistryAdmin } from "@/lib/admin-auth";
import { mintConsumerKey, listConsumers, revokeConsumer } from "@/lib/oracle-consumer";
import { deleteWebhooksForConsumer } from "@/lib/oracle-webhooks";

export const runtime = "nodejs";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET(req: Request) {
  if (!(await isRegistryAdmin(req))) {
    return jsonCors({ ok: false, error: "unauthorized" }, { status: 401, ...NO_STORE });
  }
  return jsonCors({ ok: true, consumers: await listConsumers() }, NO_STORE);
}

export async function POST(req: Request) {
  if (!(await isRegistryAdmin(req))) {
    return jsonCors({ ok: false, error: "unauthorized" }, { status: 401, ...NO_STORE });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonCors({ ok: false, error: "invalid_json" }, { status: 400, ...NO_STORE });
  }

  if (typeof body.revoke === "string" && body.revoke.trim()) {
    const id = body.revoke.trim();
    const ok = await revokeConsumer(id);
    if (!ok) return jsonCors({ ok: false, error: "not_found" }, { status: 404, ...NO_STORE });
    // Cascade: tear down the consumer's push subscriptions so the revoked party
    // stops receiving the signed feed (delivery also skips revoked consumers, but
    // this frees the hooks). Best-effort — revocation itself already succeeded.
    const webhooksDeleted = await deleteWebhooksForConsumer(id).catch(() => 0);
    return jsonCors({ ok: true, revoked: id, webhooksDeleted }, NO_STORE);
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
