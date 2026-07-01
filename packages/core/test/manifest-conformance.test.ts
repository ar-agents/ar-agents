import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyTool, requiresApproval } from "../src/risk-manifest";

// Conformance: the central risk manifest must SUBSUME every package author's own
// judgment. Each package ships a tools.manifest.json where the author flags the
// dangerous tools with `requiresConfirmation: true`. If the central classifier
// would auto-run any of those (read/create, no approval), a caller on ANY
// transport could move money, file taxes, or sign a credit instrument without a
// human — the exact failure the central manifest exists to prevent.
//
// This reads the REAL inventory off disk and locks the invariant against it, so
// adding a flagged tool whose name the classifier doesn't recognize fails CI
// until the classifier is taught about it. The classifier classifies by NAME
// (the manifests carry almost no sideEffect metadata), which is also the
// worst-case real path: a third-party tool we only know by name.

const PACKAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface ManifestTool {
  name: string;
  description?: string;
  requiresConfirmation?: boolean;
}

function loadManifestTools(): { pkg: string; tool: ManifestTool }[] {
  const out: { pkg: string; tool: ManifestTool }[] = [];
  for (const entry of readdirSync(PACKAGES_DIR)) {
    const manifestPath = join(PACKAGES_DIR, entry, "tools.manifest.json");
    if (!existsSync(manifestPath)) continue;
    let parsed: { tools?: ManifestTool[] };
    try {
      parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as { tools?: ManifestTool[] };
    } catch {
      continue;
    }
    for (const tool of parsed.tools ?? []) {
      if (tool?.name) out.push({ pkg: entry, tool });
    }
  }
  return out;
}

describe("central classifier conformance vs package manifests", () => {
  const all = loadManifestTools();
  const mustConfirm = all.filter(({ tool }) => tool.requiresConfirmation === true);

  it("reads the real tool inventory off disk", () => {
    // ~243 tools across ~34 manifests at time of writing; guard a sane floor so
    // a glob that silently finds nothing can't make the invariants vacuous.
    expect(all.length).toBeGreaterThan(150);
    expect(mustConfirm.length).toBeGreaterThan(0);
  });

  it("never auto-runs a tool a package flagged requiresConfirmation:true", () => {
    const leaks = mustConfirm
      .filter(({ tool }) => !requiresApproval({ name: tool.name, description: tool.description }))
      .map(({ pkg, tool }) => `${pkg}/${tool.name}`);
    expect(
      leaks,
      `central manifest would AUTO-RUN these author-flagged tools (must gate):\n${leaks.join("\n")}`,
    ).toEqual([]);
  });

  it("recognizes every flagged tool by category (not just fail-closed 'unknown')", () => {
    const unrecognized = mustConfirm
      .filter(
        ({ tool }) => classifyTool({ name: tool.name, description: tool.description }) === "unknown",
      )
      .map(({ pkg, tool }) => `${pkg}/${tool.name}`);
    expect(
      unrecognized,
      `these flagged tools gate only via fail-closed; teach the classifier their category:\n${unrecognized.join("\n")}`,
    ).toEqual([]);
  });
});
