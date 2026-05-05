const PACKAGES = [
  {
    name: "@ar-agents/identity",
    version: "0.4.0",
    purpose:
      "AFIP/ARCA CUIT validation + padrón lookup (constancia con monotributo + IVA condition).",
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
    version: "0.3.0",
    purpose:
      "Mercado Pago full agent toolkit: Payments + Checkout Pro + Customers + Cards + Refunds + Cuotas + Subscriptions + Saved-card charging + In-store QR + Webhooks. Auto-retry, deterministic idempotency, observability hooks. The Stripe Agent Toolkit equivalent for MP.",
    tools: [
      "create_payment_preference",
      "create_payment",
      "charge_saved_card",
      "create_qr_payment",
      "calculate_installments",
      "refund_payment",
      "create_customer",
      "create_subscription",
      "+ 16 more (24 total)",
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
    name: "@ar-agents/mcp",
    version: "0.1.0",
    purpose:
      "MCP (Model Context Protocol) server that bundles the entire @ar-agents/* toolkit. One install in Claude Desktop / Cursor / any MCP host, up to 34 tools available immediately.",
    tools: ["bundles all 4 packages above", "auto-detects from env vars", "stdio transport"],
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
          >{`pnpm add @ar-agents/identity @ar-agents/identity-attest @ar-agents/mercadopago @ar-agents/whatsapp ai zod

import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { identityTools } from "@ar-agents/identity";
import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";
import { AttestationClient, identityAttestTools, WhatsAppOtpAdapter } from "@ar-agents/identity-attest";
import { mercadoPagoTools, MercadoPagoClient, InMemoryStateAdapter } from "@ar-agents/mercadopago";
import { whatsappTools, WhatsAppClient } from "@ar-agents/whatsapp";

const wa = new WhatsAppClient({...});
const attestation = new AttestationClient({
  signingSecret: process.env.ATTEST_SIGNING_SECRET!,
  adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa }) },
});

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  instructions: "Sos el asistente de billing. Para cobros > $20k requerís trust >= 0.5...",
  tools: {
    ...identityTools({ afip: new WsaaWscdcAfipPadronAdapter({...}) }),
    ...identityAttestTools(attestation),
    ...mercadoPagoTools(new MercadoPagoClient({...}), { state: new InMemoryStateAdapter(), backUrl: "..." }),
    ...whatsappTools(wa),
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
              <strong>@ar-agents/identity-attest v0.2</strong> — Auth0 + Cognito + MercadoPago Identity adapters
            </li>
            <li>
              <strong>@ar-agents/facturacion</strong> — AFIP factura electrónica (WSFE)
            </li>
            <li>
              <strong>@ar-agents/shipping</strong> — Andreani / OCA / Correo Argentino
            </li>
            <li>
              <strong>@ar-agents/banking</strong> — CBU/CVU validation, DEBIN
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
