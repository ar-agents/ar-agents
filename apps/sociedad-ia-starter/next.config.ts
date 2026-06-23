import type { NextConfig } from "next";
import path from "node:path";

const csp = [
  "default-src 'self'",
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
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  transpilePackages: [
    "@ar-agents/banking",
    "@ar-agents/boletin-oficial",
    "@ar-agents/facturacion",
    "@ar-agents/gde-tad",
    "@ar-agents/identity",
    "@ar-agents/igj",
    "@ar-agents/mercadopago",
    "@ar-agents/whatsapp",
  ],
  // The agent reads its prompt from agent/instructions.md + agent/skills/*.md
  // at runtime (see src/lib/agent.ts). Ship those files into every function
  // that builds the agent; globs resolve from this app's root.
  outputFileTracingIncludes: {
    "/api/agent": ["./agent/**/*"],
    "/api/cron/morning": ["./agent/**/*"],
  },
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
