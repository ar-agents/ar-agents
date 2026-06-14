"use client";

// Design system: Vercel / Geist with light + dark CSS-var themes.
// All colors come from globals.css custom properties so the theme toggle
// can flip the palette without re-rendering.
//
// `use client` is required because the hero "Try it with a live agent"
// button toggles the LiveChat panel that renders above the scripted demo.

import { useCallback, useState } from "react";
import { DemoTerminal } from "./demo-terminal";
import { HeroDiagram } from "./hero-diagram";
import { useLang, type Translations } from "./i18n";
import { LiveChat } from "./live-chat";
import { HomeJsonLd } from "./json-ld";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

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
    version: "0.7.0",
    purposeKey: "pp_identity",
    npm: "https://www.npmjs.com/package/@ar-agents/identity",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/identity",
    demo: "https://cuit-hello.ar-agents.ar",
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
    version: "0.4.0",
    purposeKey: "pp_whatsapp",
    npm: "https://www.npmjs.com/package/@ar-agents/whatsapp",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/whatsapp",
    demo: "https://whatsapp-hello.ar-agents.ar",
  },
  {
    name: "@ar-agents/facturacion",
    version: "0.3.0",
    purposeKey: "pp_facturacion",
    npm: "https://www.npmjs.com/package/@ar-agents/facturacion",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/facturacion",
    demo: null,
  },
  {
    name: "@ar-agents/banking",
    version: "0.4.0",
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
    version: "0.2.0",
    purposeKey: "pp_shipping",
    npm: "https://www.npmjs.com/package/@ar-agents/shipping",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/shipping",
    demo: null,
  },
  {
    name: "@ar-agents/gde-tad",
    version: "0.2.0",
    purposeKey: "pp_gde_tad",
    npm: "https://www.npmjs.com/package/@ar-agents/gde-tad",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/gde-tad",
    demo: null,
  },
  {
    name: "@ar-agents/mercadolibre",
    version: "0.4.3",
    purposeKey: "pp_mercadolibre",
    npm: "https://www.npmjs.com/package/@ar-agents/mercadolibre",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/mercadolibre",
    demo: null,
  },
  {
    name: "@ar-agents/agentic-commerce-bridge",
    version: "5.0.0",
    purposeKey: "pp_agentic_commerce_bridge",
    npm: "https://www.npmjs.com/package/@ar-agents/agentic-commerce-bridge",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/agentic-commerce-bridge",
    demo: "https://bridge-hello.ar-agents.ar",
  },
  {
    name: "@ar-agents/ap2",
    version: "0.2.0",
    purposeKey: "pp_ap2",
    npm: "https://www.npmjs.com/package/@ar-agents/ap2",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/ap2",
    demo: null,
  },
  {
    name: "@ar-agents/incorporate",
    version: "0.2.0",
    purposeKey: "pp_incorporate",
    npm: "https://www.npmjs.com/package/@ar-agents/incorporate",
    github: "https://github.com/ar-agents/ar-agents/tree/main/packages/incorporate",
    demo: "https://ar-agents.ar/incorporar",
  },
  {
    name: "@ar-agents/mcp",
    version: "0.10.0",
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

type CellKey = keyof Translations | "✓" | "-" | "$" | "raw";
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
  if (cell.key === "✓" || cell.key === "-" || cell.key === "$") return cell.key;
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
        padding: "48px 24px 120px",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        {/* Legacy banner removed in cleanup. Top navigation lives in <Nav />
            (layout.tsx). Audience-specific landings are linked from the
            hero below. */}
        {/* HERO */}
        <header style={{ marginBottom: 56 }}>
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
            {lang === "es"
              ? "Infraestructura abierta · MIT + CC-BY-4.0"
              : "Open infrastructure · MIT + CC-BY-4.0"}
          </p>
          <h1
            style={{
              fontSize: "clamp(38px, 7vw, 56px)",
              margin: "12px 0 20px",
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: "-0.035em",
              color: "var(--text)",
              maxWidth: 820,
            }}
          >
            {t.hero_h1_l1}
            <br />
            <span style={{ color: "var(--text-muted)" }}>{t.hero_h1_l2}</span>
          </h1>
          <p
            style={{
              color: "var(--text-body)",
              fontSize: "clamp(16px, 2.6vw, 19px)",
              margin: 0,
              maxWidth: 680,
              lineHeight: 1.55,
            }}
          >
            {t.hero_sub}
          </p>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              margin: "12px 0 0",
              maxWidth: 680,
              lineHeight: 1.5,
            }}
          >
            {lang === "es"
              ? "Anteproyecto de Ley General de Sociedades enviado al Senado el 1-jun-2026. Todavía no es ley."
              : "Draft General Companies Law sent to the Senate on Jun 1, 2026. Not yet law."}
          </p>
          <div
            style={{
              marginTop: 28,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={toggleLive}
              aria-pressed={liveOpen}
              style={{
                padding: "9px 16px",
                background: "var(--primary-bg)",
                color: "var(--primary-text)",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1.43,
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
                  boxShadow: "0 0 0 4px rgba(0, 188, 255, 0.18)",
                  animation: "demo-pulse 2s ease-in-out infinite",
                }}
              />
              {t.cta_try_live}
            </button>
            <a
              href="/video"
              style={{
                padding: "9px 16px",
                background: "var(--bg)",
                color: "var(--text)",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                lineHeight: 1.43,
                boxShadow: "var(--shadow-ring-light)",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
              title={
                lang === "es"
                  ? "Demo en video, 2:30, una sociedad-IA argentina end-to-end"
                  : "Video demo, 2:30, an AR sociedad-IA end-to-end"
              }
            >
              <span aria-hidden="true">▶</span>
              {lang === "es" ? "Ver demo (2:30)" : "Watch demo (2:30)"}
            </a>
            <a
              href="/rfcs/001"
              style={{
                padding: "9px 16px",
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
              {lang === "es" ? "Leer RFC-001" : "Read RFC-001"}
            </a>
            <a
              href="https://github.com/ar-agents/ar-agents"
              style={{
                padding: "9px 16px",
                background: "var(--bg)",
                color: "var(--text)",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                lineHeight: 1.43,
                boxShadow: "var(--shadow-ring-light)",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <svg
                width="14"
                height="14"
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
          </div>

          {/* Audience signposts. Three concrete entry points by role. */}
          <div
            style={{
              marginTop: 40,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            <AudienceCard
              role={lang === "es" ? "Para developers" : "For developers"}
              body={
                lang === "es"
                  ? "36 paquetes npm tipados para Vercel AI SDK 6. Cobrar, validar CUIT, mandar WhatsApp, emitir factura, monitorear el BO."
                  : "36 typed npm packages for Vercel AI SDK 6. Charge, validate CUIT, send WhatsApp, emit invoice, monitor the gazette."
              }
              cta={lang === "es" ? "Ver SDK" : "Browse SDK"}
              href="/sdk"
            />
            <AudienceCard
              role={lang === "es" ? "Para reguladores" : "For regulators"}
              body={
                lang === "es"
                  ? "Audit log forense con HMAC + Ed25519, verificable sin pedir la clave al operador. 1-pager imprimible."
                  : "Forensic audit log with HMAC + Ed25519, verifiable without asking the operator for their key. Printable 1-pager."
              }
              cta={lang === "es" ? "Abrir /auditor" : "Open /auditor"}
              href="/auditor"
            />
            <AudienceCard
              role={lang === "es" ? "Para legisladores" : "For legislators"}
              body={
                lang === "es"
                  ? "Síntesis técnica de los 6 RFCs con texto sugerido cite-by-reference. Para quien esté redactando la ley."
                  : "Technical synthesis of the 6 RFCs with suggested cite-by-reference legislative text. For whoever is drafting the bill."
              }
              cta={lang === "es" ? "Abrir /legislación" : "Open /legislation"}
              href={lang === "es" ? "/legislacion" : "/en/legislation"}
            />
          </div>

          {/* Visual flow diagram, agent → ar-agents → AR state → audit
              log. Sits between audience cards and stat strip; gives the
              landing a single visual asset without animation. */}
          <div
            style={{
              marginTop: 48,
              padding: "20px 8px",
              color: "var(--text-body)",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <HeroDiagram lang={lang} />
          </div>

          {/* Falsifiable stats strip. Every number links to a verifiable
              source (npm org, RFC index, GitHub, registry). */}
          <div
            style={{
              marginTop: 40,
              paddingTop: 24,
              borderTop: "1px solid var(--border-color)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 0,
            }}
          >
            <StatTile
              n="36"
              l={lang === "es" ? "Paquetes en npm" : "npm packages"}
              href="https://www.npmjs.com/org/ar-agents"
            />
            <StatTile
              n="6"
              l="RFCs (CC-BY-4.0)"
              href="/rfcs/001"
            />
            <StatTile
              n="235"
              l={lang === "es" ? "Tools tipadas" : "Typed tools"}
              href="/sdk"
            />
            <StatTile
              n="5"
              l={lang === "es" ? "Implementaciones" : "Implementations"}
              href="/registro"
            />
            <StatTile
              n="100/100"
              l={lang === "es" ? "Conformidad" : "Conformance"}
              href="/certifier"
            />
          </div>
        </header>

        {/* THE MODEL, open-core + El Auditor + recursive proof. Leads the page
            with what ar-agents IS now, before the technical deep-dive below. */}
        <section
          style={{
            marginTop: 8,
            marginBottom: 72,
            padding: "44px 0",
            borderTop: "1px solid var(--border-color)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontFamily: FONT_MONO,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-muted)",
              margin: "0 0 12px",
              fontWeight: 600,
            }}
          >
            {lang === "es" ? "El modelo · open-core" : "The model · open-core"}
          </p>
          <h2
            style={{
              fontSize: "clamp(26px, 5vw, 38px)",
              fontWeight: 600,
              letterSpacing: "-0.03em",
              lineHeight: 1.12,
              color: "var(--text)",
              margin: "0 0 14px",
              maxWidth: 760,
            }}
          >
            {lang === "es"
              ? "El estándar es gratis. La confianza es el negocio."
              : "The standard is free. Trust is the business."}
          </h2>
          <p
            style={{
              color: "var(--text-body)",
              fontSize: "clamp(15px, 2.4vw, 18px)",
              lineHeight: 1.55,
              maxWidth: 720,
              margin: "0 0 32px",
            }}
          >
            {lang === "es"
              ? "El código es abierto y gratis. La confianza es un servicio pago. Lo probamos con nuestra propia empresa."
              : "The code is open and free. Trust is a paid service. We prove it with our own company."}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(248px, 1fr))",
              gap: 14,
            }}
          >
            {/* Pillar 1, free core */}
            <a
              href="/sdk"
              style={{
                display: "block",
                padding: "20px 20px 18px",
                background: "var(--bg-tint)",
                borderRadius: 10,
                boxShadow: "var(--card-shadow, var(--shadow-ring-light))",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-muted)",
                  marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                {lang === "es" ? "Núcleo abierto · gratis" : "Open core · free"}
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                {lang === "es" ? "36 paquetes, 6 RFCs, wizard" : "36 packages, 6 RFCs, wizard"}
              </div>
              <p style={{ fontSize: 14, color: "var(--text-body)", lineHeight: 1.5, margin: "0 0 12px" }}>
                {lang === "es"
                  ? "Las integraciones soberanas (AFIP, Mercado Pago, IGJ, WhatsApp, factura) y el wizard que constituye la sociedad. MIT + CC-BY-4.0."
                  : "The sovereign integrations (AFIP, Mercado Pago, IGJ, WhatsApp, invoicing) and the wizard that incorporates the company. MIT + CC-BY-4.0."}
              </p>
              <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500, textDecoration: "underline" }}>
                {lang === "es" ? "Ver SDK" : "Browse SDK"} →
              </span>
            </a>

            {/* Pillar 2, El Auditor, paid, emphasized */}
            <a
              href={lang === "es" ? "/precios" : "/en/pricing"}
              style={{
                display: "block",
                padding: "20px 20px 18px",
                background: "var(--accent-bg)",
                borderRadius: 10,
                boxShadow: "inset 0 0 0 1px var(--accent)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--accent-text)",
                  marginBottom: 8,
                  fontWeight: 700,
                }}
              >
                {lang === "es" ? "El Auditor · pago" : "The Auditor · paid"}
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                {lang === "es" ? "Prueba de autonomía, USD 199/mes" : "Proof-of-autonomy, USD 199/mo"}
              </div>
              <p style={{ fontSize: 14, color: "var(--text-body)", lineHeight: 1.5, margin: "0 0 12px" }}>
                {lang === "es"
                  ? "Cada decisión queda en un log firmado (HMAC + Ed25519) que cualquiera puede verificar. El art. 102 hace responsable al humano. Este log es su defensa."
                  : "Every decision lands in a signed log (HMAC + Ed25519) that anyone can verify. Art. 102 makes the human liable. This log is the defense."}
              </p>
              <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600, textDecoration: "underline" }}>
                {lang === "es" ? "Ver precios" : "See pricing"} →
              </span>
            </a>

            {/* Pillar 3, recursive proof */}
            <a
              href={lang === "es" ? "/caso-ar-agents" : "/en/ar-agents-case"}
              style={{
                display: "block",
                padding: "20px 20px 18px",
                background: "var(--bg-tint)",
                borderRadius: 10,
                boxShadow: "var(--card-shadow, var(--shadow-ring-light))",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontFamily: FONT_MONO,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-muted)",
                  marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                {lang === "es" ? "La prueba · dogfood" : "The proof · dogfood"}
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                {lang === "es" ? "Nos constituimos a nosotros mismos" : "We incorporated ourselves"}
              </div>
              <p style={{ fontSize: 14, color: "var(--text-body)", lineHeight: 1.5, margin: "0 0 12px" }}>
                {lang === "es"
                  ? "ar-agents se constituyó como Sociedad Automatizada y usa su propio Auditor. La prueba es pública."
                  : "ar-agents incorporated itself as a Sociedad Automatizada and uses its own Auditor. The proof is public."}
              </p>
              <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500, textDecoration: "underline" }}>
                {lang === "es" ? "Ver el caso" : "See the case"} →
              </span>
            </a>
          </div>
        </section>

        {/* LIVE DEMO */}
        <section style={{ marginBottom: 96 }}>
          {liveOpen ? <LiveChat onClose={closeLive} /> : null}
          <DemoTerminal />
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
                href="https://whatsapp-hello.ar-agents.ar"
                style={{
                  color: "var(--accent)",
                  fontWeight: 500,
                  textDecoration: "underline",
                }}
              >
                whatsapp-hello.ar-agents.ar
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

        {/* SECTION FRAMING, the sections below are about the flagship
            package (@ar-agents/mercadopago). Helps the reader who arrived
            for the AI-corporations story understand why a MercadoPago demo
            comes next. */}
        <section
          style={{
            marginTop: 32,
            marginBottom: 24,
            paddingTop: 32,
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontFamily: FONT_MONO,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-muted)",
              margin: "0 0 8px",
              fontWeight: 600,
            }}
          >
            {lang === "es" ? "Núcleo open-source · paquete insignia" : "Open-source core · flagship package"}
          </p>
          <h2
            style={{
              fontSize: "clamp(22px, 4vw, 28px)",
              fontWeight: 600,
              margin: "0 0 8px",
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            @ar-agents/mercadopago
          </h2>
          <p
            style={{
              color: "var(--text-body)",
              fontSize: 15,
              margin: 0,
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            {lang === "es"
              ? "89 tools tipadas para Vercel AI SDK 6. Idempotencia determinística, HITL programático en operaciones irreversibles, verificación de webhook HMAC. La pieza más madura del núcleo open-source (36 paquetes), referenciada por el resto del toolkit. "
              : "89 typed tools for Vercel AI SDK 6. Deterministic idempotency, programmatic HITL on irreversible operations, HMAC webhook verification. The deepest piece of the open-source core (36 packages), referenced by the rest of the toolkit. "}
            {lang === "es" ? (
              <>
                El núcleo es gratis; la capa de confianza paga es{" "}
                <a href="/precios" style={{ color: "var(--accent)", textDecoration: "underline" }}>El Auditor</a>, y la dogfoodeamos:{" "}
                <a href="/caso-ar-agents" style={{ color: "var(--accent)", textDecoration: "underline" }}>nos constituimos a nosotros mismos</a> como Sociedad Automatizada.
              </>
            ) : (
              <>
                The core is free; the paid trust layer is{" "}
                <a href="/en/pricing" style={{ color: "var(--accent)", textDecoration: "underline" }}>The Auditor</a>, and we dogfood it:{" "}
                <a href="/en/ar-agents-case" style={{ color: "var(--accent)", textDecoration: "underline" }}>we incorporated ourselves</a> as a Sociedad Automatizada.
              </>
            )}
          </p>
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

        {/* FAQ, visible Q&A so the same content lives in the DOM that the
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
            marginTop: 48,
            color: "var(--text-muted)",
            fontSize: 13,
            display: "grid",
            gap: 24,
            boxShadow: "inset 0 1px 0 var(--border-color)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 24,
            }}
          >
            <div>
              <p style={footerColHeading}>
                {lang === "es" ? "Más" : "More"}
              </p>
              <ul style={footerListSty}>
                <li>
                  <a href={lang === "es" ? "/precios" : "/en/pricing"} style={footerLinkSty}>
                    {lang === "es" ? "Precios · El Auditor" : "Pricing · The Auditor"}
                  </a>
                </li>
                <li>
                  <a href="/cloud" style={footerLinkSty}>
                    {lang === "es" ? "Cloud (comercial)" : "Cloud (commercial)"}
                  </a>
                </li>
                <li>
                  <a href="/manifiesto" style={footerLinkSty}>
                    {lang === "es" ? "Manifiesto" : "Manifesto"}
                  </a>
                </li>
                <li>
                  <a href="/al-ministro" style={footerLinkSty}>
                    {lang === "es" ? "Carta al ministro" : "Open letter"}
                  </a>
                </li>
                <li>
                  <a href="/co-firmar" style={footerLinkSty}>
                    {lang === "es" ? "Co-firmar RFC" : "Co-sign an RFC"}
                  </a>
                </li>
                <li>
                  <a href="/faq" style={footerLinkSty}>FAQ</a>
                </li>
                <li>
                  <a href="/timeline" style={footerLinkSty}>
                    {lang === "es" ? "Cronología" : "Timeline"}
                  </a>
                </li>
                <li>
                  <a href="/changelog" style={footerLinkSty}>Changelog</a>
                </li>
              </ul>
            </div>
            <div>
              <p style={footerColHeading}>
                {lang === "es" ? "Para legisladores" : "For legislators"}
              </p>
              <ul style={footerListSty}>
                <li>
                  <a href="/gobierno" style={footerLinkSty}>
                    {lang === "es" ? "Briefing para el Estado" : "Government briefing"}
                  </a>
                </li>
                <li>
                  <a href="/economia-del-regimen" style={footerLinkSty}>
                    {lang === "es" ? "Economía del régimen" : "Regime economics"}
                  </a>
                </li>
                <li>
                  <a href="/vs-on-chain" style={footerLinkSty}>
                    {lang === "es" ? "vs On-chain ($SAIRI)" : "vs On-chain"}
                  </a>
                </li>
                <li>
                  <a href="/legislacion" style={footerLinkSty}>
                    {lang === "es" ? "Síntesis legislativa" : "/legislación"}
                  </a>
                </li>
                <li>
                  <a href="/en/legislation" style={footerLinkSty}>
                    /en/legislation
                  </a>
                </li>
                <li>
                  <a href="/jurisdicciones" style={footerLinkSty}>
                    {lang === "es" ? "Jurisdicciones" : "Jurisdictions"}
                  </a>
                </li>
                <li>
                  <a href="/cite" style={footerLinkSty}>
                    {lang === "es" ? "Generar cita" : "Cite generator"}
                  </a>
                </li>
                <li>
                  <a href="/rfcs/001" style={footerLinkSty}>RFC-001</a>
                </li>
                <li>
                  <a href="/rfcs/004" style={footerLinkSty}>RFC-004</a>
                </li>
              </ul>
            </div>
            <div>
              <p style={footerColHeading}>
                {lang === "es" ? "Para reguladores" : "For regulators"}
              </p>
              <ul style={footerListSty}>
                <li>
                  <a href="/auditor" style={footerLinkSty}>/auditor</a>
                </li>
                <li>
                  <a href="/certifier" style={footerLinkSty}>/certifier</a>
                </li>
                <li>
                  <a href="/verify" style={footerLinkSty}>/verify</a>
                </li>
                <li>
                  <a href="/dashboard" style={footerLinkSty}>/dashboard</a>
                </li>
                <li>
                  <a href="/test-vectors" style={footerLinkSty}>/test-vectors</a>
                </li>
              </ul>
            </div>
            <div>
              <p style={footerColHeading}>
                {lang === "es" ? "Para developers" : "For developers"}
              </p>
              <ul style={footerListSty}>
                <li>
                  <a href="/sdk" style={footerLinkSty}>/sdk</a>
                </li>
                <li>
                  <a href="/getting-started" style={footerLinkSty}>
                    {lang === "es" ? "Empezar" : "Getting started"}
                  </a>
                </li>
                <li>
                  <a href="/examples" style={footerLinkSty}>
                    {lang === "es" ? "Recetario" : "Cookbook"}
                  </a>
                </li>
                <li>
                  <a href="/reference" style={footerLinkSty}>
                    {lang === "es" ? "Referencia" : "Reference"}
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              paddingTop: 16,
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <span>
              MIT (code) + CC-BY-4.0 (specs) ·{" "}
              <a
                href="https://github.com/naza00000"
                style={footerLinkSty}
              >
                Nazareno Clemente
              </a>
            </span>
            <span style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <a href="https://github.com/ar-agents/ar-agents" style={footerLinkSty}>
                GitHub
              </a>
              <a href="https://www.npmjs.com/org/ar-agents" style={footerLinkSty}>
                npm
              </a>
              <a href="/feed.xml" style={footerLinkSty}>RSS</a>
              <a href="/privacy" style={footerLinkSty}>
                {lang === "es" ? "Privacidad" : "Privacy"}
              </a>
              <a
                href="https://github.com/ar-agents/ar-agents/issues"
                style={footerLinkSty}
              >
                {t.footer_report}
              </a>
            </span>
          </div>
        </footer>
      </div>
      <HomeJsonLd />
    </main>
  );
}

const footerColHeading: React.CSSProperties = {
  fontSize: 11,
  fontFamily: FONT_MONO,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  margin: "0 0 8px",
  fontWeight: 600,
};

const footerListSty: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gap: 6,
};

const footerLinkSty: React.CSSProperties = {
  color: "var(--text-body)",
  textDecoration: "underline",
};

function StatTile({ n, l, href }: { n: string; l: string; href: string }) {
  const isExternal = href.startsWith("http");
  const content = (
    <>
      <div
        style={{
          fontSize: 26,
          fontWeight: 400,
          color: "var(--text)",
          fontFamily: FONT_MONO,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}
      >
        {n}
      </div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginTop: 4,
        }}
      >
        {l}
      </div>
    </>
  );
  const sty: React.CSSProperties = {
    display: "block",
    padding: "10px 6px",
    textDecoration: "none",
    color: "inherit",
    textAlign: "left",
  };
  if (isExternal) {
    return (
      <a href={href} style={sty}>
        {content}
      </a>
    );
  }
  return (
    <a href={href} style={sty}>
      {content}
    </a>
  );
}

function AudienceCard({
  role,
  body,
  cta,
  href,
}: {
  role: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: "block",
        padding: "16px 18px",
        background: "var(--bg-tint)",
        borderRadius: 8,
        boxShadow: "var(--card-shadow, var(--shadow-ring-light))",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: FONT_MONO,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {role}
      </div>
      <p
        style={{
          fontSize: 14,
          color: "var(--text-body)",
          lineHeight: 1.5,
          margin: "0 0 12px",
        }}
      >
        {body}
      </p>
      <span
        style={{
          fontSize: 13,
          color: "var(--accent)",
          fontWeight: 500,
          textDecoration: "underline",
        }}
      >
        {cta} →
      </span>
    </a>
  );
}
