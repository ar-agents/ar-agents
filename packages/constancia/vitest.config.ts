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
      // Exclude entry barrel, LLM-tool definitions (integration-test
      // territory, not unit-test), and type-only files with no runtime code.
      exclude: ["src/index.ts", "src/tools.ts", "src/types.ts"],
      thresholds: {
        statements: 65,
        branches: 70,
        functions: 85,
        lines: 65,
      },
    },
  },
});
