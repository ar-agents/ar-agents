#!/usr/bin/env node
// Sync tools.manifest.json descriptions with src/tools.ts (or ai-sdk.ts).
// Only updates tool entries that already carry a description; preserves all
// other manifest fields. Truncates to 200 chars (existing convention).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = "/tmp/arb/packages";
const SKIP = new Set(["x402", "bind", "fecred"]);
const pkgs = (await import("node:fs")).readdirSync(root).filter((p) => !SKIP.has(p));

function extractDescriptions(src) {
  const map = {};
  // DEFAULT_DESCRIPTIONS entries: `  name:\n    "...",` or same-line
  const dd = src.match(/const DEFAULT_DESCRIPTIONS[^=]*= \{([\s\S]*?)\n\};/);
  if (dd) {
    const re = /^\s{2}([a-z_][a-z0-9_]*):\s*\n?\s*"((?:[^"\\]|\\.)*)"/gm;
    let m;
    while ((m = re.exec(dd[1]))) map[m[1]] = m[2].replace(/\\"/g, '"');
  }
  // Inline: `name: tool({ ... description: "..."` or backtick
  const re2 = /([a-z_][a-z0-9_]*): tool\(\{\s*\n\s*description:\s*\n?\s*("(?:[^"\\]|\\.)*"|`[^`]*`)/g;
  let m2;
  while ((m2 = re2.exec(src))) {
    if (map[m2[1]]) continue; // first wins (unscoped before scoped)
    let d = m2[2].slice(1, -1);
    d = d.replace(/\\"/g, '"').replace(/\s*\n\s*/g, " ").trim();
    map[m2[1]] = d;
  }
  return map;
}

for (const pkg of pkgs) {
  const manifestPath = join(root, pkg, "tools.manifest.json");
  if (!existsSync(manifestPath)) continue;
  const srcPath = ["src/tools.ts", "src/ai-sdk.ts"]
    .map((p) => join(root, pkg, p))
    .find(existsSync);
  if (!srcPath) continue;
  const descs = extractDescriptions(readFileSync(srcPath, "utf8"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.tools)) continue;
  let changed = 0;
  for (const t of manifest.tools) {
    if (!t.description) continue;
    const d = descs[t.name];
    if (d && t.description !== d.slice(0, 200)) {
      t.description = d.slice(0, 200);
      changed++;
    }
  }
  if (changed) {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`${pkg}: ${changed} descriptions synced`);
  }
}
