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
      exclude: ["src/index.ts", "src/tools.ts", "src/types.ts", "src/cli.ts", "src/cli-doctor.ts", "src/testing.ts"],
      thresholds: {
        // v0.1 thresholds — relaxed because the WSFE client's getter glue and
        // some validator early-return branches are hit by integration paths,
        // not unit tests. Critical paths (XML build, XML parse, validation
        // rules, catalog lookups) are at 80%+.
        statements: 75,
        branches: 60,
        functions: 55,
        lines: 75,
      },
    },
  },
});
