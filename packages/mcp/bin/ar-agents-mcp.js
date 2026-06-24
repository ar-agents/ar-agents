#!/usr/bin/env node
// CLI entry for the ar-agents MCP server.
//
// Usage (from any MCP host config — Cursor, Claude Desktop, etc.):
//   {
//     "mcpServers": {
//       "ar-agents": {
//         "command": "npx",
//         "args": ["-y", "@ar-agents/mcp"],
//         "env": {
//           "MP_ACCESS_TOKEN": "TEST-...",
//           "AFIP_CERT_PEM": "-----BEGIN CERTIFICATE-----...",
//           ...
//         }
//       }
//     }
//   }
//
// Without env vars: only `validate_cuit` is exposed (algorithm-only).
// Each env-var group enables a different subset of tools — see README.

// `doctor` and `help` are non-MCP subcommands that emit diagnostics to stdout.
// All other invocations (no args, --stdio, etc.) launch the MCP server proper,
// which speaks JSON-RPC over stdio for Claude Desktop / Cursor / Continue / etc.
const sub = process.argv[2];

if (sub === "doctor") {
  const { runDoctor } = await import("../dist/cli.js");
  runDoctor().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
} else if (sub === "help" || sub === "--help" || sub === "-h") {
  process.stdout.write(`\
@ar-agents/mcp — Model Context Protocol server bundling all @ar-agents/* packages.

Usage:
  ar-agents-mcp                  Start the MCP server (default — speak JSON-RPC over stdio).
  ar-agents-mcp http             Start the MCP server over Streamable HTTP (remote/hostable; env AR_MCP_HTTP_PORT, default 3030).
  ar-agents-mcp doctor           Diagnose which subpackages are wired in this env.
  ar-agents-mcp version          Print installed version.
  ar-agents-mcp help             Print this message.

Wire in your MCP host (Claude Desktop / Cursor / Continue / Cline) by adding:
  "mcpServers": {
    "ar-agents": {
      "command": "npx",
      "args": ["-y", "@ar-agents/mcp"],
      "env": { "MP_ACCESS_TOKEN": "...", "AFIP_CERT_PEM": "...", ... }
    }
  }

Docs: https://github.com/ar-agents/ar-agents/tree/main/packages/mcp
`);
  process.exit(0);
} else if (sub === "version" || sub === "--version" || sub === "-v") {
  const fs = await import("node:fs/promises");
  const url = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(await fs.readFile(url, "utf-8"));
  process.stdout.write(`@ar-agents/mcp ${pkg.version}\n`);
  process.exit(0);
} else if (sub === "http" || sub === "serve") {
  // Remote transport: Streamable HTTP (hostable on Vercel Services; unblocks x402).
  const { startHttp } = await import("../dist/index.js");
  startHttp().catch((err) => {
    console.error("ar-agents MCP HTTP server failed to start:", err);
    process.exit(1);
  });
} else if (process.env.AR_MCP_HTTP_PORT) {
  // No subcommand but an HTTP port is set: start HTTP (convenient for hosting).
  const { startHttp } = await import("../dist/index.js");
  startHttp().catch((err) => {
    console.error("ar-agents MCP HTTP server failed to start:", err);
    process.exit(1);
  });
} else {
  // Default: start the actual MCP server (stdio JSON-RPC).
  const { startStdio } = await import("../dist/index.js");
  startStdio().catch((err) => {
    console.error("ar-agents MCP server failed to start:", err);
    process.exit(1);
  });
}
