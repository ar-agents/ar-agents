import { defineConfig } from "tsup";

export default defineConfig({
  // Subpath builds for Node-only adapters keep the main bundle Edge-safe.
  // Consumers importing from `@ar-agents/identity-attest` only pull
  // AttestationClient + WhatsApp OTP + Email Magic Link adapters (all
  // Web-Crypto based). Auth0 + Magic.link SDK adapters require explicit
  // subpath imports + Node runtime.
  entry: ["src/index.ts", "src/auth0.ts", "src/magic-link-sdk.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  minify: false,
});
