/**
 * The agent loop. One Experimental_Agent that composes 10 packages from
 * the @ar-agents/* toolkit, plus `registrar_decision` (see
 * `./decision-tool`, needs no client) and the central audit wrapper (see
 * `./audit-middleware`) that makes every tool call above land in the
 * signed audit log (ROADMAP.md M3-4 / M3-5). Both money-moving legs
 * (wallet-cdp's crypto transfer, treasury's fiat off-ramp) share one
 * structured audit schema — ROADMAP.md M2-4c, see ./money-audit-summarizers.
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
 *   - treasury         · fiscal calculators + USDC->ARS off-ramp (fiat leg)
 *   - wallet-cdp       · society USDC wallet on Coinbase CDP (crypto leg)
 *   - registrar_decision · records a business decision, no client needed
 */

import { Experimental_Agent as Agent, isStepCount, type LanguageModel, type ToolSet } from "ai";
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
import { withOffRampIdempotency } from "@ar-agents/treasury";
import { walletCdpTools, walletCdpSideEffectsFor } from "@ar-agents/wallet-cdp/tools";

import {
  getMpClient,
  getWhatsAppClient,
  getWsfeClient,
  getAfipPadronAdapter,
  getOffRamp,
  getCdpWallet,
} from "./clients";
import { applyToAllTools, enforceRiskPolicy } from "@ar-agents/core";
import { approve, isHalted } from "./governance";
import { decisionTools } from "./decision-tool";
import { withLocalAudit } from "./audit-middleware";
import { MONEY_AUDIT_SUMMARIZERS } from "./money-audit-summarizers";

/** Atomic USDC units (6 decimals) at/above which wallet-cdp's
 *  `guardedTransferUsdc` consults the approvals gate. Default: 10 USDC.
 *  Below it CDP's own server-side policy (attached out-of-band via
 *  `applySpendPolicy`) is still the backstop. ROADMAP.md M2-4b/c. */
const DEFAULT_WALLET_APPROVAL_THRESHOLD_ATOMIC = "10000000";

/** Combines this app's two money-moving packages' own sideEffects hooks, so
 *  `enforceRiskPolicy` classifies both correctly (see ROADMAP.md M2-4b's
 *  wallet-cdp and M2-4's treasury). Neither package's tool names overlap. */
function sideEffectsFor(toolName: string): string | undefined {
  return treasurySideEffectsFor(toolName) ?? walletCdpSideEffectsFor(toolName);
}

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

/**
 * Build the full tool set: risk-gated (art. 102: HITL approval + kill
 * switch, see ./governance) and, outside that, audited (every call --
 * successful, tool-level error, or a risk-gate refusal -- appends to the
 * local signed audit log, see ./audit-middleware). Split out from
 * `buildAgent` so it can be exercised directly, without a model: tests
 * drive `registrar_decision.execute(...)` the same way the AI SDK's tool
 * step would, no live model call required (see test/agent-audit-e2e.test.ts).
 */
export async function buildTools(): Promise<ToolSet> {
  // MP + WhatsApp tokens resolve via Vercel Connect (scoped/short-lived) when a
  // connector is configured, else the env token — hence async. See lib/connect.
  const mp = await getMpClient();
  const wa = await getWhatsAppClient();
  const wsfe = getWsfeClient();
  const afip = getAfipPadronAdapter();
  // Wrap the off-ramp so a retried/concurrent convert with the same derived key
  // returns the original receipt instead of double-sending funds (the real PSAV
  // adapters don't all dedupe server-side). In-memory store dedupes within this
  // run; inject a durable KV store for cross-instance idempotency in production.
  const rawOfframp = getOffRamp();
  const offramp = rawOfframp ? withOffRampIdempotency(rawOfframp) : undefined;
  // The society's CDP USDC wallet (ROADMAP.md M2-4c: wires wallet-cdp's
  // guarded transfer into the agent loop, M2-4b's follow-up). undefined
  // when SOCIETY_ID or CDP_API_KEY_ID/CDP_API_KEY_SECRET/CDP_WALLET_SECRET
  // are unset — the tool then degrades to {available:false}. See ./clients.
  const cdpAccount = await getCdpWallet();

  // enforceRiskPolicy is the central art. 102 gate: high-stakes tools defer to
  // an async human approval (queue at ar-agents.ar), a suspended society halts
  // every tool (kill-switch), and read tools pass through. See ./governance.
  const riskGated = enforceRiskPolicy(
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
      ...treasuryTools({ offramp }),
      // Wallet: USDC transfer, two-layer gated (approvals threshold here +
      // CDP's own server-side policy). IRREVERSIBLE, gated by enforceRiskPolicy
      // below same as the off-ramp. ROADMAP.md M2-4b/c.
      ...walletCdpTools({
        ...(cdpAccount ? { account: cdpAccount } : {}),
        thresholdAtomic:
          process.env.WALLET_CDP_APPROVAL_THRESHOLD_ATOMIC?.trim() ||
          DEFAULT_WALLET_APPROVAL_THRESHOLD_ATOMIC,
        approve,
        ...(process.env.CDP_NETWORK?.trim() ? { network: process.env.CDP_NETWORK.trim() } : {}),
      }),
      // The dogfood "one real, visible task" (ROADMAP.md M3-4): needs no
      // client, always available. See ./decision-tool.
      ...decisionTools(),
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
    { approve, isHalted, sideEffectsFor },
  );

  // Outermost: audits every call, including one enforceRiskPolicy refused
  // (a denied/halted attempt is part of the operating history too). See
  // ./audit-middleware for why this is one wrapper, not per-tool code.
  // ROADMAP.md M2-4c: money-moving tools get a structured, cross-leg summary
  // via MONEY_AUDIT_SUMMARIZERS instead of the generic line — see
  // ./money-audit-summarizers.
  return applyToAllTools(riskGated, (name) =>
    withLocalAudit(name, { sideEffectsFor, moneySummarizers: MONEY_AUDIT_SUMMARIZERS }),
  );
}

/**
 * Model selection (ROADMAP.md M3-1 follow-up, the "platform-metered
 * fallback"): an owner-provided Anthropic key (set via studio's credentials
 * wizard as `ANTHROPIC_API_KEY`) wins; without one the agent runs the same
 * model through the Vercel AI Gateway (plain "provider/model" string),
 * which authenticates via `AI_GATEWAY_API_KEY` or the deployment's own
 * Vercel OIDC token. That is the platform-metered default: a fresh society
 * can operate before its owner brings any key, and the platform meters the
 * usage it fronts.
 */
export function selectModel(): LanguageModel {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return anthropic("claude-sonnet-4-5");
  return "anthropic/claude-sonnet-4-5";
}

export async function buildAgent() {
  return new Agent({
    model: selectModel(),
    stopWhen: isStepCount(20),
    instructions: SYSTEM_PROMPT,
    // AI SDK 7 native timeouts. Every tool here hits a slow Argentine upstream
    // (AFIP/ARCA WSAA, MercadoPago, BCRA, IGJ CKAN, Boletín, the USDC->ARS
    // off-ramp). Without a per-tool bound a hung upstream stalls the step until a
    // hard serverless kill; toolMs surfaces a graceful TimeoutError the agent can
    // report instead. totalMs caps the whole multi-step run.
    timeout: { toolMs: 30_000, totalMs: 180_000 },
    tools: await buildTools(),
  });
}
