import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/ai-sdk.ts", "src/testing.ts"],
  external: ["zod", "ai"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  minify: false,
});
