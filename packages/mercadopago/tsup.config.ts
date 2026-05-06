import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/vercel-kv.ts"],
  external: ["@vercel/kv"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  minify: false,
});
