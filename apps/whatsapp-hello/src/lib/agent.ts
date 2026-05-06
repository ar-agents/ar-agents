import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { identityTools, type AfipPadronAdapter } from "@ar-agents/identity";
import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";
import { mercadoPagoTools, MercadoPagoClient, InMemoryStateAdapter } from "@ar-agents/mercadopago";
import { whatsappTools, WhatsAppClient } from "@ar-agents/whatsapp";
import {
  AttestationClient,
  identityAttestTools,
  WhatsAppOtpAdapter,
  InMemoryAttestationStore,
} from "@ar-agents/identity-attest";
import { MockWhatsAppClient } from "./mock-whatsapp-client";

const MODEL = process.env.WSP_AGENT_MODEL ?? "anthropic/claude-sonnet-4-6";

const INSTRUCTIONS = `Sos el asistente de billing de LautaroSaaS por WhatsApp. Tu trabajo es onboardear nuevos clientes, manejar suscripciones, y procesar cobros — siempre verificando identidad cuando hace falta.

# Workflow estándar (cobro nuevo)

1. Marcá el mensaje entrante como leído inmediatamente con \`mark_whatsapp_read\` (los dobles checks azules mejoran la confianza).
2. Si te pasa un CUIT, validalo con \`validate_cuit\`. Si pasa, opcionalmente consultá padrón ARCA con \`lookup_cuit_afip\` para confirmar nombre + condición fiscal.
3. **Decidí qué nivel de verificación necesitás según monto:**
   - Cobros < $5.000 → procesá directo, sin verification
   - Cobros $5.000 - $50.000 → requerís trust >= 0.3 (whatsapp_otp)
   - Cobros $50.000 - $500.000 → requerís trust >= 0.5 (email_magic_link o mercadopago_identity)
   - Cobros > $500.000 → requerís trust >= 0.7 (auth0 o magic_link_sdk) — preferentemente con MFA (trust 0.85)
4. **Si necesitás verification**: llamá \`request_identity_verification\` con \`method: "whatsapp_otp"\` y el teléfono del cliente. Surfaceá el \`next_step\` al cliente. **CRÍTICO**: en tu mensaje de respuesta SIEMPRE incluí el \`request_id\` al final entre brackets para podés recuperarlo en el próximo turn cuando el cliente dictate el código. Formato exacto: \`[verification_request_id: <id>]\`. Cuando el cliente dictate el código en el próximo turn, leé el último \`request_id\` de tu mensaje previo y llamá \`submit_otp_code(request_id, code)\`.
5. Una vez verificado (o si no requerías verification), creá:
   - Cobro one-off: \`create_payment_preference\` (link de Checkout Pro) o \`create_payment\` (con account_money)
   - Suscripción recurrente: \`create_subscription\`
   - Para clientes returning con tarjeta guardada: \`charge_saved_card\` (necesita CVV)
   - Para cobro presencial: \`create_qr_payment\` (genera QR escaneable)
6. Mandale el link/info al cliente con \`send_whatsapp_text\`.

# Reglas críticas

- **NUNCA cobres montos > $5.000 sin verification activa.** Si el cliente no quiere verificar, explicale que es por seguridad.
- **NUNCA inventés data.** Si una tool falla, surfaceá el error verbatim al cliente.
- Vocabulario argentino natural: "dale", "che", "te paso", "listo". Sin emojis salvo que el cliente los use primero.
- Outside del 24h window de WhatsApp, usá \`send_whatsapp_template\` (no free-form text).
- Para cuotas usá \`calculate_installments\` antes de cobrar — surfaceá el \`recommended_message\` al cliente VERBATIM (es lo que cumple con la regulación AR de transparencia).
- Si AFIP devuelve "DESCONOCIDA" en condición fiscal, decilo honestamente y seguí.

# Pricing reference (LautaroSaaS)

- Plan Básico: $15.000/mes
- Plan Pro: $25.000/mes (popular)
- Plan Enterprise: $80.000/mes
- One-off: setup + servicios profesionales según cotización

# Ejemplo de flow exitoso

User: "Hola, quiero contratar el plan Pro. CUIT 20-41758101-5, teléfono 5491112345678"
Agent: [mark_whatsapp_read] [validate_cuit] [lookup_cuit_afip → confirma nombre]
       "Listo CLEMENTE NAZARENO. Plan Pro son $25.000/mes. Antes de generar el link te mando un código por WhatsApp para verificar el número, dame un toque."
       [request_identity_verification(method=whatsapp_otp, subject_value=5491112345678)]
       "Te mandé el código a tu WhatsApp."
User: "el código es 482917"
Agent: [submit_otp_code(request_id, "482917")]
       [create_subscription(plan Pro, $25k/mes)]
       [send_whatsapp_text → init_point_url]
       "Verificado ✓ Te paso el link de pago: https://...mercadopago.../checkout?... Hacé click y completá con tarjeta + CVV. Después se cobra automático todos los meses."`;

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

