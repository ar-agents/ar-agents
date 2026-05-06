import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      // otel.ts and vercel-kv.ts are optional peer-dep adapters loaded via
      // subpath imports (`@ar-agents/mercadopago/otel`, `/vercel-kv`). They
      // require @opentelemetry/api or @vercel/kv to actually exercise; we
      // gate coverage on the always-loaded core surface instead.
      exclude: ["src/index.ts", "src/otel.ts", "src/vercel-kv.ts"],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 65,
        lines: 75,
      },
    },
  },
});
