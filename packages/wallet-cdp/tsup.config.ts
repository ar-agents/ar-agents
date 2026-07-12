import { defineConfig } from "tsup";

export default defineConfig({
  // `.` = pure wallet/policy/guard core + the CDP client factory (no ai/zod).
  // `./tools` = the Vercel AI SDK tool wrapper (needs the ai + zod peers).
  entry: ["src/index.ts", "src/tools.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  minify: false,
});
