/**
 * `GET /api/identity/badge/[id]`, the shareable "verified agent" badge.
 *
 * A shields.io-style SVG an agent embeds anywhere it presents itself (README,
 * site footer, marketplace profile). Green "verified" when the id resolves to a
 * verified record, gray "unverified" otherwise. Reuses @/lib/badge exactly like
 * /api/constancia/badge and /api/badge.
 *
 * ── k-factor instrument ──────────────────────────────────────────────────────
 * On every hit we log the Referer host to KV (agent:k:referer): which external
 * domains carry the badge out into the world. That propagation is the entire
 * point of the land-grab. Logging degrades to a no-op without KV and NEVER
 * throws on the image path (a broken metric must not break the render).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { type BadgeState, buildSvg } from "@/lib/badge";
import {
  extractAttribution,
  getAgentRecord,
  isValidAgentId,
  recordAgentEvent,
} from "@/lib/agent-registry";

export const runtime = "nodejs";

function svg(state: BadgeState): Response {
  return new Response(buildSvg(state), {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Short cache: a freshly-verified agent should flip to green quickly.
      "cache-control":
        "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const norm = id.toLowerCase();

  // Record the embedding domain (best-effort; never break the image).
  try {
    await recordAgentEvent(
      "badge",
      norm,
      extractAttribution(req),
      new Date().toISOString(),
    );
  } catch {
    // never let instrumentation break the badge render
  }

  if (!isValidAgentId(norm)) {
    return svg({ label: "agent", message: "invalid id", color: "#999999" });
  }
  const record = await getAgentRecord(norm);
  if (record) {
    return svg({ label: "agent", message: "verified", color: "#10b981" });
  }
  return svg({ label: "agent", message: "unverified", color: "#999999" });
}
