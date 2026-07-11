#!/usr/bin/env node
// CLI entry for `ar-agents` (login / whoami against the ar-agents studio).
//
// Usage:
//   npx @ar-agents/cli login
//   npx @ar-agents/cli whoami
//
// Dynamic-imports the built package (see packages/mcp/bin/ar-agents-mcp.js
// for the same pattern) so this file itself stays plain, dependency-free
// Node and can run before any bundler touches it.

const os = await import("node:os");
const fs = await import("node:fs/promises");
const url = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(await fs.readFile(url, "utf-8"));

const { run } = await import("../dist/index.js");

run(process.argv.slice(2), {
  env: process.env,
  fetchImpl: fetch,
  stdout: process.stdout,
  stderr: process.stderr,
  homedir: os.homedir(),
  platform: process.platform,
  version: pkg.version,
})
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`ar-agents: error inesperado: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
