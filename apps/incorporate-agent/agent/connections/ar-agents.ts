import { defineMcpClientConnection } from "eve/connections";

// ar-agents hosted MCP server: zero-credential Argentine tools the agent uses
// for pre-flight checks before incorporating. No auth (public, read-only):
// validate_cuit, validate_cbu, the IVA/SICORE/SUSS fiscal calculators, BCRA
// public lookups (deudores, monetary variables), and get_toolkit_info.
// Speaks Streamable HTTP, which is what eve requires.
export default defineMcpClientConnection({
  url: "https://ar-agents.ar/api/mcp",
  description:
    "ar-agents Argentine toolkit (read-only): validate a CUIT/CUIL, validate a CBU/CVU, compute IVA/SICORE/SUSS withholdings, look up the BCRA debtor registry and monetary variables, and read the full 243-tool catalog (run get_toolkit_info for the package list). Use it to validate the administrator's CUIT and the company data before incorporating.",
});
