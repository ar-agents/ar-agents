#!/usr/bin/env node
/**
 * Regenerate `tools.manifest.json` for every package by parsing the package's
 * `src/tools.ts` for tool names and pulling descriptions from the
 * `DEFAULT_DESCRIPTIONS` constant when present.
 *
 * Usage: `node scripts/regen-manifests.mjs`
 *
 * Pre-existing manifests' `meta` and any other top-level fields are preserved;
 * only `version` and `tools` are regenerated. Run after every release.
 *
 * The /review audit (commit 6e3a0dd) flagged stale manifests as a CRITICAL
 * api-contract issue — consumers reading the published manifest as source of
 * truth got a 3-version-stale view. This script closes that gap.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Every package that ships a tools.manifest.json is in scope. A hardcoded
// list here once covered only 8 of them, which let the other manifests (and
// the check-manifests CI gate over them) drift silently.
const packages = readdirSync(join(root, "packages"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(root, "packages", d.name, "tools.manifest.json")))
  .map((d) => d.name)
  .sort();

let regenerated = 0;
let skipped = 0;

for (const pkg of packages) {
  const pkgDir = join(root, "packages", pkg);
  const pkgJsonPath = join(pkgDir, "package.json");
  const toolsPath = join(pkgDir, "src", "tools.ts");
  const manifestPath = join(pkgDir, "tools.manifest.json");

  if (!existsSync(manifestPath)) {
    console.log(`  ${pkg}: NO manifest — skipping`);
    skipped++;
    continue;
  }
  if (!existsSync(toolsPath)) {
    console.log(`  ${pkg}: NO src/tools.ts — skipping`);
    skipped++;
    continue;
  }

  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  const toolsSrc = readFileSync(toolsPath, "utf-8");
  const oldManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  // Extract unique tool names: lines like `    name_here: tool({`
  const toolNameRe = /^\s+([a-z_][a-z0-9_]*): tool\(/gm;
  const toolNames = new Set();
  let match;
  while ((match = toolNameRe.exec(toolsSrc)) !== null) {
    toolNames.add(match[1]);
  }

  // Pull descriptions from DEFAULT_DESCRIPTIONS if present.
  // Matches `  tool_name: "...",` or with backticks for multi-line.
  const descriptions = {};
  for (const name of toolNames) {
    // Try: `name: "..."` or `name: \`...\``
    const reStr = new RegExp(`^\\s+${name}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m");
    const reBacktick = new RegExp("^\\s+" + name + ":\\s*`([^`]*)`", "m");
    const m1 = toolsSrc.match(reStr);
    const m2 = toolsSrc.match(reBacktick);
    if (m1) descriptions[name] = m1[1].slice(0, 200);
    else if (m2) descriptions[name] = m2[1].slice(0, 200);
  }

  // Build new tools array. Preserve any per-tool metadata that already existed.
  const oldTools = Array.isArray(oldManifest.tools) ? oldManifest.tools : [];

  // A package whose src/tools.ts the regex parser cannot read at all would
  // otherwise get its manifest clobbered down to zero tools. Skip it loudly.
  if (toolNames.size === 0 && oldTools.length > 0) {
    console.log(`  ${pkg}: parser found 0 tools but manifest has ${oldTools.length} - skipping (check src/tools.ts shape)`);
    skipped++;
    continue;
  }
  const oldByName = new Map(oldTools.map((t) => [t.name, t]));

  // Preserve every field a tool entry already carried (sideEffects,
  // requiresConfirmation, input, output, idempotent, ...) and only refresh
  // the description from source. An earlier version enumerated fields to
  // keep and silently dropped the rest.
  const newTools = Array.from(toolNames).sort().map((name) => {
    const old = oldByName.get(name) ?? {};
    const entry = { ...old, name };
    if (descriptions[name]) entry.description = descriptions[name];
    return entry;
  });

  const newManifest = {
    ...oldManifest,
    name: pkgJson.name,
    version: pkgJson.version,
    tools: newTools,
    meta: (() => {
      // Strip wall-clock timestamps from prior meta so the CI drift check
      // doesn't false-positive on every run. Anything else in meta is kept.
      const { generated_at: _ignoredGenAt, ...prior } = oldManifest.meta ?? {};
      return {
        ...prior,
        generated_by: "scripts/regen-manifests.mjs",
        tool_count: newTools.length,
      };
    })(),
  };

  writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2) + "\n");
  console.log(`  ${pkg}: ${oldTools.length} → ${newTools.length} tools, v${oldManifest.version || "?"} → v${pkgJson.version}`);
  regenerated++;
}

console.log(`\nRegenerated ${regenerated} manifests, skipped ${skipped}.`);
console.log("Add this to your release flow: 'pnpm regen-manifests' before 'changeset publish'.");
