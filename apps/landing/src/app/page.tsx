"use client";

// Home, redesigned around the founder's formula: as simple as OpenCode, as
// beautiful as Vercel (Geist + our light-blue accent), the copy of Cohere,
// the professionalism of Stripe. One promise, minimal chrome, whitespace as
// the design. Studio (studio.ar-agents.ar) is the product's front door now,
// so the primary CTA always points there, independent of LAW_STATUS. The
// LAW_STATUS pre/live switch still drives the honesty banner below the CTA.

import { useState } from "react";
import { HeroDiagram } from "./hero-diagram";
import { useLang } from "./i18n";
import { HomeJsonLd } from "./json-ld";
import { homeLawCopy, LAW_STATUS } from "./law-status";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const STUDIO_URL = "https://studio.ar-agents.ar";
const SOCIETY_URL = "https://soc-ar-agents-operaciones-sociedad.vercel.app";

type Step = { n: string; t_es: string; t_en: string; d_es: string; d_en: string };

const STEPS: ReadonlyArray<Step> = [
  {
    n: "01",
    t_es: "Creá",
    t_en: "Create",
    d_es: "Generá la sociedad desde un prompt: repo, configuración, checklist legal y deploy.",
    d_en: "Generate the company from a prompt: repo, config, legal checklist and deploy.",
  },
  {
    n: "02",
    t_es: "Operá",
    t_en: "Operate",
    d_es: "Corre sobre los rieles abiertos: pagos, identidad, facturación, banca y pesos en tu cuenta.",
    d_en: "It runs on the open rails: payments, identity, invoicing, banking, and pesos in your account.",
  },
  {
    n: "03",
    t_es: "Probá",
    t_en: "Prove",
    d_es: "El Auditor firma cada decisión (HMAC + Ed25519). Cualquiera la verifica. Es tu defensa ante el art. 102.",
    d_en: "El Auditor signs every decision (HMAC + Ed25519). Anyone can verify it. It is your art. 102 defense.",
  },
];

type Rail = { t_es: string; t_en: string; d_es: string; d_en: string };

const RAILS: ReadonlyArray<Rail> = [
  { t_es: "Pagos", t_en: "Payments", d_es: "Mercado Pago: cobros, suscripciones, cuotas.", d_en: "Mercado Pago: charges, subscriptions, installments." },
  { t_es: "Identidad", t_en: "Identity", d_es: "CUIT, padrón ARCA, validación.", d_en: "CUIT, ARCA padron, validation." },
  { t_es: "Facturación", t_en: "Invoicing", d_es: "Factura electrónica AFIP/ARCA.", d_en: "AFIP/ARCA electronic invoicing." },
  { t_es: "Banca", t_en: "Banking", d_es: "CBU/CVU y BCRA.", d_en: "CBU/CVU and BCRA." },
  { t_es: "Off-ramp", t_en: "Off-ramp", d_es: "De stablecoin a pesos en tu cuenta.", d_en: "From stablecoin to pesos in your account." },
  { t_es: "MCP", t_en: "MCP", d_es: "Un server para Claude, Cursor y más.", d_en: "One server for Claude, Cursor and more." },
];

type Cmd = { label_es: string; label_en: string; cmd: string };

// Every command here is verified working (see report), the container is the
// OpenCode-style "copy-paste to start" block: real, not aspirational.
const COMMANDS: ReadonlyArray<Cmd> = [
  {
    label_es: "Instalá el toolkit",
    label_en: "Install the toolkit",
    cmd: "npm i @ar-agents/mercadopago",
  },
  {
    label_es: "Conectá el MCP remoto",
    label_en: "Connect the remote MCP",
    cmd: "claude mcp add --transport http ar-agents https://ar-agents.ar/api/mcp",
  },
  {
    label_es: "Cloná el starter",
    label_en: "Clone the starter",
    cmd: "npx degit ar-agents/ar-agents/apps/sociedad-ia-starter mi-sociedad",
  },
  {
    label_es: "Consultá el registro público",
    label_en: "Query the public registry",
    cmd: "curl https://ar-agents.ar/api/registry",
  },
];

