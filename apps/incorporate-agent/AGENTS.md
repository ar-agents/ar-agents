This project uses the Eve framework. Before writing code, always read the relevant guide in `node_modules/eve/docs/`.

Project-specific notes:
- This agent incorporates an Argentine Sociedad Automatizada via ar-agents. The legal rules live in `agent/skills/sociedad-automatizada.md`; load them before touching the incorporation flow.
- Irreversible or legally-supervised actions (incorporation, payments, filings) MUST stay gated with `needsApproval: always()` from `eve/tools/approval`. This is the art. 102 supervision duty, not optional.
- The ar-agents Argentine tools come from the MCP connection in `agent/connections/ar-agents.ts` (no auth, read-only). Do not reimplement CUIT validation or fiscal math; call the connection.
- No em dashes in any served copy or instructions.
