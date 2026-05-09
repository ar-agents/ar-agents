"use client";

// Design system: Vercel / Geist with light + dark CSS-var themes.
// All colors come from globals.css custom properties so the theme toggle
// can flip the palette without re-rendering.
//
// `use client` is required because the hero "Try it with a live agent"
// button toggles the LiveChat panel that renders above the scripted demo.

import { useCallback, useState } from "react";
import { DemoTerminal } from "./demo-terminal";
import { useLang, type Translations } from "./i18n";
import { LiveChat } from "./live-chat";
import { HomeJsonLd } from "./json-ld";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const DEPLOY_URL =
  "https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Far-agents%2Far-agents&root-directory=apps%2Fmp-hello&env=MP_ACCESS_TOKEN%2CANTHROPIC_API_KEY%2CUPSTASH_REDIS_REST_URL%2CUPSTASH_REDIS_REST_TOKEN&envDescription=Mercado%20Pago%20access%20token%2C%20Anthropic%20API%20key%2C%20and%20Upstash%20Redis%20credentials.&envLink=https%3A%2F%2Fgithub.com%2Far-agents%2Far-agents%2Ftree%2Fmain%2Fapps%2Fmp-hello%23setup&project-name=mp-hello&repository-name=mp-hello";

type Pkg = {
  name: string;
  version: string;
  purposeKey: keyof Translations;
  npm: string;
  github: string;
  demo: string | null;
};

const OTHER_PACKAGES: ReadonlyArray<Pkg> = [
  {
    name: "@ar-agents/identity",
    version: "0.5.1",
    purposeKey: "pp_identity",
    npm: "https://www.npmjs.com/package/@ar-agents/identity",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/identity",
    demo: "https://ar-agents-cuit-hello.vercel.app",
  },
  {
    name: "@ar-agents/mi-argentina",
    version: "0.1.0",
    purposeKey: "pp_mi_argentina",
    npm: "https://www.npmjs.com/package/@ar-agents/mi-argentina",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/mi-argentina",
    demo: null,
  },
  {
    name: "@ar-agents/identity-attest",
    version: "0.4.2",
    purposeKey: "pp_identity_attest",
    npm: "https://www.npmjs.com/package/@ar-agents/identity-attest",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/identity-attest",
    demo: null,
  },
  {
    name: "@ar-agents/whatsapp",
    version: "0.3.0",
    purposeKey: "pp_whatsapp",
    npm: "https://www.npmjs.com/package/@ar-agents/whatsapp",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/whatsapp",
    demo: "https://ar-agents-whatsapp-hello.vercel.app",
  },
  {
    name: "@ar-agents/facturacion",
    version: "0.1.1",
    purposeKey: "pp_facturacion",
    npm: "https://www.npmjs.com/package/@ar-agents/facturacion",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/facturacion",
    demo: null,
  },
  {
    name: "@ar-agents/banking",
    version: "0.2.0",
    purposeKey: "pp_banking",
    npm: "https://www.npmjs.com/package/@ar-agents/banking",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/banking",
    demo: null,
  },
  {
    name: "@ar-agents/boletin-oficial",
    version: "0.1.0",
    purposeKey: "pp_boletin_oficial",
    npm: "https://www.npmjs.com/package/@ar-agents/boletin-oficial",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/boletin-oficial",
    demo: null,
  },
  {
    name: "@ar-agents/igj",
    version: "0.1.0",
    purposeKey: "pp_igj",
    npm: "https://www.npmjs.com/package/@ar-agents/igj",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/igj",
    demo: null,
  },
  {
    name: "@ar-agents/firma-digital",
    version: "0.1.0",
    purposeKey: "pp_firma_digital",
    npm: "https://www.npmjs.com/package/@ar-agents/firma-digital",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/firma-digital",
    demo: null,
  },
  {
    name: "@ar-agents/shipping",
    version: "0.1.1",
    purposeKey: "pp_shipping",
    npm: "https://www.npmjs.com/package/@ar-agents/shipping",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/shipping",
    demo: null,
  },
  {
    name: "@ar-agents/mcp",
    version: "0.6.0",
    purposeKey: "pp_mcp",
    npm: "https://www.npmjs.com/package/@ar-agents/mcp",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/mcp",
    demo: null,
  },
];

