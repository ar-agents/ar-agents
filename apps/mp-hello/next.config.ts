import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin Turbopack workspace root to the monorepo root so it finds
  // hoisted node_modules and avoids the "multiple lockfiles" warning.
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  // Allow Next to compile workspace packages from source.
  transpilePackages: ["@ar-agents/mercadopago"],
};

export default nextConfig;
