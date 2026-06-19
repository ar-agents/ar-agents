import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyTool, levelRequiresApproval } from "@ar-agents/core";

// The public MCP surface at /api/mcp is deliberately read-only: pure algorithms
// and public read-only upstreams (BCRA), nothing that moves money, files taxes,
// or constitutes a company. This test LOCKS that invariant against the central
// risk manifest: if anyone ever registers an approval-level tool on the public
// route, CI fails. Defense in depth on top of the route's deliberate scoping,
// and a regression guard so the public surface can never silently leak a
// money/fiscal/legal/irreversible tool to an unauthenticated caller.

const ROUTE = join(import.meta.dirname, "..", "src", "app", "api", "[transport]", "route.ts");

function publicToolNames(): string[] {
  const src = readFileSync(ROUTE, "utf8");
  // server.registerTool(\n  "tool_name", { ... }, handler)
  return [...src.matchAll(/registerTool\(\s*["']([a-z0-9_]+)["']/gi)].map((m) => m[1]);
}

describe("public MCP surface stays read-only", () => {
  const names = publicToolNames();

  it("finds the registered public tools", () => {
    expect(names).toContain("validate_cuit");
    expect(names.length).toBeGreaterThanOrEqual(5);
  });

  it("exposes NO approval-level (money/fiscal/legal/irreversible/unknown) tool", () => {
    const gated = names.filter((n) => levelRequiresApproval(classifyTool({ name: n })));
    expect(
      gated,
      `public MCP must stay read-only; these tools classify as approval-level: ${gated.join(", ")}`,
    ).toEqual([]);
  });
});
