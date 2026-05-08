---
"@ar-agents/banking": minor
"@ar-agents/facturacion": minor
"@ar-agents/shipping": minor
"@ar-agents/mcp": minor
---

Add `doctor` CLIs to the remaining 4 packages — completes the uniform CLI surface across the toolkit.

```bash
npx @ar-agents/banking doctor       # algorithm-only tools, BCRA endpoint, 11 tools
npx @ar-agents/facturacion doctor   # AFIP cert/key/CUIT/env/PdV check + tools
npx @ar-agents/shipping doctor      # which carriers (Andreani/OCA/Correo) are wired
npx -y @ar-agents/mcp doctor        # which @ar-agents/* subpackages your MCP host has wired
```

The `mcp doctor` is particularly useful — it shows the full subpackage status (enabled / partial / disabled) with the always-on tools per package, so a Claude Desktop / Cursor user knows exactly what their host can do without enumerating env vars.

All 7 published `@ar-agents/*` packages with tools now ship a uniform `doctor` subcommand. Plus `mp-doctor` from earlier still works for backward compat.
