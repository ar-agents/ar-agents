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
      // Registries are factory functions that compose tools from the
      // underlying packages. The factories themselves are thin glue —
      // the underlying tools are the meaningful test surface and are
      // covered in their own packages. Branch coverage in particular
      // is dominated by "is this adapter wired?" guards that get
      // integration-tested via the demo apps (mp-hello, cuit-hello,
      // whatsapp-hello), not synthesized into unit tests.
      exclude: ["src/index.ts"],
      thresholds: {
        statements: 55,
        branches: 45,
        functions: 90,
        lines: 55,
      },
    },
  },
});
