/**
 * Recipe 10 — Cross-package billing assistant.
 *
 * The killer demo of the @ar-agents/* toolkit's composability. ONE agent loop,
 * five packages working together to do what would normally be 200 lines of
 * orchestration code:
 *
 *   1. @ar-agents/identity         — validate the buyer's CUIT, look up
 *                                    AFIP padron (monotributo + IVA condition)
 *   2. @ar-agents/identity-attest  — gate large charges behind WhatsApp OTP
 *   3. @ar-agents/mercadopago      — run the actual subscription / payment
 *   4. @ar-agents/facturacion      — emit factura electrónica WSFE on success
 *   5. @ar-agents/whatsapp         — send confirmation + invoice link
 *
 * Real production pattern: invoice an Argentine SMB customer, fully driven
 * by an LLM agent reading natural-language business prompts.
 *
 * Run with `pnpm tsx cookbook/10-cross-package-billing.ts` after wiring env:
 *   MP_ACCESS_TOKEN
 *   AFIP_CERT_PEM, AFIP_KEY_PEM, AFIP_CUIT
 *   WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
 *   ATTESTATION_HMAC_SECRET
 */

import { Experimental_Agent as Agent, isStepCount, type ToolSet } from "ai";

// 1. Mercado Pago — always present, the headline package.
import {
  MercadoPagoClient,
  mercadoPagoTools,
  InMemoryStateAdapter,
} from "@ar-agents/mercadopago";

// 2-5. Sidecar packages. Imported up-front because every cross-package agent
//      will eventually need them; tree-shaking handles unused ones.
import {
  identityTools,
  WsaaWscdcAfipPadronAdapter,
  UnconfiguredAfipPadronAdapter,
  type AfipPadronAdapter,
} from "@ar-agents/identity";
import {
  AttestationClient,
  identityAttestTools,
  InMemoryAttestationStore,
} from "@ar-agents/identity-attest";
import {
  WsfeClient,
  facturacionTools,
} from "@ar-agents/facturacion";
import {
  WhatsAppClient,
  whatsappTools,
} from "@ar-agents/whatsapp";

// ─────────────────────────────────────────────────────────────────────────────
// Build the cross-package tool surface
// ─────────────────────────────────────────────────────────────────────────────

export async function buildBillingAgent() {
  const tools: ToolSet = {};

  // ── Mercado Pago ──────────────────────────────────────────────────────────
  const mp = new MercadoPagoClient({
    accessToken: process.env.MP_ACCESS_TOKEN!,
  });
  Object.assign(
    tools,
    mercadoPagoTools(mp, {
      state: new InMemoryStateAdapter(),
      backUrl: process.env.NEXT_PUBLIC_BACK_URL ?? "https://example.com/done",
      // HITL on irreversible ops. In production: push approval request to a
      // dashboard / Slack / email and block on user UI. For the demo: auto-OK.
      requireConfirmation: async (toolName, params) => {
        console.log(`[HITL] ${toolName} called with`, params);
        return true;
      },
    }),
  );

  // ── Identity (CUIT + AFIP/ARCA padron) ────────────────────────────────────
  // Wire the real WSAA adapter only when the cert is present; otherwise the
  // unconfigured adapter is registered so `validate_cuit` works (algorithm
  // only) but `lookup_padron` returns "not configured" cleanly.
  const afipAdapter: AfipPadronAdapter =
    process.env.AFIP_CERT_PEM && process.env.AFIP_KEY_PEM
      ? new WsaaWscdcAfipPadronAdapter({
          certPem: process.env.AFIP_CERT_PEM,
          keyPem: process.env.AFIP_KEY_PEM,
          cuitRepresentado: process.env.AFIP_CUIT!,
          env: "prod",
        })
      : new UnconfiguredAfipPadronAdapter();
  Object.assign(tools, identityTools({ afip: afipAdapter }));

  // ── Identity-attest (WhatsApp OTP gate for >$50k) ─────────────────────────
  if (process.env.ATTESTATION_HMAC_SECRET) {
    const attestClient = new AttestationClient({
      hmacSecret: process.env.ATTESTATION_HMAC_SECRET,
      store: new InMemoryAttestationStore(),
    });
    Object.assign(tools, identityAttestTools(attestClient));
  }

  // ── Facturación (factura electrónica WSFE) ────────────────────────────────
  if (process.env.AFIP_CERT_PEM && process.env.AFIP_KEY_PEM) {
    const wsfe = new WsfeClient({
      certPem: process.env.AFIP_CERT_PEM,
      keyPem: process.env.AFIP_KEY_PEM,
      cuit: Number(process.env.AFIP_CUIT!),
      env: "prod",
    });
    Object.assign(tools, facturacionTools({ wsfe }));
  }

  // ── WhatsApp (confirmation + invoice link) ────────────────────────────────
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    const wa = new WhatsAppClient({
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    });
    Object.assign(tools, whatsappTools({ client: wa }));
  }

  return new Agent({
    model: "anthropic/claude-sonnet-4-6",
    instructions:
      "Sos un asistente de billing para SaaS argentinas. Antes de cobrar, " +
      "validás el CUIT con `validate_cuit` y consultás el padrón AFIP con " +
      "`lookup_padron` para conocer la condición IVA del receptor. Para " +
      "cargos sobre $50.000 ARS, gatillás verificación WhatsApp OTP via " +
      "`request_attestation`. Después del cobro emitís factura electrónica " +
      "con `crear_factura` (B si es Consumidor Final, A si es Responsable " +
      "Inscripto, C si tu emisor es monotributo). Mandás link del " +
      "comprobante por WhatsApp con `send_text`. Respondé en castellano " +
      "rioplatense, breve, sin emojis.",
    tools,
    stopWhen: isStepCount(15), // higher than usual — multi-package flows take steps
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Example invocation
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const agent = await buildBillingAgent();

  // What the agent should do behind this prompt:
  //   1. validate_cuit("20-12345678-9") → ok
  //   2. lookup_padron("20-12345678-9") → returns "Acme SRL, monotributo Cat A, Responsable Inscripto"
  //   3. amount > $50k → request_attestation(method="whatsapp_otp", target="+5491155555555")
  //   4. (after OTP confirmed) create_subscription({ amount: 75000, frequency: "monthly", payerEmail })
  //   5. (async, after first payment webhook) crear_factura(B, monto, items)
  //   6. send_text(phone, "Suscripción activa. Factura: $url")
  const result = await agent.generate({
    prompt:
      "Cobrale $75.000 mensual a Acme SRL (CUIT 20-12345678-9, " +
      "email contacto@acme.example, WhatsApp +5491155555555) por el plan Pro. " +
      "Como supera los $50k, gatillá la verificación primero. Después emití " +
      "factura B y mandales el link por WhatsApp.",
  });

  console.log(result.text);
}

if (process.argv[1]?.endsWith("10-cross-package-billing.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
