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
      // OCA + Correo adapters are stubs that throw NotSupported for most ops
      // (the real APIs require corporate credentials we don't have in CI).
      // Excluded from coverage thresholds; the algorithm-only paths
      // (provincias.ts, tools.ts, adapter.ts MockShippingAdapter) ARE tested.
      exclude: [
        "src/index.ts",
        "src/adapter-oca.ts",
        "src/adapter-correo.ts",
        "src/types.ts",
        "src/cli.ts",
        "src/cli-doctor.ts",
        "src/http.ts",
      ],
      // Coverage thresholds tuned for the tested scope (provincias, mock
      // adapter, tools, andreani structural). The carrier adapters that
      // require real corporate API credentials are excluded above.
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
