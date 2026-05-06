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
      // tools.ts and types.ts are excluded for the same reason as the
      // sibling packages: tools.ts is the AI SDK tool wrapper layer
      // (descriptions + zod schemas, no logic), types.ts is type-only.
      // Adapters for third-party providers (Auth0, Magic.link, custom)
      // are integration-tested manually against provider sandboxes.
      exclude: [
        "src/index.ts",
        "src/tools.ts",
        "src/types.ts",
        "src/webhook.ts",
        "src/adapters/auth0.ts",
        "src/adapters/email-magic-link.ts",
        "src/adapters/magic-link-sdk.ts",
        "src/adapters/mercadopago-identity.ts",
        "src/adapters/whatsapp-otp.ts",
      ],
      thresholds: {
        statements: 85,
        branches: 70,
        functions: 80,
        lines: 85,
      },
    },
  },
});
