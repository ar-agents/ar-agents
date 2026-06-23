# ar-agents for eve

[ar-agents](https://ar-agents.ar) is an eve-ready tool provider for Argentine agents.
eve gives you the runtime (the agent loop, the web/Slack chat surfaces, auth);
ar-agents gives the agent a *body* in Argentina: real integrations with the state and
the payment rails, plus the governance and the legal incorporation. The two stack,
they don't compete.

There are two ways to wire ar-agents into an eve agent, and they compose.

## Path A: live tools via MCP

Add the [`@ar-agents/mcp`](../../packages/mcp) server to your eve agent's MCP servers.
It exposes the whole `@ar-agents/*` toolkit (identity, mi-argentina, identity-attest,
mercadopago, mercadolibre, whatsapp, banking, facturacion, shipping, boletin-oficial,
igj, firma-digital) over the Model Context Protocol.

```jsonc
{
  "mcpServers": {
    "ar-agents": {
      "command": "npx",
      "args": ["-y", "@ar-agents/mcp"],
      "env": {
        // Solo las que uses; cada sección degrada sola si falta su env.
        // Lista completa en packages/mcp (server.json / README).
        "AFIP_CERT_PEM": "...",
        "AFIP_KEY_PEM": "...",
        "AFIP_CUIT": "...",
        "MP_ACCESS_TOKEN": "...",
        "WHATSAPP_ACCESS_TOKEN": "..."
      }
    }
  }
}
```

Every section degrades gracefully: a tool whose env vars are missing returns
`available: false` with a useful message instead of crashing. Useful for PR previews
and local dev without real secrets.

## Path B: skills (prose playbooks)

The tools tell the agent *what it can do*; the skills tell it *when and how*. Drop the
ar-agents skill playbooks into your eve agent's `agent/skills/`:

```
agent/
  instructions.md          # tu agente
  skills/
    facturacion.md          # <- copiá de ar-agents
    mercadopago.md
    identity.md
    ...
```

Canonical source: [`apps/sociedad-ia-starter/agent/skills/`](../../apps/sociedad-ia-starter/agent/skills).
Each one is a short, eve-native `skills/*.md` (cuándo usarlo, gobernanza, contexto AR).
Son los mismos archivos que ship el starter de sociedad-IA, así que no driftean
respecto del toolkit.

## ¿Querés que el agente *sea* una empresa argentina?

Tools + skills hacen capaz a un agente eve en Argentina. Para convertirlo en una
**sociedad-IA** registrada (CUIT, capacidad de facturar y operar cuenta bancaria,
human-in-the-loop por art. 102, audit log público firmado), usá el flujo de
incorporación en vez de cablear tools a mano:

- API / SDK de una llamada: [`@ar-agents/incorporate`](../../packages/incorporate) o
  `POST https://ar-agents.ar/api/auto-incorporate`.
- Devuelve un agente deployable completo (en el formato eve `agent/instructions.md` +
  `skills/`), un deploy one-click a Vercel y una referencia de audit firmada.
- App de referencia: [`apps/sociedad-ia-starter`](../../apps/sociedad-ia-starter).

## Dónde está la línea

eve es dueño del runtime (loop, ruteo del modelo, chat/Slack/auth). ar-agents es dueño
del sustrato que un framework horizontal no va a construir: las integraciones AR, la
enforcement de gobernanza (HITL + audit firmado con HMAC, RFC-001/004/005) y la
incorporación legal. El modelo se llama vía Vercel AI Gateway. La gobernanza y el audit
viven en ar-agents (portables entre eve, el AI SDK pelado, Bankr o cualquier MCP host);
el loop se alquila a eve.

## Links

- Toolkit + docs: https://ar-agents.ar
- MCP server: [`packages/mcp`](../../packages/mcp)
- Incorporación: https://ar-agents.ar/incorporar
- RFC-001 (gobernanza): https://ar-agents.ar/rfcs/001
