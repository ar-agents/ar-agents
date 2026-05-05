import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin Turbopack root to the monorepo so it finds hoisted node_modules
  // and avoids the "multiple lockfiles" warning.
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
