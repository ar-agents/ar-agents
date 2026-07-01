"use client";

// /docs, the single developer + agent hub. Pattern: clear entry CTAs ->
// recipe gallery -> packages -> deeper reference links. Replaces the scattered
// sdk/getting-started/examples/reference entry points as the main-path door for
// builders. Copy is a first pass; package names + routes are real.

import { useLang } from "../i18n";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const RECIPES: ReadonlyArray<{ es: string; en: string; pkg: string; href: string }> = [
  { es: "Cobrá por Mercado Pago", en: "Charge with Mercado Pago", pkg: "@ar-agents/mercadopago", href: "/examples" },
  { es: "Emití una factura AFIP", en: "Issue an AFIP invoice", pkg: "@ar-agents/facturacion", href: "/examples" },
  { es: "Validá un CUIT", en: "Validate a CUIT", pkg: "@ar-agents/identity", href: "/examples" },
  { es: "Conectá el MCP a Claude o Cursor", en: "Connect the MCP to Claude or Cursor", pkg: "@ar-agents/mcp", href: "/templates" },
  { es: "Mandá un WhatsApp", en: "Send a WhatsApp", pkg: "@ar-agents/whatsapp", href: "/examples" },
  { es: "Incorporá una sociedad en una llamada", en: "Incorporate a company in one call", pkg: "@ar-agents/incorporate", href: "/sdk" },
  { es: "Cobrá a un agente LLM", en: "Charge an LLM agent", pkg: "@ar-agents/agentic-commerce-bridge", href: "/templates" },
  { es: "Convertí USDC a pesos", en: "Convert USDC to pesos", pkg: "@ar-agents/treasury", href: "https://github.com/ar-agents/ar-agents/tree/main/packages/treasury" },
];

const PACKAGES: ReadonlyArray<{ name: string; es: string; en: string }> = [
  { name: "@ar-agents/incorporate", es: "Un agente externo constituye una sociedad en una llamada.", en: "An external agent incorporates a company in one call." },
  { name: "@ar-agents/mcp", es: "Un server MCP con todo el toolkit, para cualquier host.", en: "One MCP server with the whole toolkit, for any host." },
  { name: "@ar-agents/mercadopago", es: "89 tools tipadas: cobros, suscripciones, marketplace, QR.", en: "89 typed tools: charges, subscriptions, marketplace, QR." },
  { name: "@ar-agents/facturacion", es: "Factura electrónica AFIP/ARCA (A/B/C) con CAE.", en: "AFIP/ARCA e-invoicing (A/B/C) with CAE." },
  { name: "@ar-agents/identity", es: "Validación de CUIT/CUIL y padrón ARCA.", en: "CUIT/CUIL validation and ARCA padron lookup." },
  { name: "@ar-agents/banking", es: "CBU/CVU + BCRA (deudores y variables).", en: "CBU/CVU + BCRA (debtors and variables)." },
  { name: "@ar-agents/whatsapp", es: "WhatsApp Business Cloud: enviar, recibir, webhooks.", en: "WhatsApp Business Cloud: send, receive, webhooks." },
  { name: "@ar-agents/igj", es: "Datos abiertos de la IGJ: entidades y autoridades.", en: "IGJ open data: entities and authorities." },
  { name: "@ar-agents/gde-tad", es: "Notificaciones GDE/TAD y seguimiento de trámites.", en: "GDE/TAD notifications and procedure tracking." },
  { name: "@ar-agents/boletin-oficial", es: "El Boletín Oficial como firehose tipado para agentes.", en: "The official gazette as a typed firehose for agents." },
];

const DEEPER: ReadonlyArray<{ href: string; es: string; en: string; d_es: string; d_en: string }> = [
  { href: "/sdk", es: "SDK", en: "SDK", d_es: "La API completa de @ar-agents/incorporate.", d_en: "The full @ar-agents/incorporate API." },
  { href: "/examples", es: "Recetario", en: "Cookbook", d_es: "30 recetas en TypeScript, listas para correr.", d_en: "30 runnable, fully typed TypeScript recipes." },
  { href: "/templates", es: "Templates", en: "Templates", d_es: "Apps de ejemplo, deploy en un clic.", d_en: "Example apps, one-click deploy." },
  { href: "/codegen", es: "Codegen", en: "Codegen", d_es: "Generá el snippet en TS, Python, Go, Rust o curl.", d_en: "Generate the snippet in TS, Python, Go, Rust or curl." },
  { href: "/reference", es: "Referencia", en: "Reference", d_es: "El índice de cada endpoint, paquete y well-known.", d_en: "The index of every endpoint, package and well-known." },
  { href: "/glossary", es: "Glosario", en: "Glossary", d_es: "Cada término definido, para empezar de cero.", d_en: "Every term defined, to start from scratch." },
];

