/**
 * Recipe 17 — USA-LLC agent operating in Argentina via @ar-agents/* MCP.
 *
 * Pattern: a USA-incorporated agent (ClawBank-formed Wyoming/Ohio LLC, doola
 * Agentic LLC, Marshall Islands MIDAO entity, etc.) needs to do business in
 * Argentina — invoice AR customers, validate AR taxpayer IDs, accept Mercado
 * Pago, ship via Andreani, monitor regulatory changes. The USA agent doesn't
 * itself have AR tax residency or banking infrastructure; it composes with a
 * thin AR-resident "facade" entity (escribano, contador, or platform partner)
 * for the bits that legally require AR presence.
 *
 * # The split
 *
 *   USA-LLC agent             AR facade (escribano / contador / platform)
 *   -----------------         -------------------------------------------
 *   - decides what to do      - holds the AFIP/ARCA cert
 *   - signs payment intent    - emits factura under their CUIT
 *   - holds USD escrow        - converts USD → ARS for settlement
 *   - delegates AR ops        - acts as the AR-resident contracting party
 *
 * The USA agent never touches AFIP directly. Instead it calls an AR-resident
 * MCP server that exposes @ar-agents/* tools, and that MCP server's keys belong
 * to the AR facade. This is the legally-clean way to operate cross-border:
 * the AR entity is the principal, the USA agent is the platform.
 *
 * # The MCP host config (USA-LLC side)
 *
 * The USA agent (Claude Desktop / Cursor / a custom MCP host) declares:
 *
 *   {
 *     "mcpServers": {
 *       "ar-ops": {
 *         "command": "npx",
 *         "args": ["-y", "@ar-agents/mcp"],
 *         "env": {
 *           // ALL of these belong to the AR facade — never the USA agent.
 *           "MP_ACCESS_TOKEN": "APP_USR-…",        // facade's MP merchant token
 *           "AFIP_CERT_PEM": "-----BEGIN CERTIFICATE-----…",
 *           "AFIP_KEY_PEM": "-----BEGIN PRIVATE KEY-----…",
 *           "AFIP_CUIT": "30-12345678-9",          // facade's CUIT
 *           "WHATSAPP_ACCESS_TOKEN": "EAA…"        // optional
 *         }
 *       }
 *     }
 *   }
 *
 * # What the USA agent can now do
 *
 *   - validate_cuit(payerCuit)                  — algorithm, free, no AR exposure
 *   - lookup_cuit_afip(payerCuit)               — AR fiscal data, scoped to facade's cert
 *   - create_payment(amount, payerEmail, ...)   — charges run on facade's MP merchant
 *   - emit_factura_b(amount, payerCuit, items)  — emitted under facade's CUIT
 *   - cotizar_envio_andreani(toCpa, weight)     — quote against facade's carrier account
 *   - send_whatsapp_text(to, body)              — sent from facade's WhatsApp number
 *
 * The USA agent's logic stays in JS; the AR-resident operations stay on the
 * AR side. Both sides see the agreement via signed MCP tool-call records.
 *
 * # Sample agent loop (USA-LLC side, using Vercel AI SDK 6 + MCP client)
 */

import { Experimental_Agent as Agent, stepCountIs } from "ai";
// In a USA agent's project, you'd use the MCP client from `ai` v6 (or `@modelcontextprotocol/sdk`)
// to connect to the locally-spawned ar-agents MCP server. The agent then sees
// every @ar-agents/* tool in its tool list.
//
// import { experimental_createMCPClient as createMCPClient } from "ai";

async function exampleAgentLoop() {
  // ─── Boot the MCP client connection (USA agent → AR facade's MCP server) ─
  // const arOps = await createMCPClient({
  //   transport: { type: "stdio", command: "npx", args: ["-y", "@ar-agents/mcp"] },
  // });
  // const tools = await arOps.tools();
  //
  // The 89 + 6 + 2 + 10 + 5 + 6 + 5 = 123 tools across all 7 packages are
  // now available as if they were native to the USA agent.

  const agent = new Agent({
    model: "anthropic/claude-sonnet-4-6",
    instructions:
      "You are an AI agent incorporated as a Wyoming LLC. To do business in " +
      "Argentina you delegate AR-resident operations to an AR facade via the " +
      "ar-ops MCP server. ALL invoicing, payment collection, taxpayer lookups, " +
      "and shipping in AR go through ar-ops tools. Never store AR credentials " +
      "yourself.",
    // tools, // injected from MCP client
    tools: {} as Record<string, unknown>,
    stopWhen: stepCountIs(10),
  });

  // What the agent does behind this prompt:
  //   1. validate_cuit("20-12345678-9") via ar-ops
  //   2. lookup_cuit_afip → "Cliente SRL, Responsable Inscripto"
  //   3. cotizar_envio_andreani(B1842, 0.5kg) → AR$ 4.500
  //   4. create_payment(amount=104500, payerEmail) → init_point_url
  //   5. (after payment confirms) emit_factura_a(104500, payerCuit, ["servicio digital"])
  //   6. send_whatsapp_text(payerPhone, "Listo. Factura A: <pdf-url>")
  const { text } = await agent.generate({
    prompt:
      "Cobrale a un cliente AR (CUIT 20-12345678-9, email contacto@ejemplo.com.ar, " +
      "WhatsApp +5491155555555) USD 100 (≈ AR$ 100.000) por un servicio de consultoría " +
      "+ envío Andreani al CP B1842. Si validás que es Responsable Inscripto, emití " +
      "factura A. Si no, factura B. Mandale el link por WhatsApp cuando esté.",
  });

  console.log(text);
}

if (process.argv[1]?.endsWith("17-usa-llc-companion.ts")) {
  exampleAgentLoop().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}

export { exampleAgentLoop };
