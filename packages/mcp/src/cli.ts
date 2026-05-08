// Re-export the doctor entry so the bin can dynamic-import it without
// pulling the full MCP server bundle (which has @modelcontextprotocol/sdk
// as a dep). Keeps `ar-agents-mcp doctor` boot fast.
export { runDoctor } from "./cli-doctor";
