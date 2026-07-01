/**
 * /api/oracle/webhooks — consumer-facing webhook management (authenticated with an
 * admin-minted consumer key `x-oracle-key: orc_...`, or the admin token).
 *
 *   GET                          -> list the caller's webhooks.
 *   POST { url, entityId? }       -> register a webhook (SSRF-guarded url).
 *   POST { delete: <webhookId> }  -> delete one of the caller's webhooks.
 *
 * Delivered events are Ed25519-signed (verify offline with `arg-verify attestation`).
 */

import { jsonCors, preflight } from "@/lib/cors";
import { authenticateConsumer } from "@/lib/oracle-consumer";
import { registerWebhook, listWebhooks, deleteWebhook } from "@/lib/oracle-webhooks";

export const runtime = "nodejs";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

async function callerId(req: Request): Promise<string | null> {
  const auth = await authenticateConsumer(req);
  if (!auth) return null;
  return auth.kind === "consumer" ? auth.consumer.id : "admin";
}

export async function GET(req: Request) {
  const id = await callerId(req);
  if (!id) return jsonCors({ ok: false, error: "unauthorized" }, { status: 401, ...NO_STORE });
  return jsonCors({ ok: true, webhooks: await listWebhooks(id) }, NO_STORE);
}

export async function POST(req: Request) {
  const id = await callerId(req);
  if (!id) return jsonCors({ ok: false, error: "unauthorized" }, { status: 401, ...NO_STORE });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonCors({ ok: false, error: "invalid_json" }, { status: 400, ...NO_STORE });
  }

  if (typeof body.delete === "string" && body.delete.trim()) {
    const ok = await deleteWebhook(id, body.delete.trim());
    if (!ok) return jsonCors({ ok: false, error: "not_found" }, { status: 404, ...NO_STORE });
    return jsonCors({ ok: true, deleted: body.delete.trim() }, NO_STORE);
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const entityId = typeof body.entityId === "string" ? body.entityId.trim() : undefined;
  if (!url) return jsonCors({ ok: false, error: "url required" }, { status: 400, ...NO_STORE });

  const result = await registerWebhook(id, url, entityId);
  if (result === null) {
    return jsonCors({ ok: false, error: "unwritable_or_at_capacity" }, { status: 503, ...NO_STORE });
  }
  if ("error" in result) {
    return jsonCors({ ok: false, error: result.error }, { status: 400, ...NO_STORE });
  }
  return jsonCors({ ok: true, webhook: result }, NO_STORE);
}

export async function OPTIONS() {
  return preflight();
}
