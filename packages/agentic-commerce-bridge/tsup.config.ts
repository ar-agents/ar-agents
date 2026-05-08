import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/vercel-kv.ts", "src/testing.ts"],
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
