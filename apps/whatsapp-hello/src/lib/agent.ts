import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { identityTools, type AfipPadronAdapter } from "@ar-agents/identity";
import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";
import { mercadoPagoTools, MercadoPagoClient, InMemoryStateAdapter } from "@ar-agents/mercadopago";
import { whatsappTools, WhatsAppClient } from "@ar-agents/whatsapp";
import { MockWhatsAppClient } from "./mock-whatsapp-client";

const MODEL = process.env.WSP_AGENT_MODEL ?? "anthropic/claude-sonnet-4-6";

const INSTRUCTIONS = `Sos el asistente de billing de LautaroSaaS por WhatsApp. Tu trabajo es onboardear nuevos clientes y manejar suscripciones.

Workflow estándar:
1. Cuando un cliente nuevo te escribe pidiendo contratar, pedile el CUIT de su empresa.
2. Validá el CUIT con \`validate_cuit\`. Si es inválido, explicale por qué (formato, prefijo, dígito verificador).
3. Si validate_cuit pasa, consultá el padrón con \`lookup_cuit_afip\` para obtener nombre + condición fiscal + monotributo. Confirmale al cliente que la suscripción se va a emitir a nombre de [nombre del padrón]. Si available:false, surfaceá el error tal cual.
4. Creá la suscripción con la tool de MP usando el plan apropiado (Básico $15.000/mes, Pro $25.000/mes, Enterprise $80.000/mes).
5. Mandale el link de pago de MP por WhatsApp con \`send_whatsapp_text\`.
6. Marcá los mensajes entrantes como leídos con \`mark_whatsapp_read\` apenas los proceses (mejora UX).

Cuando un cliente existente pregunta por su suscripción:
- Chequeá estado con la tool MP.
- Si pide cambiar plan, ofrecele las opciones con \`send_whatsapp_buttons\` (Básico / Pro / Enterprise).

Reglas:
- Sos directo, vocabulario argentino natural ("dale", "che", "te paso"), sin emojis salvo que el cliente los use primero.
- Si AFIP devuelve "DESCONOCIDA" en condición fiscal, decile honestamente que no tenés esa data y seguí el flow.
- Outside del 24h window de WhatsApp usá \`send_whatsapp_template\` (no free-form text).
- NUNCA inventés datos — si una tool falla, decí que no pudiste y pedí más contexto.`;

function buildAfipAdapter(): AfipPadronAdapter | undefined {
  const cuit = process.env.AFIP_CUIT_REPRESENTADO?.trim();
  if (!cuit) return undefined;
  const env = (process.env.AFIP_ENV?.trim() ?? "prod") as "homo" | "prod";
  const certPem = process.env.AFIP_CERT_PEM;
  const keyPem = process.env.AFIP_KEY_PEM;
  if (certPem && keyPem) {
    return new WsaaWscdcAfipPadronAdapter({ certPem, keyPem, cuitRepresentado: cuit, env });
  }
  const certPath = process.env.AFIP_CERT_PATH?.trim();
  const keyPath = process.env.AFIP_KEY_PATH?.trim();
  if (certPath && keyPath) {
    return new WsaaWscdcAfipPadronAdapter({ certPath, keyPath, cuitRepresentado: cuit, env });
  }
  return undefined;
}

function buildMpClient(): MercadoPagoClient | null {
  const accessToken = process.env.MP_ACCESS_TOKEN?.trim();
  if (!accessToken) return null;
  return new MercadoPagoClient({ accessToken });
}

/**
 * Real WhatsAppClient when creds are present, MockWhatsAppClient otherwise.
 * The mock records all "sent" messages so the demo UI can show what would
 * have been sent to the user via WhatsApp if real Meta creds were wired.
 */
function buildWhatsAppClient(): {
  client: WhatsAppClient | MockWhatsAppClient;
  mode: "live" | "mock";
} {
  const accessToken = process.env.WA_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID?.trim();
  if (accessToken && phoneNumberId) {
    return {
      client: new WhatsAppClient({ accessToken, phoneNumberId }),
      mode: "live",
    };
  }
  return { client: new MockWhatsAppClient(), mode: "mock" };
}

// Reuse a single MP state adapter across requests so subscription IDs cached
// in one call survive into the next one (in-memory, fine for the demo).
const mpStateAdapter = new InMemoryStateAdapter();

const MP_BACK_URL =
  process.env.MP_BACK_URL ?? "https://whatsapp-hello.example.com/billing/done";

export function createWhatsAppHelloAgent() {
  const afip = buildAfipAdapter();
  const mp = buildMpClient();
  const { client: wa, mode } = buildWhatsAppClient();

  const tools = {
    ...identityTools(afip ? { afip } : {}),
    ...(mp ? mercadoPagoTools(mp, { state: mpStateAdapter, backUrl: MP_BACK_URL }) : {}),
    ...whatsappTools(wa as WhatsAppClient),
  };

  const agent = new Agent({
    model: MODEL,
    instructions: INSTRUCTIONS,
    tools,
    stopWhen: stepCountIs(10),
  });

  return { agent, whatsappMode: mode, whatsappClient: wa };
}
