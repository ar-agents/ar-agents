#!/usr/bin/env node
/**
 * Regenerate `tools.manifest.json` for every package by parsing the package's
 * `src/tools.ts` (or `src/ai-sdk.ts` for packages that expose their tools as
 * an AI SDK wrapper, e.g. mercadolibre and ap2) for tool names and pulling
 * descriptions from the `DEFAULT_DESCRIPTIONS` constant when present.
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
  // Packages without src/tools.ts may define their tool set in src/ai-sdk.ts
  // (mercadolibre, ap2). Same `name: tool({...})` + DEFAULT_DESCRIPTIONS shape.
  const toolsPath = [join(pkgDir, "src", "tools.ts"), join(pkgDir, "src", "ai-sdk.ts")]
    .find((p) => existsSync(p));
  const manifestPath = join(pkgDir, "tools.manifest.json");

  if (!existsSync(manifestPath)) {
    console.log(`  ${pkg}: NO manifest — skipping`);
    skipped++;
    continue;
  }
  if (!toolsPath) {
    console.log(`  ${pkg}: NO src/tools.ts or src/ai-sdk.ts — skipping`);
    skipped++;
    continue;
  }

  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  const toolsSrc = readFileSync(toolsPath, "utf-8");
  const oldManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  // Extract tool names and their positions: lines like `    name_here: tool({`
  const toolNameRe = /^\s+([a-z_][a-z0-9_]*): tool\(/gm;
  const toolNames = new Set();
  const toolStarts = [];
  let match;
  while ((match = toolNameRe.exec(toolsSrc)) !== null) {
    if (!toolNames.has(match[1])) toolStarts.push({ name: match[1], index: match.index });
    toolNames.add(match[1]);
  }

  // Descriptions, in source-of-truth priority order:
  //   1. the string literal inside the tool's own `tool({ description: ... })`
  //   2. the DEFAULT_DESCRIPTIONS map, for packages that wire
  //      `description: desc("name")` — scoped to that map's block only
  // Matching `name: "..."` anywhere in the file is NOT safe: unrelated
  // tool-name-keyed maps (TREASURY_TOOL_SIDE_EFFECTS) shipped "irreversible"
  // as a manifest description.
  const parseStringExpr = (src, at) => {
    // Parse `"a" + 'b' + \`c\`` starting at `at`; returns null if no literal.
    let i = at;
    let out = "";
    let found = false;
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      const q = src[i];
      if (q !== '"' && q !== "'" && q !== "`") break;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") {
          const c = src[i + 1];
          out += c === "n" ? "\n" : c === "t" ? "\t" : c;
          i += 2;
        } else {
          out += src[i++];
        }
      }
      i++;
      found = true;
      let j = i;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] !== "+") break;
      i = j + 1;
    }
    return found ? out : null;
  };

  const defaultsMatch = toolsSrc.match(/DEFAULT_DESCRIPTIONS[^={]*=\s*\{([\s\S]*?)\n\};/);
  const defaultsBlock = defaultsMatch ? defaultsMatch[1] : "";

  const descriptions = {};
  for (let t = 0; t < toolStarts.length; t++) {
    const { name, index } = toolStarts[t];
    const end = t + 1 < toolStarts.length ? toolStarts[t + 1].index : toolsSrc.length;
    const block = toolsSrc.slice(index, end);
    // Only look for the tool's own description, before its schema — nested
    // schema fields can also carry a `description:` key.
    const schemaIdx = block.search(/\binputSchema\s*:|\bparameters\s*:/);
    const head = schemaIdx === -1 ? block : block.slice(0, schemaIdx);
    const descIdx = head.search(/\bdescription\s*:/);
    let value = null;
    if (descIdx !== -1) {
      value = parseStringExpr(head, descIdx + head.slice(descIdx).indexOf(":") + 1);
    }
    if (value === null && defaultsBlock) {
      // Indirection like `description: desc("name")` — resolve against the
      // DEFAULT_DESCRIPTIONS block only.
      const keyRe = new RegExp(`^\\s+${name}\\s*:`, "m");
      const keyMatch = defaultsBlock.match(keyRe);
      if (keyMatch) {
        value = parseStringExpr(defaultsBlock, keyMatch.index + keyMatch[0].length);
      }
    }
    if (value !== null) descriptions[name] = value.slice(0, 200);
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
