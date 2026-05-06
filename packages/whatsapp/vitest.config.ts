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
      // tools.ts and types.ts excluded — tools.ts is the AI SDK tool wrapper
      // layer (descriptions + zod schemas, no logic), types.ts is type-only.
      // The actual business logic (client.ts, phone.ts, webhook.ts, errors.ts)
      // is the meaningful surface to gate coverage on.
      exclude: ["src/index.ts", "src/tools.ts", "src/types.ts"],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 80,
        lines: 70,
      },
    },
  },
});
