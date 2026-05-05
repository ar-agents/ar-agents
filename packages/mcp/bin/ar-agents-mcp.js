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

import { startStdio } from "../dist/index.js";

startStdio().catch((err) => {
  console.error("ar-agents MCP server failed to start:", err);
  process.exit(1);
});
