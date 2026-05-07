// Design system: Vercel / Geist.
// - Background #ffffff. Text #171717 / #4d4d4d / #666666.
// - Shadow-as-border instead of CSS borders.
// - Card shadow stack: 0 0 0 1px rgba(0,0,0,0.08), 0 2px 2px rgba(0,0,0,0.04),
//   inner #fafafa 0 0 0 1px (the inner-glow ring).
// - Geist Sans with aggressive negative tracking at display sizes.
// - Three weights only (400/500/600), no 700.
// - Border radius: 6px buttons, 8px cards, 9999px badges.

const PAGE_BG = "#ffffff";
const TEXT_HEADING = "#171717";
const TEXT_BODY = "#4d4d4d";
const TEXT_MUTED = "#666666";
const SURFACE_TINT = "#fafafa";

const SHADOW_BORDER = "rgba(0, 0, 0, 0.08) 0px 0px 0px 1px";
const SHADOW_CARD =
  "rgba(0, 0, 0, 0.08) 0px 0px 0px 1px, rgba(0, 0, 0, 0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px inset";
const SHADOW_RING_LIGHT = "rgb(235, 235, 235) 0px 0px 0px 1px";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const DEPLOY_URL =
  "https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Far-agents%2Far-agents&root-directory=apps%2Fmp-hello&env=MP_ACCESS_TOKEN%2CANTHROPIC_API_KEY%2CUPSTASH_REDIS_REST_URL%2CUPSTASH_REDIS_REST_TOKEN&envDescription=Mercado%20Pago%20access%20token%2C%20Anthropic%20API%20key%2C%20and%20Upstash%20Redis%20credentials.&envLink=https%3A%2F%2Fgithub.com%2Far-agents%2Far-agents%2Ftree%2Fmain%2Fapps%2Fmp-hello%23setup&project-name=mp-hello&repository-name=mp-hello";

const SURFACE_AREAS = [
  "Payments",
  "Subscriptions",
  "Checkout Pro",
  "Marketplace OAuth",
  "Order Management",
  "Customers",
  "Cards",
  "Cuotas",
  "QR",
  "3DS",
  "Point devices",
  "Stores+POS",
  "Account/Balance/Settlements",
  "Webhooks",
  "Disputes",
  "Lookups",
  "Bank Accounts",
];

const OTHER_PACKAGES = [
  {
    name: "@ar-agents/identity",
    version: "0.5.0",
    purpose:
      "CUIT/CUIL validation + AFIP/ARCA padrón lookup (constancia con monotributo + condición IVA). WSAA SOAP via subpath.",
    npm: "https://www.npmjs.com/package/@ar-agents/identity",
    github:
      "https://github.com/ar-agents/ar-agents/tree/main/packages/identity",
    demo: "https://ar-agents-cuit-hello.vercel.app",
  },
  {
    name: "@ar-agents/identity-attest",
    version: "0.4.1",
    purpose:
      "Verification orchestrator (WhatsApp OTP, email magic-link, Auth0, Magic.link, MP Identity). Returns HMAC-signed attestation with a trust level.",
    npm: "https://www.npmjs.com/package/@ar-agents/identity-attest",
    github:
      "https://github.com/ar-agents/ar-agents/tree/main/packages/identity-attest",
    demo: null,
  },
  {
    name: "@ar-agents/whatsapp",
    version: "0.3.0",
    purpose:
      "WhatsApp Business Cloud API. Webhook + HMAC verify. AR phone normalizer. scopedTo mode binds outbound tools to a single sender.",
    npm: "https://www.npmjs.com/package/@ar-agents/whatsapp",
    github:
      "https://github.com/ar-agents/ar-agents/tree/main/packages/whatsapp",
    demo: "https://ar-agents-whatsapp-hello.vercel.app",
  },
  {
    name: "@ar-agents/facturacion",
    version: "0.1.0",
    purpose:
      "AFIP/ARCA factura electrónica (WSFE). Factura A/B/C, NC/ND, FCE MiPyMEs. Local pre-flight validator catches the 10 most common rejection reasons before the round-trip.",
    npm: "https://www.npmjs.com/package/@ar-agents/facturacion",
    github:
      "https://github.com/ar-agents/ar-agents/tree/main/packages/facturacion",
    demo: null,
  },
  {
    name: "@ar-agents/banking",
    version: "0.1.0",
    purpose:
      "CBU/CVU validation with bank/PSP identification (Galicia, Nación, Mercado Pago, Ualá, Naranja X…). BCRA Central de Deudores lookup.",
    npm: "https://www.npmjs.com/package/@ar-agents/banking",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/banking",
    demo: null,
  },
  {
    name: "@ar-agents/shipping",
    version: "0.1.0",
    purpose:
      "Andreani (full REST), OCA, Correo Argentino. cotizar / crear / trackear / cancelar. Provincia + CPA helpers.",
    npm: "https://www.npmjs.com/package/@ar-agents/shipping",
    github:
      "https://github.com/ar-agents/ar-agents/tree/main/packages/shipping",
    demo: null,
  },
  {
    name: "@ar-agents/mcp",
    version: "0.4.9",
    purpose:
      "MCP server bundling all 7 packages. One install in Claude Desktop / Cursor / any MCP host. Auto-detects which packages to enable from env vars.",
    npm: "https://www.npmjs.com/package/@ar-agents/mcp",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/mcp",
    demo: null,
  },
];

