import type { NextConfig } from "next";
import path from "node:path";

// Static-CSP approach (no nonces) — fine here because the landing renders
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
  transpilePackages: ["@ar-agents/mercadolibre"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
