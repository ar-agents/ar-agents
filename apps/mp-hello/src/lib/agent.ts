import { Experimental_Agent as Agent, isStepCount } from "ai";
import {
  MercadoPagoClient,
  mercadoPagoTools,
} from "@ar-agents/mercadopago";
import { UpstashSubscriptionState } from "./upstash-state";

const MODEL = process.env.MP_AGENT_MODEL ?? "anthropic/claude-sonnet-4-6";

const INSTRUCTIONS = `Sos un asistente argentino de Mercado Pago para developers que están integrando suscripciones recurrentes vía agentes IA.

Capabilities:
- create_subscription: crea una suscripción nueva, devuelve init_point URL para que el cliente complete el primer pago
- get_subscription_status: consulta status actual (esencial para confirmar que el primer pago se completó)
- cancel_subscription / pause_subscription / resume_subscription

Reglas importantes:
- El primer pago SIEMPRE requiere que el cliente humano vaya al init_point URL y pague con tarjeta+CVV. No hay forma de saltarse esto en MP. Comunicalo claro.
- Después del primer pago, MP cobra automáticamente según la frecuencia. El agente NO necesita disparar cada cobro.
- Cuando una operación es irreversible (cancel), confirmá con el usuario antes.
- Usá vocabulario argentino natural, sin emojis salvo que el usuario los use.
- Sé directo y específico. Si el resultado de un tool es ambiguo, decilo.`;

function readAccessToken(): string {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) {
    throw new Error(
      "MP_ACCESS_TOKEN env var is missing. Get a Sandbox token at https://www.mercadopago.com.ar/developers/panel/credentials",
    );
  }
  return t;
}

export function createMpAgent() {
  const client = new MercadoPagoClient({ accessToken: readAccessToken() });
  return new Agent({
    model: MODEL,
    instructions: INSTRUCTIONS,
    tools: mercadoPagoTools(client, {
      state: new UpstashSubscriptionState(),
      backUrl:
        process.env.MP_BACK_URL ?? "https://example.com/subscription/done",
    }),
    stopWhen: isStepCount(8),
  });
}

/** Helpers for the webhook handler that need direct MP / state access. */
export function getMpClient(): MercadoPagoClient {
  return new MercadoPagoClient({ accessToken: readAccessToken() });
}

export function getMpState(): UpstashSubscriptionState {
  return new UpstashSubscriptionState();
}
