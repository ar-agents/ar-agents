const PACKAGES = [
  {
    name: "@ar-agents/identity",
    version: "0.5.0",
    purpose:
      "AFIP/ARCA CUIT validation + padrón lookup (constancia con monotributo + IVA condition). v0.5 adds production robustez: per-request timeouts, exponential backoff retries, observability hook (`onCall`), and a shared `fetchWithRetry` exported for custom WSAA flows.",
    tools: ["validate_cuit", "lookup_cuit_afip"],
    npm: "https://www.npmjs.com/package/@ar-agents/identity",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/identity",
    demo: "https://ar-agents-cuit-hello.vercel.app",
    bg: "#fef3c7",
    accent: "#d97706",
  },
  {
    name: "@ar-agents/identity-attest",
    version: "0.2.0",
    purpose:
      "RENAPER workaround pattern. Agent orchestrates verification (WhatsApp OTP, email magic-link, Auth0 with MFA step-up, Magic.link, MercadoPago Identity), gets back a signed Attestation with a trust level (0..1). The pattern that didn't exist anywhere.",
    tools: [
      "list_verification_methods",
      "request_identity_verification",
      "submit_otp_code",
      "check_verification_status",
      "get_attestation",
      "5 adapters: WhatsAppOtp / EmailMagicLink / Auth0 / MagicLinkSdk / MercadoPagoIdentity",
    ],
    npm: "https://www.npmjs.com/package/@ar-agents/identity-attest",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/identity-attest",
    demo: null,
    bg: "#fce7f3",
    accent: "#be185d",
  },
  {
    name: "@ar-agents/mercadopago",
    version: "0.9.0",
    purpose:
      "EL agente de Mercado Pago más completo posible (82 tools, 100% del API público de MP). v0.9 = production hardening máxima: circuit breaker con state machine completa (CLOSED/OPEN/HALF_OPEN + rolling failure window), deadline propagation via parent AbortSignal chains, W3C Trace Context propagation (OpenTelemetry-compatible sin peer dep), HMAC webhook verify con replay-attack protection, mp_health_check tool. 223 unit tests + 14 property-based tests (~1400 random scenarios via fast-check) + 11 failure injection tests + integration tests vs MP sandbox real (gated por env var) + benchmarks ejecutables (`pnpm bench`). Edge Runtime ready (Web Crypto, no node:crypto). Vercel KV adapters drop-in. Cookbook con 8 recipes copy-pasteables. **Comparado con Stripe Agent Toolkit**: 82 tools vs 26, circuit breaker (Stripe no tiene), HMAC verify combo (Stripe no tiene), explain_payment_status (Stripe no tiene), property-tested (Stripe no es público).",
    tools: [
      "CircuitBreaker + deadline propagation + W3C Trace Context (NEW v0.9)",
      "mp_health_check tool + property-based tests + integration vs sandbox (NEW v0.9)",
      "Failure injection suite + benchmarks ejecutables (NEW v0.9)",
      "Edge Runtime + Web Crypto + replay protection (v0.8)",
      "Vercel KV subpath: subscription/oauth/idempotency adapters (v0.8)",
      "Cookbook con 8 recipes copy-pasteables (v0.8)",
      "compute_marketplace_fee + explain_payment_status (pure helpers)",
      "handle_webhook (HMAC verify combo + 3DS analyzer)",
      "OAuth Marketplace flow + Order API + Point Devices físicos",
      "+ 71 más (82 total)",
    ],
    npm: "https://www.npmjs.com/package/@ar-agents/mercadopago",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/mercadopago",
    demo: null,
    bg: "#dcfce7",
    accent: "#15803d",
  },
  {
    name: "@ar-agents/whatsapp",
    version: "0.1.0",
    purpose:
      "WhatsApp Business Cloud API — send text/template/media/interactive, webhook parser, AR phone normalizer. Includes auto-retry, timeout, observability hooks.",
    tools: [
      "send_whatsapp_text",
      "send_whatsapp_template",
      "send_whatsapp_media",
      "send_whatsapp_buttons",
      "send_whatsapp_list",
      "mark_whatsapp_read",
    ],
    npm: "https://www.npmjs.com/package/@ar-agents/whatsapp",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/whatsapp",
    demo: "https://ar-agents-whatsapp-hello.vercel.app",
    bg: "#dbeafe",
    accent: "#1d4ed8",
  },
  {
    name: "@ar-agents/banking",
    version: "0.1.0",
    purpose:
      "AR banking primitives: CBU/CVU validation with bank/PSP identification (Galicia, Nación, Mercado Pago, Ualá, Naranja X…), bank/PSP enumeration, and BCRA Central de Deudores credit-situation lookup. Ships a default `BcraPublicApiAdapter` (no auth required) — pure-algorithm tools always work.",
    tools: [
      "validate_cbu",
      "lookup_bank_by_code",
      "list_banks",
      "list_psps",
      "lookup_credit_situation (BCRA)",
    ],
    npm: "https://www.npmjs.com/package/@ar-agents/banking",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/banking",
    demo: null,
    bg: "#fee2e2",
    accent: "#b91c1c",
  },
  {
    name: "@ar-agents/facturacion",
    version: "0.1.0",
    purpose:
      "AFIP/ARCA factura electrónica (WSFE). Emite Factura A/B/C, Notas de Crédito/Débito, FCE MiPyMEs. Reusa la misma X.509 cert que @ar-agents/identity — solo necesitás autorizar el servicio `wsfe` en ARCA. Pre-flight validator local que evita los 10 motivos de rechazo más comunes (ImpTotal mal sumado, IVA inconsistente, Factura C con IVA, servicios sin fechas, etc.) ANTES del round-trip a AFIP.",
    tools: [
      "emitir_factura",
      "consultar_ultimo_comprobante",
      "consultar_factura_emitida",
      "obtener_tipos_comprobante",
      "obtener_alicuotas_iva",
      "obtener_cotizacion",
      "+ 4 más (10 total)",
    ],
    npm: "https://www.npmjs.com/package/@ar-agents/facturacion",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/facturacion",
    demo: null,
    bg: "#fed7aa",
    accent: "#c2410c",
  },
  {
    name: "@ar-agents/shipping",
    version: "0.1.0",
    purpose:
      "Shipping carriers AR (Andreani, OCA, Correo Argentino). 6 tools: cotizar_envio, cotizar_envio_todos (parallel — devuelve cheapest first), crear_envio (con label PDF), trackear_envio (status normalizado cross-carrier), cancelar_envio, listar_sucursales (cerca de un CPA). Pluggable adapter pattern: AndreaniAdapter (cobertura completa REST), OcaAdapter (Tarifador + sucursales — full SOAP en v0.2), CorreoAdapter (cotizar+trackear+sucursales públicos). MockShippingAdapter para dev sin credenciales. Pure helpers: lookupProvincia (24 entries, accent-insensitive) + isValidCPA (legacy + extendido).",
    tools: [
      "cotizar_envio + cotizar_envio_todos (parallel)",
      "crear_envio (con label PDF)",
      "trackear_envio (status normalizado)",
      "cancelar_envio + listar_sucursales",
      "AndreaniAdapter (REST completo)",
      "OcaAdapter + CorreoAdapter + MockShippingAdapter",
    ],
    npm: "https://www.npmjs.com/package/@ar-agents/shipping",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/shipping",
    demo: null,
    bg: "#cffafe",
    accent: "#0e7490",
  },
  {
    name: "@ar-agents/mcp",
    version: "0.4.3",
    purpose:
      "MCP (Model Context Protocol) server que bundlea TODO el toolkit @ar-agents/*. One install en Claude Desktop / Cursor / cualquier MCP host: 7 packages, ~120 tools disponibles inmediatamente. Auto-detecta qué packages habilitar desde env vars.",
    tools: ["bundles all 7 packages above", "auto-detects from env vars", "stdio transport"],
    npm: "https://www.npmjs.com/package/@ar-agents/mcp",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/mcp",
    demo: null,
    bg: "#ede9fe",
    accent: "#6d28d9",
  },
];

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        fontFamily:
          "var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, sans-serif",
        color: "#0a0a0a",
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <header style={{ marginBottom: 48 }}>
          <p
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "#71717a",
              margin: 0,
              fontFamily: "var(--font-geist-mono), monospace",
            }}
          >
            ar-agents · 5 packages live
          </p>
          <h1
            style={{
              fontSize: 48,
              margin: "12px 0 16px",
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            Drop-in tools for Vercel AI SDK
            <br />
            to operate in Argentina.
          </h1>
          <p
            style={{
              color: "#52525b",
              fontSize: 18,
              margin: 0,
              maxWidth: 640,
              lineHeight: 1.5,
            }}
          >
            CUIT validation, AFIP/ARCA padrón lookup, Mercado Pago Subscriptions,
            WhatsApp Business — all wired as agent tools that the LLM picks up
            automatically.
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a
              href="https://github.com/ar-agents/ar-agents"
              style={{
                padding: "10px 20px",
                background: "#0a0a0a",
                color: "white",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              GitHub →
            </a>
            <a
              href="https://www.npmjs.com/org/ar-agents"
              style={{
                padding: "10px 20px",
                border: "1px solid #d4d4d8",
                color: "#0a0a0a",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              npm @ar-agents
            </a>
          </div>
        </header>

        <section style={{ marginBottom: 48 }}>
          <pre
            style={{
              background: "#0a0a0a",
              color: "#fafafa",
              padding: "24px",
              borderRadius: 12,
              overflow: "auto",
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: "var(--font-geist-mono), monospace",
              margin: 0,
            }}
          >{`pnpm add @ar-agents/identity @ar-agents/identity-attest @ar-agents/mercadopago @ar-agents/whatsapp @ar-agents/banking @ar-agents/facturacion @ar-agents/shipping ai zod

import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { identityTools } from "@ar-agents/identity";
import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";
import { AttestationClient, identityAttestTools, WhatsAppOtpAdapter } from "@ar-agents/identity-attest";
import { mercadoPagoTools, MercadoPagoClient, InMemoryStateAdapter } from "@ar-agents/mercadopago";
import { whatsappTools, WhatsAppClient } from "@ar-agents/whatsapp";
import { bankingTools, BcraPublicApiAdapter } from "@ar-agents/banking";
import { facturacionTools, WsfeClient } from "@ar-agents/facturacion";
import { shippingTools, AndreaniAdapter, CorreoAdapter } from "@ar-agents/shipping";

const wa = new WhatsAppClient({...});
const attestation = new AttestationClient({
  signingSecret: process.env.ATTEST_SIGNING_SECRET!,
  adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa }) },
});
const wsfe = new WsfeClient({ certPath: "...", keyPath: "...", cuit: "...", env: "prod" });

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  instructions: "Sos el asistente de e-commerce: cobrás (MP), facturás (AFIP), enviás (Andreani/Correo), notificás (WhatsApp).",
  tools: {
    ...identityTools({ afip: new WsaaWscdcAfipPadronAdapter({...}) }),
    ...identityAttestTools(attestation),
    ...mercadoPagoTools(new MercadoPagoClient({...}), { state: new InMemoryStateAdapter(), backUrl: "...", webhookSecret: "...", oauth: { clientId: "...", clientSecret: "..." } }),
    ...whatsappTools(wa),
    ...bankingTools({ bcra: new BcraPublicApiAdapter() }),
    ...facturacionTools({ wsfe, defaultPtoVta: 1 }),
    ...shippingTools({
      adapters: {
        andreani: new AndreaniAdapter({ username: "...", password: "...", clientNumber: "..." }),
        correo_argentino: new CorreoAdapter(),
      },
      defaultCarrier: "andreani",
    }),
  },
  stopWhen: stepCountIs(10),
});`}</pre>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 24px" }}>
            Packages
          </h2>
          <div style={{ display: "grid", gap: 16 }}>
            {PACKAGES.map((pkg) => (
              <article
                key={pkg.name}
                style={{
                  background: "white",
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  padding: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <h3
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      margin: 0,
                      fontFamily: "var(--font-geist-mono), monospace",
                    }}
                  >
                    {pkg.name}
                  </h3>
                  <span
                    style={{
                      background: pkg.bg,
                      color: pkg.accent,
                      padding: "4px 10px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontWeight: 500,
                    }}
                  >
                    v{pkg.version}
                  </span>
                </div>
                <p
                  style={{
                    color: "#52525b",
                    margin: "12px 0",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {pkg.purpose}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                  {pkg.tools.map((t) => (
                    <code
                      key={t}
                      style={{
                        background: "#f4f4f5",
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        color: "#3f3f46",
                        fontFamily: "var(--font-geist-mono), monospace",
                      }}
                    >
                      {t}
                    </code>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
                  <a href={pkg.npm} style={{ color: "#0a0a0a", textDecoration: "underline" }}>
                    npm
                  </a>
                  <a
                    href={pkg.github}
                    style={{ color: "#0a0a0a", textDecoration: "underline" }}
                  >
                    source
                  </a>
                  {pkg.demo && (
                    <a
                      href={pkg.demo}
                      style={{ color: pkg.accent, textDecoration: "underline" }}
                    >
                      live demo →
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 16px" }}>
            Why this stack
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            {[
              {
                title: "Agent-first docs",
                body: "Every package ships an AGENTS.md alongside README.md — tool selection rules, result schemas, error patterns. The LLM can read it at runtime.",
              },
              {
                title: "Pluggable adapters",
                body: "Pass your own AfipPadronAdapter, SubscriptionStateAdapter, TokenStore. No forced Upstash / Stripe / Firebase dependencies.",
              },
              {
                title: "Errors as docs",
                body: "When a tool fails, the error message tells the user how to fix it. Setup steps, env var names, AFIP service authorizations.",
              },
              {
                title: "Type-safe + tested",
                body: "Dual ESM/CJS, publint + arethetypeswrong all green, 100+ tests across packages, MIT licensed.",
              },
              {
                title: "Real-world tested",
                body: "Live against ARCA prod (full WSAA + WSCDC roundtrip), MP Subscriptions API, WhatsApp Cloud API. Verified end-to-end on Vercel.",
              },
              {
                title: "AR-native",
                body: "Phone normalizer handles every Argentine format, AFIP cert flow documented, Spanish-friendly tool descriptions, error messages in argento.",
              },
            ].map((card) => (
              <div
                key={card.title}
                style={{
                  background: "white",
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
                  {card.title}
                </h3>
                <p style={{ fontSize: 13, color: "#52525b", margin: 0, lineHeight: 1.5 }}>
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 16px" }}>
            Live demo — the toolkit working
          </h2>
          <div
            style={{
              background: "white",
              border: "1px solid #e4e4e7",
              borderRadius: 12,
              padding: 24,
            }}
          >
            <p style={{ fontSize: 14, color: "#52525b", margin: "0 0 16px", lineHeight: 1.6 }}>
              <a
                href="https://ar-agents-whatsapp-hello.vercel.app"
                style={{ color: "#1d4ed8", fontWeight: 500 }}
              >
                ar-agents-whatsapp-hello.vercel.app
              </a>{" "}
              — billing assistant para SaaS argentinos. Combina las 5 libs en un solo agente:
              valida CUIT contra ARCA real, decide trust requirement por monto, gatea cobros
              grandes con verification (WhatsApp OTP), crea suscripciones MP, responde por WhatsApp.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "8px 16px",
                fontSize: 13,
                fontFamily: "var(--font-geist-mono), monospace",
                background: "#fafafa",
                padding: 16,
                borderRadius: 8,
                color: "#3f3f46",
              }}
            >
              <span style={{ color: "#71717a" }}>{"<"} $5k</span>
              <span>cobro directo, sin verification</span>
              <span style={{ color: "#71717a" }}>$5k–$50k</span>
              <span>requiere trust ≥ 0.3 (whatsapp_otp)</span>
              <span style={{ color: "#71717a" }}>$50k–$500k</span>
              <span>requiere trust ≥ 0.5 (email_magic_link / mp_identity)</span>
              <span style={{ color: "#71717a" }}>{"> "}$500k</span>
              <span>requiere trust ≥ 0.7 (auth0 con MFA → 0.85)</span>
            </div>
            <p style={{ fontSize: 12, color: "#71717a", margin: "12px 0 0", lineHeight: 1.5 }}>
              Probalo: pedile "plan Pro mensual ($25.000), CUIT 20-41758101-5". El agente valida el
              CUIT contra ARCA prod, decide que necesita verification, te manda un código (visible
              en el panel mock), pasale el código de vuelta y procede.
            </p>
          </div>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 16px" }}>
            Coming next
          </h2>
          <ul
            style={{
              paddingLeft: 20,
              margin: 0,
              fontSize: 14,
              lineHeight: 1.8,
              color: "#52525b",
            }}
          >
            <li>
              <strong>@ar-agents/identity-attest v0.3</strong> — Cognito + MercadoPago Identity adapters
            </li>
            <li>
              <strong>@ar-agents/shipping v0.2</strong> — OCA E-Pak SOAP completo (crear/trackear/cancelar) + Correo Argentino corporate flow
            </li>
            <li>
              <strong>@ar-agents/banking v0.2</strong> — DEBIN/Coelsa adapters, alias CBU lookup
            </li>
            <li>
              <strong>@ar-agents/facturacion v0.2</strong> — Factura E (exportación), FCE MiPyMEs helpers, retención helpers
            </li>
            <li>
              <strong>@ar-agents/mercadopago v0.8</strong> — Reports API + adjustments (audit trail), advanced subscription analytics
            </li>
          </ul>
        </section>

        <footer
          style={{
            paddingTop: 32,
            borderTop: "1px solid #e4e4e7",
            color: "#71717a",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span>
            MIT — by{" "}
            <a href="https://github.com/naza00000" style={{ color: "#52525b" }}>
              Nazareno Clemente
            </a>
          </span>
          <span>
            <a
              href="https://github.com/ar-agents/ar-agents/issues"
              style={{ color: "#52525b" }}
            >
              report an issue
            </a>
          </span>
        </footer>
      </div>
    </main>
  );
}
