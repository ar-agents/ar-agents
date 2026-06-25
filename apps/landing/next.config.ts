import type { NextConfig } from "next";
import path from "node:path";
// BotID: sets up same-origin proxy rewrites so the bot challenge can't be
// blocked by ad-blockers/CSP (everything stays first-party — the strict CSP's
// 'self' covers it). Only /api/demo (browser live-chat) is protected; the public
// API/MCP routes are intentionally machine-callable and must NOT be gated here.
import { withBotId } from "botid/next/config";

// Static-CSP approach (no nonces), fine here because the landing renders
// only Next.js framework scripts + Tailwind inline styles, no third-party.
// `next/font/google` self-hosts the fonts at build, so font-src 'self' is
// sufficient. If you ever add Vercel Analytics, add `vitals.vercel-insights.com`
// to connect-src.
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is required for Next.js hydration scripts. Switching to
  // nonces would force every page to render dynamically (no static export).
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Narrow exception for published PDF artifacts so /implementacion (and any
// future doc page) can render its own PDF inline via <iframe>. Same-origin
// only — third-party sites still can't frame our PDFs. The rest of the
// policy stays strict.
const cspPdf = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Modern browsers ignore X-XSS-Protection or use buggy heuristics; explicit
  // 0 disables them. CSP is the actual XSS defense.
  { key: "X-XSS-Protection", value: "0" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // PDF carve-out: relax frame-ancestors / X-Frame-Options to SAMEORIGIN
      // so the /implementacion page can render its own published PDF inline
      // in an <iframe>. Latter rules override the earlier matching headers.
      // No third-party can frame the PDF (CSP frame-ancestors 'self' still
      // blocks cross-origin).
      {
        source: "/:path*.pdf",
        headers: [
          { key: "Content-Security-Policy", value: cspPdf },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      // Long-cache the immutable demo media in public/video. Vercel serves
      // public/ assets with a short default cache, so without this the 12 MB
      // demo video (plus its poster + subtitles) is re-downloaded on repeat
      // visits and billed as Fast Data Transfer. These files are versioned by
      // name; if the demo ever changes, ship it under a new filename.
      {
        source: "/video/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Agent discovery: advertise the machine-readable surfaces to any
      // agent that inspects response headers (emerging agent-ready pattern).
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value:
              '<https://ar-agents.ar/llms.txt>; rel="llms-txt", <https://ar-agents.ar/.well-known/agents.json>; rel="agent-manifest", <https://ar-agents.ar/.well-known/mcp/server-card.json>; rel="mcp-server"',
          },
        ],
      },
    ];
  },
};

export default withBotId(nextConfig);
