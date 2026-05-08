import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      // vercel-kv.ts is an optional peer-dep adapter loaded via subpath import
      // (`@ar-agents/agentic-commerce-bridge/vercel-kv`). It requires @vercel/kv
      // to actually exercise; we gate coverage on the always-loaded core surface.
      exclude: ["src/index.ts", "src/vercel-kv.ts", "src/testing.ts"],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 65,
        lines: 75,
      },
    },
  },
});
