/**
 * POST /api/registry/reciprocity/accept — the RFC-003 receiving side.
 *
 * A receiving jurisdiction submits a Portability Bundle (exported from
 * GET /api/registry/portability) and gets back a ReciprocityAcceptance: the
 * bundle is verified AUTHENTIC (pinned to the ar-agents key, not merely
 * self-consistent), replayed off-infra, and mapped to a PII-free
 * PortableCreditFile it can honor. This is the callable counterpart to the
 * portability EXPORT and to what /rfcs/003 advertises.
 *
 * A rejection (`accepted:false`) is a valid 200 verification RESULT (mirrors
 * /api/mock-psp/decide returning a reject at 200). Non-200 is reserved for
 * malformed input / limits. Public verification surface: no secret, no state
 * change, no outbound fetch — it computes over the submitted bundle and returns.
 */

import { buildAcceptance } from "@/lib/reciprocity";
import type { PortabilityBundle } from "@/lib/portability-bundle-core";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

const MAX_BYTES = 512_000;
const MAX_JURISDICTION = 32;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(req: Request): Promise<Response> {
  if (!rateLimit("reciprocity-accept", clientIp(req), 30, 60_000)) {
    return json({ ok: false, error: "rate_limited" }, 429);
  }

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json({ ok: false, error: "payload_too_large" }, 413);

  let parsed: { bundle?: unknown; pinnedPublicKey?: unknown; targetJurisdiction?: unknown };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const bundle = parsed.bundle as PortabilityBundle | undefined;
  if (!bundle || typeof bundle !== "object") return json({ ok: false, error: "missing bundle" }, 400);

  const targetJurisdiction =
    typeof parsed.targetJurisdiction === "string" ? parsed.targetJurisdiction.trim().slice(0, MAX_JURISDICTION) : "";
  if (!targetJurisdiction) return json({ ok: false, error: "missing targetJurisdiction" }, 400);

  // Authenticity REQUIRES a pinned key. Default to the ar-agents published key so
  // "accept an ar-agents-issued bundle" works out of the box; a caller may pin a
  // different issuer. NEVER fall through to unpinned — that would accept on mere
  // self-consistency (an attacker can re-sign a tampered bundle with their own key).
  const pinnedPublicKey =
    (typeof parsed.pinnedPublicKey === "string" && parsed.pinnedPublicKey.trim()) ||
    process.env.AUDIT_ED25519_PUBLIC_KEY?.trim() ||
    "";
  if (!pinnedPublicKey) {
    return json(
      {
        ok: false,
        error: "pinnedPublicKey_required",
        note: "supply pinnedPublicKey (the issuer's SPKI), or configure the ar-agents key on this deployment",
      },
      400,
    );
  }

  const acceptance = await buildAcceptance(bundle, { pinnedPublicKey, targetJurisdiction });
  return json(acceptance, 200);
}
