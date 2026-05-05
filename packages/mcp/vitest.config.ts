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
      exclude: ["src/index.ts"],
      thresholds: {
        // Branch threshold relaxed to 70% — defensive try/catches and PEM
        // normalizer branches (normalizePem, signTra wraps) handle real-world
        // serverless edge cases that are hard to repro in unit tests but
        // were validated end-to-end against AFIP prod.
        statements: 85,
        branches: 70,
        functions: 90,
        lines: 85,
      },
    },
  },
});
