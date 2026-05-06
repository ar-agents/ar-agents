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

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const packages = ["identity", "identity-attest", "whatsapp", "mercadopago", "facturacion", "banking", "shipping"];

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
  const oldByName = new Map(oldTools.map((t) => [t.name, t]));

  const newTools = Array.from(toolNames).sort().map((name) => {
    const old = oldByName.get(name) ?? {};
    return {
      name,
      ...(descriptions[name] ? { description: descriptions[name] } : old.description ? { description: old.description } : {}),
      ...(old.input ? { input: old.input } : {}),
      ...(old.output ? { output: old.output } : {}),
      ...(old.idempotent !== undefined ? { idempotent: old.idempotent } : {}),
      ...(old.sideEffect ? { sideEffect: old.sideEffect } : {}),
    };
  });

  const newManifest = {
    ...oldManifest,
    name: pkgJson.name,
    version: pkgJson.version,
    tools: newTools,
    meta: {
      ...(oldManifest.meta ?? {}),
      generated_at: new Date().toISOString(),
      generated_by: "scripts/regen-manifests.mjs",
      tool_count: newTools.length,
    },
  };

  writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2) + "\n");
  console.log(`  ${pkg}: ${oldTools.length} → ${newTools.length} tools, v${oldManifest.version || "?"} → v${pkgJson.version}`);
  regenerated++;
}

console.log(`\nRegenerated ${regenerated} manifests, skipped ${skipped}.`);
console.log("Add this to your release flow: 'pnpm regen-manifests' before 'changeset publish'.");
