/**
 * /api/registry/portability — the entity's PORTABILITY BUNDLE export.
 *
 *   GET ?id=<slug>[&pii=0]
 *
 * A signed, verifiable, replayable export of one registry entity's state that a
 * holder can check + reconstruct OFF ar-agents infrastructure (public/arg-portability.mjs).
 * The data state is portable; the live network trust is not.
 *
 * The bundle carries PII (operator identity, self-declared CUIT, formation
 * sidecar, UBO profile), so this route is:
 *   - owner/admin gated, FAIL-CLOSED (401 without a valid token),
 *   - token via HEADER only (never a query param),
 *   - never cached (no-store), never CORS-open, runtime nodejs (not the edge oracle),
 *   - never advertised on agents.json / openapi / discovery / llms.txt.
 * A PII bundle MUST be signed: if the signing key is unavailable we 503 rather than
 * emit an unsigned, freely-editable export.
 *
 * `?pii=0` returns the shareable PII-free subset (operator redacted, no formation,
 * no UBO profile) an entity can hand to a counterparty.
 */

import { isRegistryAdmin } from "@/lib/admin-auth";
import { verifyCapabilityToken } from "@/lib/capability-token";
import { getRecord } from "@/lib/registry-store";
import { buildBundle } from "@/lib/portability-bundle";
import type { PortabilityBundle } from "@/lib/portability-bundle-core";
import { kvRateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

const OWNER_KIND = "registry-owner";
const MAX_BYTES = 1_000_000; // hard ceiling; 413 past it

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return json({ ok: false, error: "missing id" }, 400);

  // AUTH FIRST, fail-closed: admin token OR the per-entry owner cap-token via
  // HEADER ONLY. A PII-gating token must never travel in a query param (logs,
  // Referer, browser history). Seed/formed entries have no owner token, so their
  // export requires the admin token — never falls through to "anyone".
  const admin = await isRegistryAdmin(req);
  const ownerToken = req.headers.get("x-registry-token")?.trim() || "";
  const owner = ownerToken ? await verifyCapabilityToken(OWNER_KIND, id, ownerToken) : false;
  if (!admin && !owner) {
    return json(
      {
        ok: false,
        error: "unauthorized",
        note:
          "the portability bundle carries the entity's private state; present the per-entry owner token (x-registry-token) or the ar-agents admin token",
      },
      401,
    );
  }

  // Abuse damping on top of the auth gate (the gate is the real bound; fail-open).
  const allowed = await kvRateLimit("registry-portability", clientIp(req), 20, 60);
  if (!allowed) return json({ ok: false, error: "rate_limited" }, 429);

  const rec = await getRecord(id);
  if (!rec) return json({ ok: false, error: "not_found" }, 404);

  const includePii = url.searchParams.get("pii") !== "0";

  let bundle: PortabilityBundle | null = null;
  try {
    bundle = await buildBundle(id, { includePii });
  } catch {
    return json({ ok: false, error: "bundle_build_failed" }, 500);
  }
  if (!bundle) return json({ ok: false, error: "not_found" }, 404);

  // A PII bundle MUST be signed. If the key is unavailable, refuse rather than
  // emit an unsigned, freely-editable export.
  if (!bundle.sig) return json({ ok: false, error: "signing_unavailable" }, 503);

  const serialized = JSON.stringify(bundle, null, 2);
  if (serialized.length > MAX_BYTES) return json({ ok: false, error: "bundle_too_large" }, 413);

  return new Response(serialized, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="portability-bundle-${id}.json"`,
    },
  });
}