type RowKey =
  | "compare_row_schemas"
  | "compare_row_ar"
  | "compare_row_tools"
  | "compare_row_webhooks"
  | "compare_row_edge"
  | "compare_row_otel"
  | "compare_row_idem"
  | "compare_row_hitl"
  | "compare_row_coverage";

type CellKey = keyof Translations | "✓" | "—" | "$" | "raw";
type Cell = { key: CellKey; raw?: string };

const COMPARISON_ROWS: ReadonlyArray<{
  label: RowKey;
  ours: Cell;
  official: Cell;
  stripe: Cell;
}> = [
  {
    label: "compare_row_schemas",
    ours: { key: "✓" },
    official: { key: "compare_no" },
    stripe: { key: "raw", raw: "✓ (Stripe)" },
  },
  {
    label: "compare_row_ar",
    ours: { key: "✓" },
    official: { key: "compare_partial" },
    stripe: { key: "compare_no" },
  },
  {
    label: "compare_row_tools",
    ours: { key: "raw", raw: "89" },
    official: { key: "compare_thin" },
    stripe: { key: "raw", raw: "26 (Stripe)" },
  },
  {
    label: "compare_row_webhooks",
    ours: { key: "✓" },
    official: { key: "compare_client_only" },
    stripe: { key: "✓" },
  },
  {
    label: "compare_row_edge",
    ours: { key: "✓" },
    official: { key: "compare_node_only" },
    stripe: { key: "compare_optional" },
  },
  {
    label: "compare_row_otel",
    ours: { key: "✓" },
    official: { key: "compare_no" },
    stripe: { key: "compare_no" },
  },
  {
    label: "compare_row_idem",
    ours: { key: "✓" },
    official: { key: "compare_no" },
    stripe: { key: "compare_no" },
  },
  {
    label: "compare_row_hitl",
    ours: { key: "✓" },
    official: { key: "compare_no" },
    stripe: { key: "compare_no" },
  },
  {
    label: "compare_row_coverage",
    ours: { key: "compare_full" },
    official: { key: "compare_full" },
    stripe: { key: "raw", raw: "n/a" },
  },
];

function cellText(cell: Cell, t: Translations): string {
  if (cell.key === "raw") return cell.raw ?? "";
  if (cell.key === "✓" || cell.key === "—" || cell.key === "$") return cell.key;
  return t[cell.key as keyof Translations];
}

type WhatsRow = {
  titleKey: keyof Translations;
  bodyKey: keyof Translations;
};

