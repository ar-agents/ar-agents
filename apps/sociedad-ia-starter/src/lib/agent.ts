/**
 * The agent loop. One Experimental_Agent that composes 8 packages from
 * the @ar-agents/* toolkit.
 *
 * Wired tools (always available, fall back to unconfigured shims when
 * env vars are missing):
 *
 *   - identity         · CUIT validate + AFIP padron lookup
 *   - banking          · CBU validate + BCRA Central de Deudores + variables
 *   - facturacion      · AFIP/ARCA WSFE factura emission
 *   - mercadopago      · subscriptions + payments + marketplace
 *   - whatsapp         · Meta Business Cloud API
 *   - igj              · public corporate registry
 *   - boletin-oficial  · norma search + monitoring
 *   - gde-tad          · DEC inbox + IGJ pre-flight + Mis Trámites
 */

import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { identityTools } from "@ar-agents/identity";
import { bankingTools } from "@ar-agents/banking";
import { facturacionTools } from "@ar-agents/facturacion";
import { mercadoPagoTools, InMemoryStateAdapter } from "@ar-agents/mercadopago";
import { whatsappTools } from "@ar-agents/whatsapp";
import { igjTools, LiveCkanFetcher } from "@ar-agents/igj";
import {
  boletinOficialTools,
  LiveBoFetcher,
  InMemoryBoSubscriptionAdapter,
} from "@ar-agents/boletin-oficial";
import { gdeTadTools } from "@ar-agents/gde-tad";
import { treasuryTools, treasurySideEffectsFor } from "@ar-agents/treasury/tools";

import {
  getMpClient,
  getWhatsAppClient,
  getWsfeClient,
  getAfipPadronAdapter,
  getOffRamp,
} from "./clients";
import { enforceRiskPolicy } from "@ar-agents/core";
import { approve, isHalted } from "./governance";

const SYSTEM_PROMPT = `Sos el agente operador de una sociedad-IA argentina.
Operás bajo el marco de RFC-001 (https://ar-agents.ar/rfcs/001):

1. Toda decisión irreversible (refunds, cancellations, transferencias)
   pasa por requireConfirmation. Nunca la ejecutes vos directamente.

2. Cada tool call queda en el audit log con timestamp HMAC-firmado.
   No hay "mode oculto" — todo lo que hagas es auditable.

3. Si un tool devuelve "available: false", surface el mensaje verbatim
   al usuario antes de seguir. Es señal de configuración faltante o
   problema upstream del lado del Estado/proveedor.

4. Para validaciones ARCA (CUIT padron) y BCRA (Central de Deudores),
   confiá en el resultado del tool. No alucines monotributo categorías
   ni situaciones crediticias.

5. Para emisión de facturas: corré primero validate_solicitar_cae
   (pre-flight) y solo después solicitar_cae. Esto evita el ~30% de
   rechazos mecánicos de AFIP.

6. Para WhatsApp: usá templates aprobados por Meta para mensajes
   iniciados por la sociedad. Free-form sólo dentro de la ventana de
   24h post-inbound.

Idioma: español rioplatense para clientes; inglés en errores técnicos.`;

export function buildAgent() {
  const mp = getMpClient();
  const wa = getWhatsAppClient();
  const wsfe = getWsfeClient();
  const afip = getAfipPadronAdapter();

  return new Agent({
    model: anthropic("claude-sonnet-4-5"),
    stopWhen: stepCountIs(20),
    instructions: SYSTEM_PROMPT,
    // enforceRiskPolicy is the central art. 102 gate: high-stakes tools defer to
    // an async human approval (queue at ar-agents.ar), a suspended society halts
    // every tool (kill-switch), and read tools pass through. See ./governance.
    tools: enforceRiskPolicy(
      {
        // Always-on (algorithm or default-OK adapter).
        ...identityTools({ afip }),
        ...bankingTools(),
        ...gdeTadTools(),
        ...igjTools({ fetcher: new LiveCkanFetcher() }),
        ...boletinOficialTools({
          fetcher: new LiveBoFetcher(),
          subscriptions: new InMemoryBoSubscriptionAdapter(),
        }),
        ...facturacionTools(wsfe ? { wsfe } : {}),
        // Treasury: pure fiscal calculators + the USDC->ARS off-ramp. The off-ramp
        // convert is IRREVERSIBLE and gated by enforceRiskPolicy below.
        ...treasuryTools({ offramp: getOffRamp() }),
        // Tools that need a client — register only if config present.
        ...(mp
          ? mercadoPagoTools(mp, {
              state: new InMemoryStateAdapter(),
              backUrl:
                process.env.MERCADOPAGO_BACK_URL?.trim() ??
                "https://example.com/return",
            })
          : {}),
        ...(wa ? whatsappTools(wa) : {}),
      },
      { approve, isHalted, sideEffectsFor: treasurySideEffectsFor },
    ),
  });
}