const COMPARISON_ROWS: ReadonlyArray<readonly [string, string, string, string]> = [
  ["Vercel AI SDK 6 tool schemas", "✓", "—", "✓ (Stripe)"],
  ["Argentine-specific (cuotas, ARCA, AR phone)", "✓", "partial", "—"],
  ["Tool count", "87", "thin REST", "26 (Stripe)"],
  ["Webhooks: HMAC + dedup + replay window", "✓", "client only", "✓"],
  ["Edge Runtime + Vercel KV adapters", "✓", "Node-only", "optional"],
  ["OpenTelemetry instrumentation", "✓", "—", "—"],
  ["Deterministic idempotency by default", "✓", "—", "—"],
  ["Programmatic HITL on irreversible ops", "✓", "—", "—"],
  ["MercadoPago coverage", "full", "full", "n/a"],
];

const QUICK_START = `pnpm add @ar-agents/mercadopago ai zod

import { Experimental_Agent as Agent, stepCountIs } from "ai";
import {
  MercadoPagoClient,
  mercadoPagoTools,
  InMemoryStateAdapter,
} from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!, // TEST- for sandbox, APP_USR- for prod
});

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: mercadoPagoTools(mp, {
    state: new InMemoryStateAdapter(), // swap for VercelKVStateAdapter in prod
    backUrl: "https://yoursite.com/subscription/done",
  }),
  stopWhen: stepCountIs(8),
});

const { text } = await agent.generate({
  prompt: "Creá una subscription mensual de $1000 ARS para customer@example.com.",
});`;

