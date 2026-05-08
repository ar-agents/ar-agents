---
"@ar-agents/mcp": minor
---

Add `@ar-agents/gde-tad` to the MCP bundle. The 4 gde-tad tools (`validate_igj_inscription`, `list_domicilio_inbox`, `list_mis_tramites`, `get_critical_notifications`) are exposed to every MCP host (Claude Desktop, Cursor, Continue, Cline) alongside the 11 existing subpackages. Total exposed surface: 133 tools across 12 subpackages. The doctor CLI now reports gde-tad config + always-on tools.