const WHATS_IN: ReadonlyArray<WhatsRow> = [
  { titleKey: "whats_payments_t", bodyKey: "whats_payments_d" },
  { titleKey: "whats_subs_t", bodyKey: "whats_subs_d" },
  { titleKey: "whats_cuotas_t", bodyKey: "whats_cuotas_d" },
  { titleKey: "whats_qrpoint_t", bodyKey: "whats_qrpoint_d" },
  { titleKey: "whats_webhooks_t", bodyKey: "whats_webhooks_d" },
  { titleKey: "whats_state_t", bodyKey: "whats_state_d" },
  { titleKey: "whats_obs_t", bodyKey: "whats_obs_d" },
  { titleKey: "whats_safety_t", bodyKey: "whats_safety_d" },
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

export default function Home() {
  const { t, lang } = useLang();
  const [liveOpen, setLiveOpen] = useState(false);
  const toggleLive = useCallback(() => setLiveOpen((v) => !v), []);
  const closeLive = useCallback(() => setLiveOpen(false), []);

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
        {/* /ARG BANNER — the umbrella brand. The MP toolkit below is the
            flagship; manifesto / sociedades-ia / rfc-001 link to the
            broader narrative pages. */}
        <section
          aria-label={t.arg_banner_eyebrow}
          style={{
            marginBottom: 32,
            padding: "16px 20px",
            borderRadius: 8,
            background: "var(--bg-tint)",
            boxShadow: "var(--shadow-border)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              style={{
                fontSize: 11,
                fontFamily: FONT_MONO,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              {t.arg_banner_eyebrow}
            </span>
            <span
              style={{
                fontSize: 14,
                color: "var(--text-body)",
                lineHeight: 1.5,
              }}
            >
              {t.arg_banner_title}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 14,
              fontSize: 13,
              fontFamily: FONT_MONO,
            }}
          >
            <a
              href="/manifiesto"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              {t.arg_banner_link_manifesto}
            </a>
            <a
              href="/sociedades-ia"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              {t.arg_banner_link_sociedades}
            </a>
            <a
              href="/rfcs/001"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              {t.arg_banner_link_rfcs}
            </a>
            <a
              href="/architecture"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              architecture
            </a>
            <a
              href="/security"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              security
            </a>
            <a
              href="/play"
              style={{ color: "var(--text)", textDecoration: "underline", fontWeight: 600 }}
            >
              play live ↗
            </a>
            <a
              href="/sdk"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              sdk
            </a>
            <a
              href="/reference"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              reference
            </a>
            <a
              href="/faq"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              faq
            </a>
            <a
              href="/comparison"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              vs · global
            </a>
            <a
              href="/getting-started"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              getting-started
            </a>
            <a
              href="/status"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              status
            </a>
            <a
              href="/verify"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              verify
            </a>
            <a
              href="/examples"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              cookbook
            </a>
            <a
              href="/templates"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              templates
            </a>
            <a
              href="/incorporar"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              incorporar
            </a>
            <a
              href="/playbook"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              playbook
            </a>
            <a
              href="/vs"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              vs
            </a>
            <a
              href="/marketplace"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              benchmark
            </a>
            <a
              href="/press-kit"
              style={{ color: "var(--text)", textDecoration: "underline" }}
            >
              press kit
            </a>
          </div>
        </section>

        {/* REGULATOR / POLICY ENTRYPOINT */}
        <section
          style={{
            background: "var(--bg-tint)",
            border: "1px solid var(--text-muted)",
            borderRadius: 8,
            padding: "16px 18px",
            marginBottom: 32,
            display: "grid",
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              fontSize: 11,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 600,
            }}
          >
            ¿Sos regulador, asesor de gobierno, periodista o reviewer?
          </div>
          <div style={{ fontSize: 14, color: "var(--text-body)", lineHeight: 1.55 }}>
            Cuatro puntos de entrada cortos:{" "}
            <a href="/play" style={{ color: "var(--accent)" }}>
              /play
            </a>{" "}
            (sociedad-IA en vivo, 30 segundos, sin setup),{" "}
            <a href="/es/playbook" style={{ color: "var(--accent)" }}>
              /es/playbook
            </a>{" "}
            (narrativa completa, español),{" "}
            <a href="/rfcs/001" style={{ color: "var(--accent)" }}>
              /rfcs/001
            </a>{" "}
            (marco de responsabilidad),{" "}
            <a href="/press-kit" style={{ color: "var(--accent)" }}>
              /press-kit
            </a>{" "}
            (datos verificables + contacto). Reunión:{" "}
            <a href="mailto:naza@helloastro.co" style={{ color: "var(--accent)" }}>
              naza@helloastro.co
            </a>{" "}
            — respuesta &lt;48hs.
          </div>
        </section>

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
              // ES "Toolkit de Mercado Pago para Agentes." has 37 chars and
              // needs to fit on one line at desktop widths (>=640px). Cap at
              // 50px so it fits inside the 920px container without wrapping.
              fontSize: "clamp(38px, 8vw, 50px)",
              margin: "16px 0 20px",
              fontWeight: 600,
              lineHeight: 1.12,
              letterSpacing: "-0.05em",
              color: "var(--text)",
            }}
          >
            {/* Responsive title.
                ES desktop: "Toolkit de Mercado Pago para Agentes. / Hecho en Vercel." (2 lines)
                ES mobile:  "Toolkit de / Mercado Pago / para Agentes. / Hecho en Vercel." (4 lines)
                EN desktop: "Mercado Pago Agent Toolkit. / Built on Vercel." (2 lines)
                EN mobile:  "Mercado Pago / Agent Toolkit. / Built on Vercel." (3 lines)
                Mobile-only breaks use `.br-mobile` (display: none ≥640px). */}
            {lang === "es" ? (
              <>
                Toolkit de<br className="br-mobile" /> Mercado Pago
                <br className="br-mobile" /> para Agentes.
              </>
            ) : (
              <>
                Mercado Pago<br className="br-mobile" /> Agent Toolkit.
              </>
            )}
            <br />
            {t.hero_h1_l2}
          </h1>
          <p
            style={{
              color: "var(--text-body)",
              fontSize: "clamp(16px, 3.6vw, 20px)",
              margin: 0,
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            {t.hero_sub}
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
              {t.cta_deploy}
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
              {t.cta_github}
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
              {t.cta_npm}
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
              {t.cta_cookbook}
            </a>
            <button
              type="button"
              onClick={toggleLive}
              aria-pressed={liveOpen}
              style={{
                padding: "8px 16px",
                background: "var(--bg)",
                color: "var(--text)",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1.43,
                boxShadow: "var(--shadow-ring-light)",
                border: "none",
                cursor: "pointer",
                fontFamily: FONT_SANS,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 9999,
                  background: "var(--accent)",
                  boxShadow: "0 0 0 4px rgba(0, 188, 255, 0.12)",
                  animation: "demo-pulse 2s ease-in-out infinite",
                }}
              />
              {t.cta_try_live}
            </button>
          </div>
        </header>

        {/* LIVE DEMO */}
        <section style={{ marginBottom: 96 }}>
          {liveOpen ? <LiveChat onClose={closeLive} /> : null}
          <DemoTerminal />
        </section>

        {/* COMPARISON */}
        <section style={{ marginBottom: 80 }}>
          <h2
            style={{
              fontSize: "clamp(24px, 5vw, 32px)",
              fontWeight: 600,
              margin: "0 0 24px",
              letterSpacing: "-0.04em",
              lineHeight: 1.2,
              color: "var(--text)",
            }}
          >
            {t.compare_h2}
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
                    {t.compare_col_feature}
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
                      {t.compare_col_official}
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
                      {t.compare_col_stripe}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, idx) => (
                  <tr
                    key={row.label}
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
                      {t[row.label]}
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
                      {cellText(row.ours, t)}
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
                      {cellText(row.official, t)}
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
                      {cellText(row.stripe, t)}
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
              fontSize: "clamp(24px, 5vw, 32px)",
              fontWeight: 600,
              margin: "0 0 24px",
              letterSpacing: "-0.04em",
              lineHeight: 1.2,
              color: "var(--text)",
            }}
          >
            {t.whats_h2}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {WHATS_IN.map((row) => (
              <div
                key={row.titleKey}
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
                  {t[row.titleKey]}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: "var(--text-body)",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {t[row.bodyKey]}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* QUICK START */}
        <section style={{ marginBottom: 80 }}>
          <h2
            style={{
              fontSize: "clamp(24px, 5vw, 32px)",
              fontWeight: 600,
              margin: "0 0 24px",
              letterSpacing: "-0.04em",
              lineHeight: 1.2,
              color: "var(--text)",
            }}
          >
            {t.quick_h2}
          </h2>
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

        {/* OTHER PRIMITIVES */}
        <section style={{ marginBottom: 80 }}>
          <h2
            style={{
              fontSize: "clamp(24px, 5vw, 32px)",
              fontWeight: 600,
              margin: "0 0 8px",
              letterSpacing: "-0.04em",
              lineHeight: 1.2,
              color: "var(--text)",
            }}
          >
            {t.other_h2}
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
            {t.other_intro_a}{" "}
            <code style={{ fontFamily: FONT_MONO, color: "var(--text)" }}>
              @ar-agents/mercadopago
            </code>
            {t.other_intro_b}
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
                  {t[pkg.purposeKey]}
                </p>
                <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
                  <a
                    href={pkg.npm}
                    style={{
                      color: "var(--text)",
                      textDecoration: "underline",
                    }}
                  >
                    {t.other_card_npm}
                  </a>
                  <a
                    href={pkg.github}
                    style={{
                      color: "var(--text)",
                      textDecoration: "underline",
                    }}
                  >
                    {t.other_card_source}
                  </a>
                  {pkg.demo && (
                    <a
                      href={pkg.demo}
                      style={{
                        color: "var(--accent)",
                        textDecoration: "underline",
                      }}
                    >
                      {t.other_card_demo}
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
              fontSize: "clamp(24px, 5vw, 32px)",
              fontWeight: 600,
              margin: "0 0 24px",
              letterSpacing: "-0.04em",
              lineHeight: 1.2,
              color: "var(--text)",
            }}
          >
            {t.comp_h2}
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
              {" "}{t.comp_intro_a}
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
              <span>{t.comp_tier_lt5k}</span>
              <span style={{ color: "var(--text-muted)" }}>$5k–$50k</span>
              <span>{t.comp_tier_5k_50k}</span>
              <span style={{ color: "var(--text-muted)" }}>$50k–$500k</span>
              <span>{t.comp_tier_50k_500k}</span>
              <span style={{ color: "var(--text-muted)" }}>{"> "}$500k</span>
              <span>{t.comp_tier_gt500k}</span>
            </div>
          </div>
        </section>

        {/* FAQ — visible Q&A so the same content lives in the DOM that the
            FAQPage JSON-LD references. Search engines (and LLMs that don't
            execute scripts) prefer the rendered text. <details> elements
            collapse so it's not a wall of text on first paint. */}
        <section
          aria-labelledby="faq-heading"
          style={{ marginBottom: 80 }}
        >
          <h2
            id="faq-heading"
            style={{
              fontSize: "clamp(24px, 5vw, 32px)",
              fontWeight: 600,
              margin: "0 0 24px",
              letterSpacing: "-0.04em",
              lineHeight: 1.2,
              color: "var(--text)",
            }}
          >
            {t.faq_h2}
          </h2>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              { q: t.faq_q1, a: t.faq_a1 },
              { q: t.faq_q2, a: t.faq_a2 },
              { q: t.faq_q3, a: t.faq_a3 },
              { q: t.faq_q4, a: t.faq_a4 },
              { q: t.faq_q5, a: t.faq_a5 },
              { q: t.faq_q6, a: t.faq_a6 },
              { q: t.faq_q7, a: t.faq_a7 },
            ].map(({ q, a }, i) => (
              <details
                key={i}
                style={{
                  background: "var(--bg)",
                  borderRadius: 8,
                  padding: "16px 20px",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 15,
                    fontWeight: 500,
                    color: "var(--text)",
                    listStyle: "none",
                  }}
                >
                  {q}
                </summary>
                <p
                  style={{
                    color: "var(--text-body)",
                    fontSize: 14,
                    lineHeight: 1.65,
                    margin: "12px 0 0",
                  }}
                >
                  {a}
                </p>
              </details>
            ))}
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
            {t.footer_by}{" "}
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
              {t.footer_report}
            </a>
          </span>
        </footer>
      </div>
      <HomeJsonLd />
    </main>
  );
}
