/**
 * Pure helpers for the /api/badge/[sessionId] SVG endpoint. Extracted
 * so they're unit-testable without spinning up the route handler.
 */

export interface BadgeState {
  label: string;
  message: string;
  color: string;
}

export interface VerificationStats {
  total: number;
  verified: number;
  tampered: number;
  hmacWired: boolean;
}

export function stateFor(v: VerificationStats): BadgeState {
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

/** Approximate text width estimator for proportional sans at the badge's font size. */
export function textWidth(s: string, sizePx = 11): number {
  return Math.ceil(s.length * sizePx * 0.6);
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildSvg({ label, message, color }: BadgeState): string {
  const padX = 6;
  const fontSize = 11;
  const labelW = textWidth(label, fontSize) + padX * 2;
  const msgW = textWidth(message, fontSize) + padX * 2;
  const totalW = labelW + msgW;
  const height = 20;

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
