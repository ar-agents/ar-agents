import { defineConfig } from "tsup";

export default defineConfig({
  // Subpath builds for Node-only adapters keep the main bundle Edge-safe.
  // Consumers importing from `@ar-agents/identity-attest` only pull
  // AttestationClient + WhatsApp OTP + Email Magic Link adapters (all
  // Web-Crypto based). Auth0 + Magic.link SDK adapters require explicit
  // subpath imports + Node runtime.
  entry: [
    "src/index.ts",
    "src/auth0.ts",
    "src/magic-link-sdk.ts",
    // Subpath: EVM secp256k1 + Ed25519 key-binding verifier. Isolated so the
    // secp256k1/keccak deps stay out of the main Edge bundle.
    "src/key-binding.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  minify: false,
});
