import { defineConfig } from "tsup";

export default defineConfig({
  // WIP: only the schemas surface ships for now. /vercel-kv and /testing
  // entries get re-added when the runtime lands.
  entry: ["src/index.ts"],
  external: ["@vercel/kv", "@ar-agents/mercadopago", "@ar-agents/facturacion", "@ar-agents/identity", "ai", "zod"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  minify: false,
});
