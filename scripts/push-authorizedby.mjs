#!/usr/bin/env node
/**
 * Push-down del binding bidireccional Art. 9: inyecta `authorizedBy` en el
 * tools.manifest.json de cada paquete, desde AUTHORIZED-BY.json (fuente de verdad).
 * Así cada paquete @ar-agents queda AUTO-DESCRIPTIVO: quien lo instala lee, del
 * manifiesto solo, qué artículo/norma/riel de la República Autónoma lo autoriza, y
 * la URL para verificarlo. Preserva los demás campos del manifiesto.
 *
 * Usage: node scripts/push-authorizedby.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authz = JSON.parse(readFileSync(join(root, "AUTHORIZED-BY.json"), "utf8"));
const republic = authz.republic;
const verify = "https://ar-panel-one.vercel.app/verify";

let injected = 0;
const noManifest = [];
for (const [pkg, entry] of Object.entries(authz.packages)) {
  const dir = pkg.replace(/^@ar-agents\//, "");
  const manifestPath = join(root, "packages", dir, "tools.manifest.json");
  if (!existsSync(manifestPath)) {
    noManifest.push(pkg);
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.authorizedBy = {
    republic,
    verify,
    rail: entry.rail,
    articles: entry.articles,
    normas: entry.normas,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  injected++;
}

console.log(`✓ authorizedBy inyectado en ${injected} manifiestos`);
if (noManifest.length) console.log(`  sin tools.manifest.json (${noManifest.length}): ${noManifest.join(", ")}`);