export default function Docs() {
  const { lang } = useLang();
  const es = lang === "es";

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
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <p style={eyebrow}>Docs</p>
        <h1 style={h1Sty}>{es ? "Construí sobre ar-agents" : "Build on ar-agents"}</h1>
        <p style={sub}>
          {es
            ? "Paquetes tipados para el Vercel AI SDK que le dan a un agente identidad, pagos, facturación y banca en Argentina. Para vos y para tus agentes. Open source, MIT."
            : "Typed packages for the Vercel AI SDK that give an agent identity, payments, invoicing and banking in Argentina. For you and for your agents. Open source, MIT."}
        </p>

        {/* ENTRY CTAS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 28 }}>
          <div style={card}>
            <div style={cardLabel}>{es ? "Instalá" : "Install"}</div>
            <pre style={codeBlock}>pnpm add @ar-agents/incorporate</pre>
          </div>
          <div style={card}>
            <div style={cardLabel}>{es ? "Conectá el MCP" : "Connect the MCP"}</div>
            <pre style={codeBlock}>npx -y @ar-agents/mcp</pre>
          </div>
          <a href="https://github.com/ar-agents/ar-agents" style={{ ...card, textDecoration: "none" }}>
            <div style={cardLabel}>{es ? "Mirá el código" : "Read the source"}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 14, color: "var(--text)" }}>
              github.com/ar-agents <span style={{ color: "var(--accent)" }}>→</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
              {es ? "37 paquetes · MIT · provenance" : "37 packages · MIT · provenance"}
            </div>
          </a>
        </div>

        {/* AGENT PATH */}
        <a href="/.well-known/agents.json" style={agentCallout}>
          <span style={{ fontSize: 13, color: "var(--text-body)" }}>
            {es ? "¿Sos un agente? Empezá por " : "Are you an agent? Start at "}
            <code style={{ fontFamily: FONT_MONO, color: "var(--accent)" }}>/.well-known/agents.json</code>
            {es ? " y " : " and "}
            <code style={{ fontFamily: FONT_MONO, color: "var(--accent)" }}>/llms.txt</code>
          </span>
        </a>

        {/* RECIPES */}
        <h2 style={h2Sty}>{es ? "Recetas" : "Recipes"}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {RECIPES.map((r) => (
            <a key={r.es} href={r.href} style={{ ...card, textDecoration: "none" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                {es ? r.es : r.en} <span style={{ color: "var(--accent)" }}>→</span>
              </div>
              <code style={{ fontFamily: FONT_MONO, fontSize: 12, color: "var(--text-muted)" }}>{r.pkg}</code>
            </a>
          ))}
        </div>

        {/* PACKAGES */}
        <h2 style={h2Sty}>{es ? "Los paquetes" : "The packages"}</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {PACKAGES.map((p) => (
            <a
              key={p.name}
              href={`https://www.npmjs.com/package/${p.name}`}
              style={{ ...rowCard, textDecoration: "none" }}
            >
              <code style={{ fontFamily: FONT_MONO, fontSize: 13, color: "var(--text)", minWidth: 220, flexShrink: 0 }}>
                {p.name}
              </code>
              <span style={{ color: "var(--text-body)", fontSize: 14, lineHeight: 1.5 }}>{es ? p.es : p.en}</span>
            </a>
          ))}
        </div>

        {/* DEEPER */}
        <h2 style={h2Sty}>{es ? "Más a fondo" : "Go deeper"}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {DEEPER.map((d) => (
            <a key={d.href} href={d.href} style={{ ...card, textDecoration: "none" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{es ? d.es : d.en}</div>
              <p style={{ fontSize: 13, color: "var(--text-body)", margin: 0, lineHeight: 1.5 }}>{es ? d.d_es : d.d_en}</p>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontFamily: FONT_MONO,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "var(--text-muted)",
  margin: 0,
  fontWeight: 500,
};

const h1Sty: React.CSSProperties = {
  fontSize: "clamp(32px, 5.5vw, 46px)",
  fontWeight: 600,
  letterSpacing: "-0.035em",
  lineHeight: 1.1,
  margin: "12px 0 18px",
};

const sub: React.CSSProperties = {
  color: "var(--text-body)",
  fontSize: "clamp(16px, 2.4vw, 18px)",
  lineHeight: 1.55,
  margin: 0,
  maxWidth: 700,
};

const h2Sty: React.CSSProperties = {
  fontSize: "clamp(22px, 4vw, 28px)",
  fontWeight: 600,
  letterSpacing: "-0.03em",
  lineHeight: 1.15,
  margin: "48px 0 18px",
};

const card: React.CSSProperties = {
  display: "block",
  padding: "18px 18px",
  background: "var(--bg-tint)",
  borderRadius: 10,
  boxShadow: "var(--card-shadow, var(--shadow-ring-light))",
  color: "inherit",
};

const cardLabel: React.CSSProperties = {
  fontSize: 11,
  fontFamily: FONT_MONO,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  marginBottom: 10,
  fontWeight: 600,
};

const codeBlock: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 13,
  color: "var(--text)",
  background: "var(--bg)",
  padding: "10px 12px",
  borderRadius: 6,
  margin: 0,
  overflow: "auto",
  boxShadow: "var(--shadow-border)",
};

const agentCallout: React.CSSProperties = {
  display: "block",
  marginTop: 14,
  padding: "12px 16px",
  background: "var(--bg-tint)",
  borderRadius: 10,
  boxShadow: "var(--shadow-border)",
  textDecoration: "none",
};

const rowCard: React.CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "center",
  flexWrap: "wrap",
  padding: "12px 18px",
  background: "var(--bg-tint)",
  borderRadius: 10,
  boxShadow: "var(--card-shadow, var(--shadow-ring-light))",
  color: "inherit",
};