const WHATS_IN: ReadonlyArray<readonly [string, string]> = [
  [
    "Subscriptions",
    "create / get / pause / resume / cancel · plans · saved cards",
  ],
  [
    "Payments",
    "create / capture / refund · OAuth marketplace · Checkout Pro · Order Management",
  ],
  [
    "Cuotas",
    "AR issuer-promo catalog · installments · 3DS challenge resolution",
  ],
  [
    "QR + Point",
    "in-store QR · physical Point devices · Stores + POS",
  ],
  [
    "Webhooks",
    "HMAC verification · replay window · deduplication · handle_webhook combo",
  ],
  [
    "State",
    "InMemory + Vercel KV adapters out of the box · pluggable interface",
  ],
  [
    "Observability",
    "OpenTelemetry traces via subpath · audit log adapter · circuit breaker",
  ],
  [
    "Safety",
    "deterministic idempotency by default · programmatic HITL on 8 irreversible ops",
  ],
];

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: PAGE_BG,
        fontFamily: FONT_SANS,
        color: TEXT_HEADING,
        padding: "80px 24px 120px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        {/* HERO */}
        <header style={{ marginBottom: 80 }}>
          <p
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: TEXT_MUTED,
              margin: 0,
              fontFamily: FONT_MONO,
              fontWeight: 500,
              fontFeatureSettings: '"liga", "tnum"',
            }}
          >
            @ar-agents/mercadopago · v0.15.1
          </p>
          <h1
            style={{
              fontSize: 56,
              margin: "16px 0 20px",
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: "-2.88px",
              color: TEXT_HEADING,
            }}
          >
            Mercado Pago Agent Toolkit.
            <br />
            Built on Vercel.
          </h1>
          <p
            style={{
              color: TEXT_BODY,
              fontSize: 20,
              margin: "0 0 16px",
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            87 typed tools across the agent-relevant Mercado Pago API surface, for
            the Vercel AI SDK 6{" "}
            <code style={{ fontFamily: FONT_MONO, fontSize: 18 }}>
              Experimental_Agent
            </code>
            . Edge Runtime, Vercel KV adapters, OpenTelemetry, deterministic
            idempotency, programmatic HITL on irreversible operations.
          </p>
          <p
            style={{
              color: TEXT_MUTED,
              fontSize: 13,
              margin: 0,
              maxWidth: 720,
              lineHeight: 1.7,
              fontFamily: FONT_MONO,
            }}
          >
            {SURFACE_AREAS.join(" · ")}
          </p>
          <div
            style={{
              marginTop: 32,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <a
              href="https://github.com/ar-agents/ar-agents/tree/main/packages/mercadopago"
              style={{
                padding: "8px 16px",
                background: TEXT_HEADING,
                color: PAGE_BG,
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                lineHeight: 1.43,
              }}
            >
              GitHub →
            </a>
            <a
              href="https://www.npmjs.com/package/@ar-agents/mercadopago"
              style={{
                padding: "8px 16px",
                background: PAGE_BG,
                color: TEXT_HEADING,
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                lineHeight: 1.43,
                boxShadow: SHADOW_RING_LIGHT,
              }}
            >
              npm
            </a>
            <a
              href="https://github.com/ar-agents/ar-agents/tree/main/packages/mercadopago/cookbook"
              style={{
                padding: "8px 16px",
                background: PAGE_BG,
                color: TEXT_HEADING,
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                lineHeight: 1.43,
                boxShadow: SHADOW_RING_LIGHT,
              }}
            >
              Cookbook (9 recipes)
            </a>
            <a
              href={DEPLOY_URL}
              style={{
                padding: "8px 16px",
                background: TEXT_HEADING,
                color: PAGE_BG,
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                lineHeight: 1.43,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <svg
                width="13"
                height="11"
                viewBox="0 0 1155 1000"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="m577.3 0 577.4 1000H0z" />
              </svg>
              Deploy on Vercel
            </a>
          </div>
        </header>

        {/* QUICK START */}
        <section style={{ marginBottom: 80 }}>
          <pre
            style={{
              background: TEXT_HEADING,
              color: PAGE_BG,
              padding: 24,
              borderRadius: 8,
              overflow: "auto",
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: FONT_MONO,
              margin: 0,
              boxShadow: SHADOW_BORDER,
            }}
          >
            {QUICK_START}
          </pre>
        </section>

        {/* COMPARISON */}
        <section style={{ marginBottom: 80 }}>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 600,
              margin: "0 0 24px",
              letterSpacing: "-1.28px",
              lineHeight: 1.2,
              color: TEXT_HEADING,
            }}
          >
            How it compares
          </h2>
          <div
            style={{
              background: PAGE_BG,
              borderRadius: 8,
              padding: 0,
              overflow: "auto",
              boxShadow: SHADOW_CARD,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead style={{ background: SURFACE_TINT }}>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: 14,
                      fontWeight: 600,
                      color: TEXT_HEADING,
                      letterSpacing: "-0.32px",
                      boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.08)",
                    }}
                  >
                    Feature
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: 14,
                      fontWeight: 600,
                      color: TEXT_HEADING,
                      fontFamily: FONT_MONO,
                      fontSize: 12,
                      boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.08)",
                    }}
                  >
                    @ar-agents
                    <br />
                    <span style={{ fontSize: 11, fontWeight: 400, color: TEXT_MUTED }}>
                      /mercadopago
                    </span>
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: 14,
                      fontWeight: 500,
                      color: TEXT_BODY,
                      fontFamily: FONT_MONO,
                      fontSize: 12,
                      boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.08)",
                    }}
                  >
                    mercadopago
                    <br />
                    <span style={{ fontSize: 11, fontWeight: 400, color: TEXT_MUTED }}>
                      (official)
                    </span>
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: 14,
                      fontWeight: 500,
                      color: TEXT_BODY,
                      fontFamily: FONT_MONO,
                      fontSize: 12,
                      boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.08)",
                    }}
                  >
                    Stripe Agent
                    <br />
                    <span style={{ fontSize: 11, fontWeight: 400, color: TEXT_MUTED }}>
                      Toolkit
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map(([feature, ours, mp, stripe], idx) => (
                  <tr
                    key={feature}
                    style={{
                      boxShadow:
                        idx < COMPARISON_ROWS.length - 1
                          ? "inset 0 -1px 0 rgba(0,0,0,0.04)"
                          : "none",
                    }}
                  >
                    <td
                      style={{
                        padding: "12px 14px",
                        color: TEXT_HEADING,
                        fontWeight: 500,
                      }}
                    >
                      {feature}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        textAlign: "center",
                        color: TEXT_HEADING,
                        fontWeight: 600,
                        fontFamily: FONT_MONO,
                        fontSize: 13,
                      }}
                    >
                      {ours}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        textAlign: "center",
                        color: TEXT_MUTED,
                        fontFamily: FONT_MONO,
                        fontSize: 13,
                      }}
                    >
                      {mp}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        textAlign: "center",
                        color: TEXT_MUTED,
                        fontFamily: FONT_MONO,
                        fontSize: 13,
                      }}
                    >
                      {stripe}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p
            style={{
              fontSize: 13,
              color: TEXT_MUTED,
              margin: "16px 0 0",
              lineHeight: 1.6,
            }}
          >
            Both official SDKs are excellent at what they do — generic REST clients
            for their respective APIs.{" "}
            <code style={{ fontFamily: FONT_MONO, color: TEXT_BODY }}>
              @ar-agents/mercadopago
            </code>{" "}
            is opinionated for the agent-operating-an-Argentine-business case, and
            composes with{" "}
            <code style={{ fontFamily: FONT_MONO, color: TEXT_BODY }}>
              mercadopago
            </code>{" "}
            under the hood when needed. See{" "}
            <a
              href="https://github.com/ar-agents/ar-agents/blob/main/packages/mercadopago/MIGRATION.md"
              style={{ color: "#0072f5", textDecoration: "underline" }}
            >
              MIGRATION.md
            </a>
            .
          </p>
        </section>

        {/* WHAT'S IN THE BOX */}
        <section style={{ marginBottom: 80 }}>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 600,
              margin: "0 0 24px",
              letterSpacing: "-1.28px",
              lineHeight: 1.2,
              color: TEXT_HEADING,
            }}
          >
            What&apos;s in the box
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {WHATS_IN.map(([title, body]) => (
              <div
                key={title}
                style={{
                  background: PAGE_BG,
                  borderRadius: 8,
                  padding: 20,
                  boxShadow: SHADOW_CARD,
                }}
              >
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    margin: "0 0 6px",
                    letterSpacing: "-0.32px",
                    color: TEXT_HEADING,
                  }}
                >
                  {title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: TEXT_BODY,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* OTHER PRIMITIVES */}
        <section style={{ marginBottom: 80 }}>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 600,
              margin: "0 0 8px",
              letterSpacing: "-1.28px",
              lineHeight: 1.2,
              color: TEXT_HEADING,
            }}
          >
            Other AR primitives in this monorepo
          </h2>
          <p
            style={{
              color: TEXT_BODY,
              fontSize: 16,
              margin: "0 0 32px",
              lineHeight: 1.6,
              maxWidth: 720,
            }}
          >
            Same approach, applied to the rest of the stack an Argentine business
            needs. Each ships independently to npm and composes with{" "}
            <code style={{ fontFamily: FONT_MONO, color: TEXT_HEADING }}>
              @ar-agents/mercadopago
            </code>
            .
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {OTHER_PACKAGES.map((pkg) => (
              <article
                key={pkg.name}
                style={{
                  background: PAGE_BG,
                  borderRadius: 8,
                  padding: 20,
                  boxShadow: SHADOW_CARD,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      margin: 0,
                      fontFamily: FONT_MONO,
                      letterSpacing: 0,
                      color: TEXT_HEADING,
                    }}
                  >
                    {pkg.name}
                  </h3>
                  <span
                    style={{
                      background: "#ebf5ff",
                      color: "#0068d6",
                      padding: "0 10px",
                      borderRadius: 9999,
                      fontSize: 12,
                      fontFamily: FONT_MONO,
                      fontWeight: 500,
                      lineHeight: 1.7,
                    }}
                  >
                    v{pkg.version}
                  </span>
                </div>
                <p
                  style={{
                    color: TEXT_BODY,
                    margin: "0 0 12px",
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                >
                  {pkg.purpose}
                </p>
                <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
                  <a
                    href={pkg.npm}
                    style={{ color: TEXT_HEADING, textDecoration: "underline" }}
                  >
                    npm
                  </a>
                  <a
                    href={pkg.github}
                    style={{ color: TEXT_HEADING, textDecoration: "underline" }}
                  >
                    source
                  </a>
                  {pkg.demo && (
                    <a
                      href={pkg.demo}
                      style={{ color: "#0072f5", textDecoration: "underline" }}
                    >
                      live demo →
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* COMPOSITION EXAMPLE */}
        <section style={{ marginBottom: 80 }}>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 600,
              margin: "0 0 24px",
              letterSpacing: "-1.28px",
              lineHeight: 1.2,
              color: TEXT_HEADING,
            }}
          >
            Composition example — billing assistant
          </h2>
          <div
            style={{
              background: PAGE_BG,
              borderRadius: 8,
              padding: 24,
              boxShadow: SHADOW_CARD,
            }}
          >
            <p
              style={{
                fontSize: 15,
                color: TEXT_BODY,
                margin: "0 0 16px",
                lineHeight: 1.6,
              }}
            >
              <a
                href="https://ar-agents-whatsapp-hello.vercel.app"
                style={{ color: "#0072f5", fontWeight: 500, textDecoration: "underline" }}
              >
                ar-agents-whatsapp-hello.vercel.app
              </a>{" "}
              shows MP composing with identity, identity-attest, and whatsapp in a
              single agent. Validates CUIT against ARCA, gates large charges with
              verification (WhatsApp OTP), creates the MP subscription, replies on
              WhatsApp.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "8px 16px",
                fontSize: 13,
                fontFamily: FONT_MONO,
                background: SURFACE_TINT,
                padding: 16,
                borderRadius: 6,
                color: TEXT_BODY,
                boxShadow: SHADOW_BORDER,
              }}
            >
              <span style={{ color: TEXT_MUTED }}>{"<"} $5k</span>
              <span>direct charge, no verification</span>
              <span style={{ color: TEXT_MUTED }}>$5k–$50k</span>
              <span>requires trust ≥ 0.3 (whatsapp_otp)</span>
              <span style={{ color: TEXT_MUTED }}>$50k–$500k</span>
              <span>requires trust ≥ 0.5 (email_magic_link / mp_identity)</span>
              <span style={{ color: TEXT_MUTED }}>{"> "}$500k</span>
              <span>requires trust ≥ 0.7 (auth0 with MFA → 0.85)</span>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer
          style={{
            paddingTop: 40,
            color: TEXT_MUTED,
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            boxShadow: "inset 0 1px 0 rgba(0,0,0,0.08)",
          }}
        >
          <span>
            MIT — by{" "}
            <a
              href="https://github.com/naza00000"
              style={{ color: TEXT_BODY, textDecoration: "underline" }}
            >
              Nazareno Clemente
            </a>
          </span>
          <span>
            <a
              href="https://github.com/ar-agents/ar-agents/issues"
              style={{ color: TEXT_BODY, textDecoration: "underline" }}
            >
              report an issue
            </a>
          </span>
        </footer>
      </div>
    </main>
  );
}
