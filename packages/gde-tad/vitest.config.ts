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
      exclude: ["src/index.ts", "src/testing.ts"],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 75,
        lines: 70,
      },
    },
  },
});
