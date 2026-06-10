/**
 * GET /api/cert-badge?url={baseUrl}
 *
 * Returns a shields.io-style SVG badge showing the live RFC-002 + RFC-004
 * conformance score for the target URL. Pull the score from
 * /api/certifier?url=... and render:
 *
 *   `RFC-002 · A · 100/100`   , score >= 90, green
 *   `RFC-002 · B · 78/100`    , score 75-89, lime
 *   `RFC-002 · C · 65/100`    , score 60-74, yellow
 *   `RFC-002 · D · 42/100`    , score 40-59, orange
 *   `RFC-002 · F · 25/100`    , score < 40, red
 *   `RFC-002 · error`         , fetch failed, gray
 *
 * Designed for embedding in READMEs of operators who want to show off
 * their conformance. The badge auto-refreshes (60s GitHub camo cache).
 *
 * Edge runtime. Cached briefly. Honest about errors.
 */

import { buildSvg, type BadgeState, escapeXml } from "@/lib/badge";
import { safeExternalUrl } from "@/lib/ssrf";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "edge";

const SITE = "https://ar-agents.ar";

function svgResponse(state: BadgeState, status = 200): Response {
  return new Response(buildSvg(state), {
    status,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

function colorForScore(score: number): string {
  if (score >= 90) return "#22c55e"; // A, green
  if (score >= 75) return "#84cc16"; // B, lime
  if (score >= 60) return "#eab308"; // C, yellow
  if (score >= 40) return "#f97316"; // D, orange
  return "#ef4444";                   // F, red
}

function ratingFor(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

export async function GET(req: Request) {
  if (!rateLimit("cert-badge", clientIp(req), 30, 60_000)) {
    return svgResponse({ label: "RFC-002", message: "rate limited", color: "#666666" }, 429);
  }

  const { searchParams } = new URL(req.url);
  const url = (searchParams.get("url") || "").trim();
  const sessionId = (searchParams.get("sessionId") || "").trim() || null;

  if (!url) {
    return svgResponse(
      { label: "RFC-002", message: "url required", color: "#666666" },
      400,
    );
  }

  // SSRF guard before we make the server-side certifier call.
  if (!safeExternalUrl(url)) {
    return svgResponse(
      { label: "RFC-002", message: "bad url", color: "#666666" },
      400,
    );
  }

  // Call our own certifier (in-cluster, sub-second).
  const certUrl = new URL(`${SITE}/api/certifier`);
  certUrl.searchParams.set("url", url);
  if (sessionId) certUrl.searchParams.set("sessionId", sessionId);

  try {
    const r = await fetch(certUrl.toString(), {
      // 9-second budget on the certifier itself; we're a Vercel function
      // and Edge timeouts can be aggressive.
      signal: AbortSignal.timeout(9500),
    });
    if (!r.ok) {
      return svgResponse({
        label: "RFC-002",
        message: `error ${r.status}`,
        color: "#666666",
      });
    }
    const data = (await r.json()) as { score?: number; rating?: string };
    const score = typeof data.score === "number" ? data.score : 0;
    const rating = data.rating ?? ratingFor(score);
    return svgResponse({
      label: "RFC-002+004",
      message: `${rating} · ${score}/100`,
      color: colorForScore(score),
    });
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "timeout" : "fetch error";
    // Use escapeXml for safety though message is fixed.
    return svgResponse({
      label: "RFC-002",
      message: escapeXml(msg),
      color: "#666666",
    });
  }
}
