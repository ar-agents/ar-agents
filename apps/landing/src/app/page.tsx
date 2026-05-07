// Design system: Vercel / Geist with light + dark CSS-var themes.
// All colors come from globals.css custom properties so the theme toggle
// can flip the palette without re-rendering. Accent is #2F3476 (light) /
// #8a91d4 (dark, lightened for legibility).

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const DEPLOY_URL =
  "https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Far-agents%2Far-agents&root-directory=apps%2Fmp-hello&env=MP_ACCESS_TOKEN%2CANTHROPIC_API_KEY%2CUPSTASH_REDIS_REST_URL%2CUPSTASH_REDIS_REST_TOKEN&envDescription=Mercado%20Pago%20access%20token%2C%20Anthropic%20API%20key%2C%20and%20Upstash%20Redis%20credentials.&envLink=https%3A%2F%2Fgithub.com%2Far-agents%2Far-agents%2Ftree%2Fmain%2Fapps%2Fmp-hello%23setup&project-name=mp-hello&repository-name=mp-hello";

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
  ["Vercel AI SDK 6 tool schemas", "✓", "no", "✓ (Stripe)"],
  ["Argentine-specific (cuotas, ARCA, AR phone)", "✓", "partial", "no"],
  ["Tool count", "89", "thin REST", "26 (Stripe)"],
  ["Webhooks: HMAC + dedup + replay window", "✓", "client only", "✓"],
  ["Edge Runtime + Vercel KV adapters", "✓", "Node-only", "optional"],
  ["OpenTelemetry instrumentation", "✓", "no", "no"],
  ["Deterministic idempotency by default", "✓", "no", "no"],
  ["Programmatic HITL on irreversible ops", "✓", "no", "no"],
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
    "Payments",
    "create / capture / refund · OAuth marketplace · Checkout Pro · Order Management",
  ],
  [
    "Subscriptions",
    "create / get / pause / resume / cancel · plans · saved cards",
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
        background: "var(--bg)",
        fontFamily: FONT_SANS,
        color: "var(--text)",
        padding: "80px 24px 120px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        {/* HERO */}
        <header style={{ marginBottom: 48 }}>
          <p
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--text-muted)",
              margin: 0,
              fontFamily: FONT_MONO,
              fontWeight: 500,
              fontFeatureSettings: '"liga", "tnum"',
            }}
          >
            @ar-agents/mercadopago · v0.15.2
          </p>
          <h1
            style={{
              fontSize: 56,
              margin: "16px 0 20px",
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: "-2.88px",
              color: "var(--text)",
            }}
          >
            Mercado Pago Agent Toolkit.
            <br />
            Built on Vercel.
          </h1>
          <p
            style={{
              color: "var(--text-body)",
              fontSize: 20,
              margin: 0,
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            Drop Mercado Pago into your AI agent. The whole API, with
            idempotency, retries, observability, and human-in-the-loop
            guardrails on irreversible operations.
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
              href={DEPLOY_URL}
              style={{
                padding: "8px 16px",
                background: "var(--primary-bg)",
                color: "var(--primary-text)",
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
            <a
              href="https://github.com/ar-agents/ar-agents/tree/main/packages/mercadopago"
              style={{
                padding: "8px 16px",
                background: "var(--primary-bg)",
                color: "var(--primary-text)",
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
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/@ar-agents/mercadopago"
              style={{
                padding: "8px 16px",
                background: "var(--bg)",
                color: "var(--text)",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                lineHeight: 1.43,
                boxShadow: "var(--shadow-ring-light)",
              }}
            >
              npm
            </a>
            <a
              href="https://github.com/ar-agents/ar-agents/tree/main/packages/mercadopago/cookbook"
              style={{
                padding: "8px 16px",
                background: "var(--bg)",
                color: "var(--text)",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                lineHeight: 1.43,
                boxShadow: "var(--shadow-ring-light)",
              }}
            >
              Cookbook (9 recipes)
            </a>
          </div>
        </header>

        {/* QUICK START */}
        <section style={{ marginBottom: 80 }}>
          <pre
            style={{
              background: "var(--code-bg)",
              color: "var(--code-text)",
              padding: 24,
              borderRadius: 8,
              overflow: "auto",
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: FONT_MONO,
              margin: 0,
              boxShadow: "var(--shadow-border)",
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
              color: "var(--text)",
            }}
          >
            How it compares
          </h2>
          <div
            style={{
              background: "var(--bg)",
              borderRadius: 8,
              padding: 0,
              overflow: "auto",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead style={{ background: "var(--bg-tint)" }}>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: 14,
                      fontWeight: 600,
                      color: "var(--text)",
                      letterSpacing: "-0.32px",
                      boxShadow: "inset 0 -1px 0 var(--border-color)",
                    }}
                  >
                    Feature
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: 14,
                      fontWeight: 600,
                      color: "var(--text)",
                      fontFamily: FONT_MONO,
                      fontSize: 12,
                      boxShadow: "inset 0 -1px 0 var(--border-color)",
                    }}
                  >
                    @ar-agents
                    <br />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 400,
                        color: "var(--text-muted)",
                      }}
                    >
                      /mercadopago
                    </span>
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: 14,
                      fontWeight: 500,
                      color: "var(--text-body)",
                      fontFamily: FONT_MONO,
                      fontSize: 12,
                      boxShadow: "inset 0 -1px 0 var(--border-color)",
                    }}
                  >
                    mercadopago
                    <br />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 400,
                        color: "var(--text-muted)",
                      }}
                    >
                      (official)
                    </span>
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: 14,
                      fontWeight: 500,
                      color: "var(--text-body)",
                      fontFamily: FONT_MONO,
                      fontSize: 12,
                      boxShadow: "inset 0 -1px 0 var(--border-color)",
                    }}
                  >
                    Stripe Agent
                    <br />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 400,
                        color: "var(--text-muted)",
                      }}
                    >
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
                          ? "inset 0 -1px 0 var(--border-color)"
                          : "none",
                    }}
                  >
                    <td
                      style={{
                        padding: "12px 14px",
                        color: "var(--text)",
                        fontWeight: 500,
                      }}
                    >
                      {feature}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        textAlign: "center",
                        color: "var(--text)",
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
                        color: "var(--text-muted)",
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
                        color: "var(--text-muted)",
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
              color: "var(--text)",
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
                  background: "var(--bg)",
                  borderRadius: 8,
                  padding: 20,
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    margin: "0 0 6px",
                    letterSpacing: "-0.32px",
                    color: "var(--text)",
                  }}
                >
                  {title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: "var(--text-body)",
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
              color: "var(--text)",
            }}
          >
            Other AR primitives in this monorepo
          </h2>
          <p
            style={{
              color: "var(--text-body)",
              fontSize: 16,
              margin: "0 0 32px",
              lineHeight: 1.6,
              maxWidth: 720,
            }}
          >
            Same approach, applied to the rest of the stack an Argentine business
            needs. Each ships independently to npm and composes with{" "}
            <code style={{ fontFamily: FONT_MONO, color: "var(--text)" }}>
              @ar-agents/mercadopago
            </code>
            .
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {OTHER_PACKAGES.map((pkg) => (
              <article
                key={pkg.name}
                style={{
                  background: "var(--bg)",
                  borderRadius: 8,
                  padding: 20,
                  boxShadow: "var(--card-shadow)",
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
                      color: "var(--text)",
                    }}
                  >
                    {pkg.name}
                  </h3>
                  <span
                    style={{
                      background: "var(--accent-bg)",
                      color: "var(--accent-text)",
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
                    color: "var(--text-body)",
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
                    style={{
                      color: "var(--text)",
                      textDecoration: "underline",
                    }}
                  >
                    npm
                  </a>
                  <a
                    href={pkg.github}
                    style={{
                      color: "var(--text)",
                      textDecoration: "underline",
                    }}
                  >
                    source
                  </a>
                  {pkg.demo && (
                    <a
                      href={pkg.demo}
                      style={{
                        color: "var(--accent)",
                        textDecoration: "underline",
                      }}
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
              color: "var(--text)",
            }}
          >
            Composition example: billing assistant
          </h2>
          <div
            style={{
              background: "var(--bg)",
              borderRadius: 8,
              padding: 24,
              boxShadow: "var(--card-shadow)",
            }}
          >
            <p
              style={{
                fontSize: 15,
                color: "var(--text-body)",
                margin: "0 0 16px",
                lineHeight: 1.6,
              }}
            >
              <a
                href="https://ar-agents-whatsapp-hello.vercel.app"
                style={{
                  color: "var(--accent)",
                  fontWeight: 500,
                  textDecoration: "underline",
                }}
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
                background: "var(--bg-tint)",
                padding: 16,
                borderRadius: 6,
                color: "var(--text-body)",
                boxShadow: "var(--shadow-border)",
              }}
            >
              <span style={{ color: "var(--text-muted)" }}>{"<"} $5k</span>
              <span>direct charge, no verification</span>
              <span style={{ color: "var(--text-muted)" }}>$5k–$50k</span>
              <span>requires trust ≥ 0.3 (whatsapp_otp)</span>
              <span style={{ color: "var(--text-muted)" }}>$50k–$500k</span>
              <span>requires trust ≥ 0.5 (email_magic_link / mp_identity)</span>
              <span style={{ color: "var(--text-muted)" }}>{"> "}$500k</span>
              <span>requires trust ≥ 0.7 (auth0 with MFA → 0.85)</span>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer
          style={{
            paddingTop: 40,
            color: "var(--text-muted)",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            boxShadow: "inset 0 1px 0 var(--border-color)",
          }}
        >
          <span>
            MIT ·{" "}
            <a
              href="https://github.com/naza00000"
              style={{
                color: "var(--text-body)",
                textDecoration: "underline",
              }}
            >
              Nazareno Clemente
            </a>
          </span>
          <span>
            <a
              href="https://github.com/ar-agents/ar-agents/issues"
              style={{
                color: "var(--text-body)",
                textDecoration: "underline",
              }}
            >
              report an issue
            </a>
          </span>
        </footer>
      </div>
    </main>
  );
}
