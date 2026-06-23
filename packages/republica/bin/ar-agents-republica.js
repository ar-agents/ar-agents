#!/usr/bin/env node
// CLI de @ar-agents/republica — el servidor MCP que introspecciona y VERIFICA la
// República Autónoma para cualquier host MCP (Claude Desktop, Cursor, Cline, ...).
//
//   "mcpServers": {
//     "republica": {
//       "command": "npx",
//       "args": ["-y", "@ar-agents/republica"],
//       "env": { "AR_REPUBLIC_URL": "https://ar-panel-one.vercel.app" }
//     }
//   }
//
// Subcomando `verify` corre el verificador y sale 0/1 (para CI).
const sub = process.argv[2];

if (sub === "verify") {
  const { verifyRepublic } = await import("../dist/index.js");
  const base = process.argv[3] || process.env.AR_REPUBLIC_URL || "https://ar-panel-one.vercel.app";
  const rep = await verifyRepublic(base);
  console.log(`\n  República Autónoma · ${rep.base}\n`);
  for (const c of rep.checks) {
    const mark = c.pass === null ? "—" : c.pass ? "✓" : "✗";
    console.log(`  ${mark} ${c.name}${c.detail ? "  (" + c.detail + ")" : ""}`);
  }
  console.log(`\n  founding ${rep.founding.slice(0, 16)}… · corpus v${rep.corpusVersion}\n`);
  console.log(rep.ok ? "  PASS — verificable, firmada e íntegra.\n" : "  FAIL\n");
  process.exit(rep.ok ? 0 : 1);
} else if (sub === "help" || sub === "--help" || sub === "-h") {
  process.stdout.write(`\
@ar-agents/republica — servidor MCP que introspecciona y verifica la República Autónoma.

Uso:
  ar-agents-republica            Arranca el servidor MCP (JSON-RPC por stdio).
  ar-agents-republica verify [url]   Verifica la República y sale 0/1.
  ar-agents-republica version    Versión instalada.

Tools MCP: verify_republic, get_republic, get_constitution, resolve_article, get_rails, get_codex.
Env: AR_REPUBLIC_URL (default https://ar-panel-one.vercel.app).
Docs: https://github.com/ar-agents/ar-agents/tree/main/packages/republica
`);
  process.exit(0);
} else if (sub === "version" || sub === "--version" || sub === "-v") {
  const fs = await import("node:fs/promises");
  const url = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(await fs.readFile(url, "utf-8"));
  process.stdout.write(`@ar-agents/republica ${pkg.version}\n`);
  process.exit(0);
} else {
  const { startStdio } = await import("../dist/index.js");
  startStdio().catch((err) => {
    console.error("ar-agents-republica falló al arrancar:", err);
    process.exit(1);
  });
}
