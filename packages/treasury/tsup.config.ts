import { defineConfig } from "tsup";

export default defineConfig({
  // `.` = pure core + Manteca/Ripio adapters + AFIP fiscal logic (no ai/zod).
  // `./tools` = the Vercel AI SDK tool wrappers (needs the ai + zod peers).
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