export default function Home() {
  const { lang } = useLang();
  const es = lang === "es";

  const law = homeLawCopy(LAW_STATUS, es);

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
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* HERO: single column, LEFT-aligned (founder call 2026-07-13), headline does the
            work, whitespace over decoration. The first h1 line must stay ONE line on
            desktop (earlier founder call): size capped so "Creá tu sociedad
            automatizada." fits the container without wrapping. */}
        <header style={{ marginBottom: 72, paddingTop: 24 }}>
          <p style={eyebrow}>
            {es ? "Sociedades automatizadas · Argentina" : "Automated companies · Argentina"}
          </p>
          <h1
            style={{
              fontSize: "clamp(32px, 4.9vw, 60px)",
              margin: "16px 0 0",
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: "-0.04em",
            }}
          >
            {es ? "Creá tu sociedad automatizada." : "Create your automated company."}
            <br />
            <span style={{ color: "var(--accent)" }}>{es ? "Gratis." : "Free."}</span>
          </h1>

          <p
            style={{
              color: "var(--text-body)",
              fontSize: "clamp(17px, 2.2vw, 20px)",
              margin: "24px 0 0",
              maxWidth: 560,
              lineHeight: 1.55,
            }}
          >
            {es
              ? "Una sociedad automatizada opera con agentes de IA, no con empleados. Cobra, factura y paga en pesos, y deja prueba firmada de cada decisión."
              : "An automated company runs on AI agents, not employees. It charges, invoices and pays in pesos, and leaves signed proof of every decision."}
          </p>

          {law.banner ? (
            <div style={{ display: "flex" }}>
              <div style={lawBanner} role="status">
                <span aria-hidden="true" style={lawDot} />
                {law.banner}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <a href={STUDIO_URL} style={ctaPrimary}>
              {es ? "Ir a studio" : "Go to studio"}
            </a>
            <a href="/sdk" style={{ ...inlineLink, fontSize: 14 }}>
              {es ? "¿Sos developer? Ver la documentación" : "Developer? Read the docs"} →
            </a>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "12px 0 0" }}>{law.note}</p>

          <div style={{ ...proofStrip, marginTop: 26 }}>
            <span>Open source · MIT</span>
            <span aria-hidden="true">·</span>
            <span>37 {es ? "paquetes en npm" : "npm packages"}</span>
            <span aria-hidden="true">·</span>
            <span>{es ? "corre como su propia sociedad" : "runs as its own company"}</span>
          </div>
        </header>

        {/* START NOW: OpenCode-style copy-paste command container */}
        <Section
          eyebrow={es ? "Instalación" : "Install"}
          title={es ? "Empezá ahora" : "Start now"}
        >
          <CommandBlock es={es} />
        </Section>

        {/* HOW IT WORKS */}
        <Section
          id="como-funciona"
          eyebrow={es ? "Cómo funciona" : "How it works"}
          title={es ? "De idea a empresa en un solo prompt" : "From idea to company in one prompt"}
        >
          <div style={grid(248)}>
            {STEPS.map((s) => (
              <div key={s.n} style={card}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: "var(--accent)", marginBottom: 10, fontWeight: 600 }}>
                  {s.n}
                </div>
                <h3 style={cardTitle}>{es ? s.t_es : s.t_en}</h3>
                <p style={cardBody}>{es ? s.d_es : s.d_en}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40, display: "flex", justifyContent: "center" }}>
            <HeroDiagram lang={lang} />
          </div>
        </Section>

        {/* PROOF: the real journey, facts not hype */}
        <Section
          eyebrow={es ? "La prueba" : "The proof"}
          title={es ? "La primera sociedad operada por agentes ya existe" : "The first agent-operated company already exists"}
        >
          <div style={proofPanel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>
                  AR Agents Operaciones Sociedad Automatizada
                </div>
                <p style={{ ...cardBody, margin: "8px 0 0", maxWidth: 560 }}>
                  {es
                    ? "Constituida desde ar-agents studio, sin datos de prueba. Está listada en el registro público de sociedades automatizadas."
                    : "Incorporated from ar-agents studio, no test data. Listed in the public registry of automated companies."}
                </p>
              </div>
              <span style={societyBadge}>{es ? "en formación" : "forming"}</span>
            </div>
            <div style={{ marginTop: 18, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <a href={SOCIETY_URL} style={inlineLink}>{es ? "Ver la sociedad" : "See the company"} →</a>
              <a href="/registro" style={inlineLink}>{es ? "Ver la entrada en el registro" : "See the registry entry"} →</a>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <LinkCard
              href={es ? "/caso-ar-agents" : "/en/ar-agents-case"}
              eyebrow={es ? "Dogfood" : "Dogfood"}
              title={es ? "Nos constituimos a nosotros mismos" : "We incorporated ourselves"}
              body={es ? "ar-agents corre como Sociedad Automatizada y usa su propio Auditor. La prueba es pública." : "ar-agents runs as a Sociedad Automatizada and uses its own Auditor. The proof is public."}
              cta={es ? "Ver el caso" : "See the case"}
            />
          </div>
        </Section>

        {/* THE RAILS */}
        <Section
          eyebrow={es ? "Los rieles abiertos · gratis" : "The open rails · free"}
          title={es ? "Todo el stack argentino, como paquetes" : "The whole Argentine stack, as packages"}
        >
          <p style={{ ...cardBody, maxWidth: 680, marginBottom: 24 }}>
            {es
              ? "Cada pieza que una empresa argentina necesita, tipada para el Vercel AI SDK. Abierto, MIT, sin límites."
              : "Every piece an Argentine company needs, typed for the Vercel AI SDK. Open, MIT, no limits."}
          </p>
          <div style={grid(200)}>
            {RAILS.map((r) => (
              <div key={r.t_en} style={card}>
                <h3 style={{ ...cardTitle, fontFamily: FONT_MONO, fontSize: 15 }}>{es ? r.t_es : r.t_en}</h3>
                <p style={cardBody}>{es ? r.d_es : r.d_en}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <a href="/sdk" style={inlineLink}>
              {es ? "Ver toda la documentación" : "Browse the docs"} →
            </a>
          </div>
        </Section>

        {/* THE LAW */}
        <Section
          eyebrow={es ? "La ley" : "The law"}
          title={es ? "Por qué ahora" : "Why now"}
        >
          <p style={{ ...cardBody, maxWidth: 680 }}>
            {es
              ? "El anteproyecto de Ley General de Sociedades habilita las sociedades operadas por IA. Está en el Senado. ar-agents es la infraestructura técnica para cuando sea ley, escrita en RFCs abiertos."
              : "The draft General Companies Law enables AI-operated companies. It is in the Senate. ar-agents is the technical infrastructure for when it passes, written as open RFCs."}
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <a href={es ? "/legislacion" : "/en/legislation"} style={inlineLink}>{es ? "Síntesis legislativa" : "Legislative synthesis"} →</a>
            <a href="/rfcs/001" style={inlineLink}>{es ? "Leer los RFCs" : "Read the RFCs"} →</a>
          </div>
        </Section>

        {/* PRICING: one plain sentence, per docs/NORTH-STAR.md */}
        <p style={{ textAlign: "center", fontSize: 14, color: "var(--text-body)", margin: "0 0 80px", lineHeight: 1.6 }}>
          {es
            ? "Crear y operar tu sociedad es gratis. Cuando empieza a facturar, cobramos 5x el costo de los tokens que consumen sus agentes."
            : "Creating and operating your company is free. Once it starts earning, we charge 5x the token cost its agents consume."}{" "}
          <a href={es ? "/precios" : "/en/pricing"} style={inlineLink}>{es ? "Ver precios" : "See pricing"} →</a>
        </p>

        <Footer es={es} />
      </div>
      <HomeJsonLd />
    </main>
  );
}

/* ---------- command block ---------- */

function CommandBlock({ es }: { es: boolean }) {
  return (
    <div style={commandContainer}>
      {COMMANDS.map((c, i) => (
        <div key={c.cmd} style={{ ...commandRow, borderTop: i === 0 ? "none" : "1px solid var(--border-color)" }}>
          <div style={commandLabel}>{es ? c.label_es : c.label_en}</div>
          <div style={commandLine}>
            <code style={commandCode}>{c.cmd}</code>
            <CopyButton text={c.cmd} es={es} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text, es }: { text: string; es: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable; user can select manually */
        }
      }}
      style={{
        flexShrink: 0,
        padding: "4px 10px",
        fontSize: 11,
        fontFamily: FONT_MONO,
        background: copied ? "var(--success-bg)" : "var(--bg)",
        color: copied ? "var(--success)" : "var(--text-body)",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        boxShadow: "var(--shadow-ring-light)",
        transition: "background 120ms ease-out, color 120ms ease-out",
      }}
      aria-label={es ? "Copiar comando" : "Copy command"}
    >
      {copied ? (es ? "copiado ✓" : "copied ✓") : es ? "copiar" : "copy"}
    </button>
  );
}

/* ---------- helpers ---------- */

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ marginBottom: 80, paddingTop: 32, borderTop: "1px solid var(--border-color)" }}>
      <p style={eyebrowSty}>{eyebrow}</p>
      <h2 style={h2Sty}>{title}</h2>
      {children}
    </section>
  );
}

