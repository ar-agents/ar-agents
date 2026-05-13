/**
 * `GET /api/badge/[sessionId]`, shields.io-style verification badge.
 *
 * Returns a 24px SVG that an operator can embed in a README, status page,
 * or anywhere a forensic-clean claim is being asserted. The badge color +
 * label updates live based on the audit log's verification state:
 *
 *   `verified · 5/5`, clean (blue)
 *   `tampered · 1`  , at least one entry tamper-detected (red)
 *   `no-hmac`       , AUDIT_HMAC_SECRET not configured (gray)
 *   `no entries`    , session id valid but log is empty (gray)
 *
 * Why this matters: the badge propagates the forensic claim virally. An
 * AR sociedad-IA operator embeds it on their landing page, and any visitor
 * sees an independently-recomputable verification status without having
 * to know what an HMAC is.
 *
 * Usage:
 *
 *   ![ar-agents audit](https://ar-agents.ar/api/badge/{sessionId})
 *
 * Cache-control: 60s. The audit log is append-only with HMAC, so a small
 * staleness window doesn't change the meaningful state.
 */

import { isSessionIdValid, verifySession } from "@/lib/audit";
import { type BadgeState, buildSvg, stateFor } from "@/lib/badge";

export const runtime = "nodejs";

function svgResponse(state: BadgeState, status = 200): Response {
  const svg = buildSvg(state);
  return new Response(svg, {
    status,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // 60s cache covers the typical embed scenario without staleness pain.
      // GitHub's camo proxy will hit this every ~60s anyway.
      "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;
  if (!isSessionIdValid(sessionId)) {
    return svgResponse(
      { label: "audit", message: "invalid id", color: "#999999" },
      400,
    );
  }
  let stats: {
    total: number;
    verified: number;
    tampered: number;
    hmacWired: boolean;
  };
  try {
    stats = await verifySession(sessionId);
  } catch {
    return svgResponse(
      { label: "audit", message: "error", color: "#ff5b4f" },
      500,
    );
  }
  return svgResponse(stateFor(stats));
}
