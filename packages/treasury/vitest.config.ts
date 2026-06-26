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
      // tools.ts is the AI SDK wrapper layer (descriptions + zod schemas, thin
      // logic), excluded like the sibling packages; index/afip/adapters are gated.
      exclude: ["src/index.ts", "src/tools.ts"],
      thresholds: {
        statements: 85,
        branches: 60,
        functions: 85,
        lines: 85,
      },
    },
  },
});
