# Changelog

## 0.1.0

### Initial release — the MCP wrapper

One MCP server that bundles the entire `@ar-agents/*` toolkit (identity, identity-attest, mercadopago, whatsapp) into any MCP host (Claude Desktop, Cursor, Codeium, Continue, Cline, etc.). Up to **34 tools in one install**, configured entirely via env vars.

**What it does**

- Spawns as a stdio MCP server (`npx @ar-agents/mcp`).
- Auto-detects which `@ar-agents/*` packages to enable based on env vars present.
- Bridges Vercel AI SDK 6 `tool()` definitions → MCP `Tool` shape, including Zod → JSON Schema conversion (using Zod 4 native `z.toJSONSchema()`).
- Reports startup summary on stderr (which packages enabled, how many tools registered).

**Tool inventory**

| Source | Tools (when configured) |
|---|---|
| `@ar-agents/identity` (always on) | 1-2 |
| `@ar-agents/identity-attest` | 5 |
| `@ar-agents/mercadopago` | 21 |
| `@ar-agents/whatsapp` | 6 |

**Env-var configuration**

- Without any env vars: only `validate_cuit` (algorithm-only).
- Each package's tools enable independently when its env vars are set. See README for the full table.

**Quality**

- 12/12 tests pass (adapter conversions, registry env-var detection, server boot).
- 21.33 KB ESM brotli'd (under 60 KB budget).
- publint + arethetypeswrong all 🟢.
- Smoke-tested CLI binary boots and connects via stdio with both empty and full env-var setups.

**Implementation notes**

- Uses Zod 4's native `z.toJSONSchema()` (no `zod-to-json-schema` dep needed).
- MCP SDK: `@modelcontextprotocol/sdk@^1.0.0`.
- Tool name collisions across registered packages throw at startup (no silent overrides).