// Single state adapter across requests (in-memory, fine for the demo).
const mpStateAdapter = new InMemoryStateAdapter();
// Single attestation store + signing secret across requests.
const attestationStore = new InMemoryAttestationStore();

// Fail-closed: a missing signing secret means attestations are forgeable by
// anyone who reads the public source. We refuse to start the agent rather
// than silently fall back to a known-weak secret. Generate via:
//   openssl rand -hex 32
// then set as ATTEST_SIGNING_SECRET in Vercel env or .env.local.
function requireAttestSigningSecret(): string {
  const v = process.env.ATTEST_SIGNING_SECRET?.trim();
  if (!v) {
    throw new Error(
      "ATTEST_SIGNING_SECRET is required. Generate one with `openssl rand -hex 32` " +
        "and set it in Vercel env vars (or .env.local for local dev). " +
        "Without it, attestations would be forgeable.",
    );
  }
  return v;
}
const ATTEST_SIGNING_SECRET = requireAttestSigningSecret();

const MP_BACK_URL =
  process.env.MP_BACK_URL ?? "https://whatsapp-hello.example.com/billing/done";

/**
 * Create the agent. Pass `scopedTo` (sender phone) when called from the
 * webhook handler — that locks every send_whatsapp_* tool to the inbound
 * sender so a crafted message can't trick the agent into messaging a
 * different number. Closes /cso security audit finding F5.
 *
 * Without `scopedTo` (e.g., the demo /api/agent route, batch flows), the
 * tools accept arbitrary `to` arguments.
 */
export function createWhatsAppHelloAgent(options: { scopedTo?: string } = {}) {
  const afip = buildAfipAdapter();
  const mp = buildMpClient();
  const { client: wa, mode } = buildWhatsAppClient();

  // Identity-attest with WhatsApp OTP using the same WA client (real or mock).
  // When mock: the OTP "sends" via MockWhatsAppClient and shows in the UI's
  // sends list — the user can then dictate it back to the agent.
  const attestation = new AttestationClient({
    signingSecret: ATTEST_SIGNING_SECRET,
    adapters: {
      whatsapp_otp: new WhatsAppOtpAdapter({
        whatsappClient: wa as WhatsAppClient,
        businessName: "LautaroSaaS",
      }),
    },
    store: attestationStore,
  });

  const tools = {
    ...identityTools(afip ? { afip } : {}),
    ...(mp ? mercadoPagoTools(mp, { state: mpStateAdapter, backUrl: MP_BACK_URL }) : {}),
    ...whatsappTools(wa as WhatsAppClient, options.scopedTo ? { scopedTo: options.scopedTo } : {}),
    ...identityAttestTools(attestation),
  };

  const agent = new Agent({
    model: MODEL,
    instructions: INSTRUCTIONS,
    tools,
    stopWhen: stepCountIs(12),
  });

  return { agent, whatsappMode: mode, whatsappClient: wa };
}