function LinkCard({
  href,
  eyebrow,
  title,
  body,
  cta,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <a href={href} style={{ ...card, display: "block", textDecoration: "none", color: "inherit" }}>
      <div style={{ ...eyebrowSty, marginBottom: 8 }}>{eyebrow}</div>
      <h3 style={cardTitle}>{title}</h3>
      <p style={cardBody}>{body}</p>
      <span style={{ ...inlineLink, marginTop: 12, display: "inline-block" }}>{cta} →</span>
    </a>
  );
}

function Footer({ es }: { es: boolean }) {
  const cols: { h: string; links: { l: string; href: string }[] }[] = [
    {
      h: es ? "Producto" : "Product",
      links: [
        { l: es ? "Studio" : "Studio", href: STUDIO_URL },
        { l: es ? "Cómo funciona" : "How it works", href: "/#como-funciona" },
        { l: es ? "Precios" : "Pricing", href: es ? "/precios" : "/en/pricing" },
        { l: es ? "Registro" : "Registry", href: "/registro" },
      ],
    },
    {
      h: "Docs",
      links: [
        { l: "SDK", href: "/sdk" },
        { l: es ? "Ejemplos" : "Examples", href: "/examples" },
        { l: es ? "Referencia" : "Reference", href: "/reference" },
        { l: es ? "Estado" : "Status", href: "/status" },
      ],
    },
    {
      h: es ? "La ley" : "The law",
      links: [
        { l: es ? "Por qué ahora" : "Why now", href: "/ley" },
        { l: es ? "Síntesis" : "Synthesis", href: es ? "/legislacion" : "/en/legislation" },
        { l: "RFCs", href: "/rfcs/001" },
      ],
    },
    {
      h: es ? "Recursos" : "Resources",
      links: [
        { l: es ? "El caso ar-agents" : "The ar-agents case", href: es ? "/caso-ar-agents" : "/en/ar-agents-case" },
        { l: es ? "Referencia" : "Reference", href: "/reference" },
        { l: "Changelog", href: "/changelog" },
        { l: es ? "Privacidad" : "Privacy", href: "/privacy" },
      ],
    },
  ];
  return (
    <footer style={{ paddingTop: 40, marginTop: 24, color: "var(--text-muted)", fontSize: 13, display: "grid", gap: 24, boxShadow: "inset 0 1px 0 var(--border-color)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 24 }}>
        {cols.map((c) => (
          <div key={c.h}>
            <p style={{ ...eyebrowSty, marginBottom: 8 }}>{c.h}</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
              {c.links.map((lk) => (
                <li key={lk.href + lk.l}>
                  <a href={lk.href} style={{ color: "var(--text-body)", textDecoration: "underline" }}>{lk.l}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
        <span>MIT (code) + CC-BY-4.0 (specs) · <a href="https://github.com/naza00000" style={{ color: "var(--text-body)", textDecoration: "underline" }}>Nazareno Clemente</a></span>
        <span style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <a href="https://github.com/ar-agents/ar-agents" style={{ color: "var(--text-body)", textDecoration: "underline" }}>GitHub</a>
          <a href="https://www.npmjs.com/org/ar-agents" style={{ color: "var(--text-body)", textDecoration: "underline" }}>npm</a>
        </span>
      </div>
    </footer>
  );
}

/* ---------- styles ---------- */

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "var(--text-muted)",
  margin: 0,
  fontFamily: FONT_MONO,
  fontWeight: 500,
};

const eyebrowSty: React.CSSProperties = {
  fontSize: 11,
  fontFamily: FONT_MONO,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--text-muted)",
  margin: "0 0 12px",
  fontWeight: 600,
};

const h2Sty: React.CSSProperties = {
  fontSize: "clamp(24px, 5vw, 34px)",
  fontWeight: 600,
  letterSpacing: "-0.03em",
  lineHeight: 1.15,
  margin: "0 0 28px",
  maxWidth: 760,
};

const card: React.CSSProperties = {
  background: "var(--bg-tint)",
  borderRadius: 12,
  padding: 24,
  boxShadow: "var(--card-shadow, var(--shadow-ring-light))",
};

const cardTitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  color: "var(--text)",
  margin: "0 0 6px",
};

const cardBody: React.CSSProperties = {
  fontSize: 14,
  color: "var(--text-body)",
  lineHeight: 1.55,
  margin: 0,
};

const inlineLink: React.CSSProperties = {
  fontSize: 14,
  color: "var(--accent)",
  fontWeight: 500,
  textDecoration: "underline",
};

const ctaPrimary: React.CSSProperties = {
  padding: "10px 18px",
  background: "var(--primary-bg)",
  color: "var(--primary-text)",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT_SANS,
  display: "inline-flex",
  alignItems: "center",
};

const proofStrip: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  fontSize: 12,
  color: "var(--text-muted)",
};

const proofPanel: React.CSSProperties = {
  background: "var(--bg-tint)",
  borderRadius: 12,
  padding: 24,
  boxShadow: "var(--card-shadow, var(--shadow-ring-light))",
};

const societyBadge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--accent-text, var(--accent))",
  background: "var(--accent-bg)",
  padding: "2px 10px",
  borderRadius: 9999,
  whiteSpace: "nowrap",
};

const commandContainer: React.CSSProperties = {
  background: "var(--bg-tint)",
  borderRadius: 12,
  boxShadow: "var(--card-shadow, var(--shadow-ring-light))",
  overflow: "hidden",
};

const commandRow: React.CSSProperties = {
  padding: "16px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const commandLabel: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-muted)",
  fontFamily: FONT_SANS,
};

const commandLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const commandCode: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 13,
  color: "var(--text)",
  overflowX: "auto",
  whiteSpace: "pre",
  flex: 1,
};

const lawBanner: React.CSSProperties = {
  marginTop: 22,
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 14px",
  background: "var(--warning-bg, var(--bg-tint))",
  color: "var(--text-body)",
  borderRadius: 8,
  fontSize: 13,
  lineHeight: 1.45,
  maxWidth: 560,
  boxShadow: "var(--shadow-border)",
};

const lawDot: React.CSSProperties = {
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: 9999,
  background: "var(--warning, var(--accent))",
  flexShrink: 0,
};

function grid(min: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
    gap: 14,
  };
}
