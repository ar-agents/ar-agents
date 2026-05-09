/**
 * `GET /api/badge/[sessionId]` — shields.io-style verification badge.
 *
 * Returns a 24px SVG that an operator can embed in a README, status page,
 * or anywhere a forensic-clean claim is being asserted. The badge color +
 * label updates live based on the audit log's verification state:
 *
 *   `verified · 5/5`  — clean (blue)
 *   `tampered · 1`    — at least one entry tamper-detected (red)
 *   `no-hmac`         — AUDIT_HMAC_SECRET not configured (gray)
 *   `no entries`      — session id valid but log is empty (gray)
 *
 * Why this matters: the badge propagates the forensic claim virally. An
 * AR sociedad-IA operator embeds it on their landing page, and any visitor
 * sees an independently-recomputable verification status without having
 * to know what an HMAC is.
 *
 * Usage:
 *
 *   ![ar-agents audit](https://ar-agents.vercel.app/api/badge/{sessionId})
 *
 * Cache-control: 60s. The audit log is append-only with HMAC, so a small
 * staleness window doesn't change the meaningful state.
 */

import { isSessionIdValid, verifySession } from "@/lib/audit";

export const runtime = "nodejs";

interface BadgeState {
  label: string;
  message: string;
  color: string; // SVG color
}

function stateFor(v: {
  total: number;
  verified: number;
  tampered: number;
  hmacWired: boolean;
}): BadgeState {
  if (!v.hmacWired) {
    return { label: "audit", message: "no-hmac", color: "#666666" };
  }
  if (v.tampered > 0) {
    return {
      label: "audit",
      message: `tampered · ${v.tampered}`,
      color: "#ff5b4f",
    };
  }
  if (v.total === 0) {
    return { label: "audit", message: "no entries", color: "#999999" };
  }
  return {
    label: "audit",
    message: `verified · ${v.verified}/${v.total}`,
    color: "#0a72ef",
  };
}

// Approximate text width estimator for Geist-like sans (60 char-em ratio).
function textWidth(s: string, sizePx = 11): number {
  // A reasonable ratio for proportional fonts at these sizes.
  return Math.ceil(s.length * sizePx * 0.6);
}

function buildSvg({ label, message, color }: BadgeState): string {
  const padX = 6;
  const fontSize = 11;
  const labelW = textWidth(label, fontSize) + padX * 2;
  const msgW = textWidth(message, fontSize) + padX * 2;
  const totalW = labelW + msgW;
  const height = 20;

  // shields.io-style two-tone: dark left half (label), colored right half (status).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${height}" role="img" aria-label="${escapeXml(`${label}: ${message}`)}">
  <title>${escapeXml(`${label}: ${message}`)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="${height}" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="${height}" fill="#171717"/>
    <rect x="${labelW}" width="${msgW}" height="${height}" fill="${color}"/>
    <rect width="${totalW}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="${fontSize}">
    <text aria-hidden="true" x="${labelW / 2}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(label)}</text>
    <text x="${labelW / 2}" y="14">${escapeXml(label)}</text>
    <text aria-hidden="true" x="${labelW + msgW / 2}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(message)}</text>
    <text x="${labelW + msgW / 2}" y="14">${escapeXml(message)}</text>
  </g>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
