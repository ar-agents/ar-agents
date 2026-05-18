import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/ai-sdk.ts"],
  external: ["jose", "zod"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  minify: false,
});
