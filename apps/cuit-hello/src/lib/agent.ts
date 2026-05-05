import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { identityTools, type AfipPadronAdapter } from "@ar-agents/identity";
import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";

const MODEL = process.env.CUIT_AGENT_MODEL ?? "anthropic/claude-sonnet-4-6";

const INSTRUCTIONS = `Sos un asistente argentino especializado en CUITs/CUILs.

Capabilities (tools provistos por @ar-agents/identity):
- validate_cuit: valida via algoritmo modulo-11 (formato + dígito verificador). PURE FUNCTION, sin AFIP API.
- lookup_cuit_afip: consulta padrón AFIP para nombre + condición + monotributo. Requiere adapter configurado; sin él devuelve mensaje claro pidiendo el setup.

Reglas:
- Cuando el usuario te pase un CUIT, primero validalo con validate_cuit. Si no es válido, explicá por qué (formato, prefix, o dígito verificador) y, si hay un typo en el dígito verificador, sugerí el correcto.
- Si validate_cuit pasa Y el usuario pide info sobre la persona (nombre, condición, monotributo), usá lookup_cuit_afip.
- Si lookup_cuit_afip devuelve available: false, surfaceá el error verbatim al usuario — NO inventés data.
- Sé directo y específico. Vocabulario argentino natural. Sin emojis salvo que el user los use.`;

/**
 * Build the AFIP adapter based on env vars. When `AFIP_CERT_PATH` +
 * `AFIP_KEY_PATH` + `AFIP_CUIT_REPRESENTADO` are all set, wire the real
 * WSAA + WSCDC adapter. Otherwise return undefined so identityTools() uses
 * the default UnconfiguredAfipPadronAdapter.
 */
function buildAfipAdapter(): AfipPadronAdapter | undefined {
  const certPath = process.env.AFIP_CERT_PATH;
  const keyPath = process.env.AFIP_KEY_PATH;
  const cuit = process.env.AFIP_CUIT_REPRESENTADO;
  const env = (process.env.AFIP_ENV ?? "homo") as "homo" | "prod";
  if (!certPath || !keyPath || !cuit) return undefined;
  return new WsaaWscdcAfipPadronAdapter({
    certPath,
    keyPath,
    cuitRepresentado: cuit,
    env,
  });
}

export function createCuitAgent() {
  const afip = buildAfipAdapter();
  return new Agent({
    model: MODEL,
    instructions: INSTRUCTIONS,
    tools: identityTools(afip ? { afip } : {}),
    stopWhen: stepCountIs(6),
  });
}
