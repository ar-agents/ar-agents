import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The llm-gateway is the SINGLE boundary for runtime LLM calls. This locks every
 * runtime call site to it: no direct generateObject/streamText from "ai", no
 * hardcoded gateway model literal (model must come from gatewayModel()), and the
 * gateway must be imported. A future edit that bypasses the boundary fails here.
 */

const ROOT = join(import.meta.dirname, "..");
function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8");
}

const RUNTIME_CALL_SITES = [
  "src/lib/prompt-to-society.ts",
  "src/app/api/demo/route.ts",
  "src/app/api/play/route.ts",
];

describe("llm-gateway single-boundary invariant", () => {
  for (const f of RUNTIME_CALL_SITES) {
    it(`${f} routes through the gateway (no direct SDK generation, no hardcoded model)`, () => {
      const src = read(f);
      // No generateObject/streamText pulled directly from "ai". Scan EVERY ai
      // import line (matchAll + /g), so a split second import cannot slip past.
      const aiImports = [...src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']ai["']/g)];
      for (const m of aiImports) {
        expect(m[1], `${f} must not import generateObject from "ai"`).not.toMatch(/\bgenerateObject\b/);
        expect(m[1], `${f} must not import streamText from "ai"`).not.toMatch(/\bstreamText\b/);
      }
      // And no namespace import (import * as ai from "ai") that could reach ai.streamText.
      expect(src, `${f} must not namespace-import "ai"`).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s*["']ai["']/);
      // No hardcoded gateway model literal — it must resolve via gatewayModel().
      expect(src, `${f} must not hardcode the gateway model literal`).not.toMatch(/anthropic\/claude-sonnet-4-6/);
      // Routes through the gateway module.
      expect(src, `${f} must import the llm-gateway`).toMatch(/llm-gateway/);
    });
  }

  it("the gateway itself is the ONLY module that imports generation from \"ai\"", () => {
    const gw = read("src/lib/llm-gateway.ts");
    expect(gw).toMatch(/from ["']ai["']/);
    expect(gw).toMatch(/gatewayModel/);
  });
});
