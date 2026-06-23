/**
 * The agent loop. One Experimental_Agent that composes 8 packages from
 * the @ar-agents/* toolkit.
 *
 * Operating instructions live in `agent/instructions.md` and each
 * capability's playbook in `agent/skills/*.md`. Edit that Markdown to
 * retune the agent (no TypeScript changes needed); this mirrors the eve
 * agent convention, so the sociedad reads as a canonical eve agent on top
 * of an @ar-agents/* governance floor. `next.config.ts` ships those files
 * into the serverless function via `outputFileTracingIncludes`.
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

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Experimental_Agent as Agent, stepCountIs } from "ai";
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

import {
  getMpClient,
  getWhatsAppClient,
  getWsfeClient,
  getAfipPadronAdapter,
} from "./clients";

const AGENT_DIR = join(process.cwd(), "agent");

/**
 * System prompt = agent/instructions.md + agent/skills/*.md (sorted, joined).
 * Markdown is the source of truth; cached after the first read. A missing
 * skills/ directory is fine: instructions.md alone is a valid agent.
 */
let cachedInstructions: string | null = null;
export function loadInstructions(): string {
  if (cachedInstructions !== null) return cachedInstructions;
  const base = readFileSync(join(AGENT_DIR, "instructions.md"), "utf8").trim();
  let skills = "";
  try {
    const dir = join(AGENT_DIR, "skills");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    if (files.length > 0) {
      skills =
        "\n\n# Skills\n\n" +
        files.map((f) => readFileSync(join(dir, f), "utf8").trim()).join("\n\n");
    }
  } catch {
    // No skills/ directory is fine: instructions.md alone is a valid agent.
  }
  cachedInstructions = base + skills;
  return cachedInstructions;
}

export function buildAgent() {
  const mp = getMpClient();
  const wa = getWhatsAppClient();
  const wsfe = getWsfeClient();
  const afip = getAfipPadronAdapter();

  return new Agent({
    // Bare model string routes through the Vercel AI Gateway (spend cap +
    // observability). Needs AI_GATEWAY_API_KEY, or a gateway-enabled team.
    model: "anthropic/claude-sonnet-4-6",
    stopWhen: stepCountIs(20),
    instructions: loadInstructions(),
    tools: {
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
  });
}
