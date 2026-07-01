"use client";

// Home, rebuilt around one promise: create or register an autonomous company
// in Argentina, run by AI, on ar-agents. Structure first; copy is a later pass.
// The hero CTA + law banner are driven by LAW_STATUS so the whole site flips
// from "pre" (honest waitlist) to "live" (real flow) the day the law passes.
//
// Design system stays the existing Geist + CSS-var theme (globals.css), and we
// reuse the proven components (DemoTerminal, LiveChat, HeroDiagram).

import { useCallback, useState } from "react";
import { DemoTerminal } from "./demo-terminal";
import { HeroDiagram } from "./hero-diagram";
import dynamic from "next/dynamic";
import { useLang } from "./i18n";
import { HomeJsonLd } from "./json-ld";
import { LAW_STATUS } from "./law-status";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

// bundle-dynamic-imports (vercel react-best-practices): LiveChat is heavy and
// click-gated, so lazy-load it to keep it out of the initial home bundle.
const LiveChat = dynamic(() => import("./live-chat").then((m) => m.LiveChat), {
  ssr: false,
});

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

export default function Home() {
  const { lang } = useLang();
  const es = lang === "es";
  const [liveOpen, setLiveOpen] = useState(false);
  const toggleLive = useCallback(() => setLiveOpen((v) => !v), []);
  const closeLive = useCallback(() => setLiveOpen(false), []);

  const law =
    LAW_STATUS === "live"
      ? {
          cta: es ? "Creá tu sociedad" : "Create your company",
          banner: null as string | null,
          note: es ? "Registro abierto." : "Registration open.",
        }
      : {
          cta: es ? "Empezar" : "Get started",
          banner: es
            ? "El anteproyecto de Ley de Sociedades está en el Senado. Todavía no es ley."
            : "The draft Companies Law is in the Senate. It is not law yet.",
          note: es
            ? "Generás todo hoy. Registrás el día que sea ley."
            : "Generate everything today. Register the day it becomes law.",
        };

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
        {/* HERO: centered wide title, then content (left) + card (right) */}
        <header style={{ marginBottom: 96, paddingTop: 16 }}>
          <p style={eyebrow}>
            {es ? "Sociedades automatizadas · Argentina" : "Automated companies · Argentina"}
          </p>
          <h1
            style={{
              fontSize: "clamp(20px, calc((100vw - 48px) / 15.2), 78px)",
              margin: "16px 0 0",
              maxWidth: 1200,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: "-0.04em",
              textAlign: "left",
              textWrap: "wrap",
            }}
          >
            {es ? "Creá una sociedad automatizada" : "Create an automated company"}
            <br />
            {es ? " en Argentina." : " in Argentina."}
          </h1>

          <div className="hero-grid" style={{ marginTop: "clamp(28px, 3vw, 40px)", alignItems: "center" }}>
            <div>
              <p
                style={{
                  color: "var(--text-body)",
                  fontSize: "clamp(17px, 2.2vw, 20px)",
                  margin: 0,
                  maxWidth: 540,
                  lineHeight: 1.55,
                }}
              >
                {es
                  ? "Una empresa que opera sola, con agentes de IA. Cobra, factura y paga en pesos, y deja prueba firmada de cada decisión. El núcleo es abierto y gratis."
                  : "A company that runs itself, with AI agents. It charges, invoices and pays in pesos, and leaves signed proof of every decision. The core is open and free."}
              </p>

              {law.banner ? (
                <div style={lawBanner} role="status">
                  <span aria-hidden="true" style={lawDot} />
                  {law.banner}
                </div>
              ) : null}

              <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <a href="/incorporar" style={ctaPrimary}>
                  {law.cta}
                </a>
                <button type="button" onClick={toggleLive} aria-pressed={liveOpen} style={ctaGhost}>
                  <span aria-hidden="true" style={pulseDot} />
                  {es ? "Probalo en vivo" : "Try it live"}
                </button>
              </div>
              <p style={{ margin: "14px 0 0", fontSize: 13 }}>
                <a href="/sdk" style={inlineLink}>
                  {es ? "¿Sos developer? Ver la documentación" : "Developer? Read the docs"} →
                </a>
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "10px 0 0" }}>
                {law.note}
              </p>

              <div style={{ ...proofStrip, marginTop: 28 }}>
                <span>Open source · MIT</span>
                <span aria-hidden="true">·</span>
                <span>37 {es ? "paquetes en npm" : "npm packages"}</span>
                <span aria-hidden="true">·</span>
                <span>{es ? "corre como su propia sociedad" : "runs as its own company"}</span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <SocietyCard es={es} />
            </div>
          </div>
        </header>

        {/* HOW IT WORKS */}
        <Section
          id="como-funciona"
          eyebrow={es ? "Cómo funciona" : "How it works"}
          title={es ? "De un prompt a una empresa que rinde cuentas" : "From a prompt to a company that is accountable"}
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

        {/* PROOF */}
        <Section
          eyebrow={es ? "La prueba" : "The proof"}
          title={es ? "Funciona hoy. Mirá." : "It works today. See for yourself."}
        >
          <section style={{ marginBottom: 24, maxWidth: 900, marginLeft: "auto", marginRight: "auto" }}>
            {liveOpen ? <LiveChat onClose={closeLive} /> : null}
            <DemoTerminal />
          </section>
          <div style={grid(248)}>
            <LinkCard
              href={es ? "/caso-ar-agents" : "/en/ar-agents-case"}
              eyebrow={es ? "Dogfood" : "Dogfood"}
              title={es ? "Nos constituimos a nosotros mismos" : "We incorporated ourselves"}
              body={es ? "ar-agents corre como Sociedad Automatizada y usa su propio Auditor. La prueba es pública." : "ar-agents runs as a Sociedad Automatizada and uses its own Auditor. The proof is public."}
              cta={es ? "Ver el caso" : "See the case"}
            />
            <LinkCard
              href="/registro"
              eyebrow={es ? "Registro de buen estado" : "Good-standing registry"}
              title={es ? "Tu reputación, verificable por cualquiera" : "Your standing, verifiable by anyone"}
              body={es ? "Un oráculo público: una contraparte consulta y verifica una sociedad antes de operar con ella. Sin pedirte la clave." : "A public oracle: a counterparty looks up and verifies a company before transacting with it. Without asking for your key."}
              cta={es ? "Ver el registro" : "See the registry"}
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

        {/* EL AUDITOR + good-standing, the recurring product (day-1 buyer) */}
        <section style={{ marginBottom: 80, paddingTop: 32, borderTop: "1px solid var(--border-color)" }}>
          <p style={eyebrowSty}>{es ? "El Auditor · producto recurrente" : "El Auditor · recurring product"}</p>
          <h2 style={h2Sty}>{es ? "Confianza verificable para tu agente, hoy" : "Verifiable trust for your agent, today"}</h2>
          <div className="hero-grid">
            <div>
              <p style={{ ...cardBody, fontSize: 16 }}>
                {es
                  ? "¿Tu agente ya mueve plata? El Auditor firma cada decisión (HMAC + Ed25519) en un log que cualquiera verifica sin pedirte la clave, anclado a Bitcoin. Es la prueba de que tu agente es responsable, auditado y está en buen estado. Con o sin ley."
                  : "Already moving money with an agent? El Auditor signs every decision (HMAC + Ed25519) into a log anyone can verify without asking for your key, anchored to Bitcoin. It is the proof your agent is accountable, audited and in good standing. With or without a law."}
              </p>
              <p style={{ ...cardBody, margin: "12px 0 0" }}>
                {es
                  ? "Cualquier contraparte, un banco, un marketplace u otro agente, puede consultar tu buen estado antes de operar con vos. En Argentina, ese mismo log es tu defensa ante el art. 102."
                  : "Any counterparty, a bank, a marketplace or another agent, can check your good standing before transacting with you. In Argentina, that same log is your art. 102 defense."}
              </p>
              <div style={{ marginTop: 20, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <a href="/precios" style={ctaPrimary}>{es ? "USD 199/mes · ver precios" : "USD 199/mo · see pricing"}</a>
                <a href="/auditor" style={inlineLink}>{es ? "Cómo funciona" : "How it works"} →</a>
                <a href="/registro" style={inlineLink}>{es ? "Ver el registro" : "See the registry"} →</a>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <AuditLogVisual es={es} />
            </div>
          </div>
        </section>

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

        {/* FOR DEVELOPERS & AGENTS */}
        <Section
          eyebrow={es ? "Para developers y agentes" : "For developers and agents"}
          title={es ? "Construí sobre los rieles" : "Build on the rails"}
        >
          <p style={{ ...cardBody, maxWidth: 680 }}>
            {es
              ? "Instalá los paquetes, conectá el MCP, o dejá que un agente se registre solo. Todo tipado, en el Edge, con provenance."
              : "Install the packages, connect the MCP, or let an agent register itself. Fully typed, Edge-ready, with provenance."}
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <a href="/sdk" style={inlineLink}>{es ? "Empezar a construir" : "Start building"} →</a>
            <a href="https://github.com/ar-agents/ar-agents" style={inlineLink}>GitHub →</a>
          </div>
        </Section>

        <Footer es={es} />
      </div>
      <HomeJsonLd />
    </main>
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
        { l: es ? "Cómo funciona" : "How it works", href: "/#como-funciona" },
        { l: es ? "Precios" : "Pricing", href: es ? "/precios" : "/en/pricing" },
        { l: "Demo", href: "/play" },
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

// Hero visual: a sample "generated society" card showing the outcome (the
// finished, conformant company) + a signed audit-log line. Fictional data.
function SocietyCard({ es }: { es: boolean }) {
  const rows: ReadonlyArray<[string, string]> = es
    ? [
        ["estado", "operando"],
        ["agentes", "3"],
        ["creada", "12 jun 2026"],
        ["última firma", "hace 2 min"],
      ]
    : [
        ["status", "operating"],
        ["agents", "3"],
        ["created", "Jun 12, 2026"],
        ["last signature", "2 min ago"],
      ];
  return (
    <div style={societyCard}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
          }}
        >
          {es ? "Sociedad automatizada" : "Automated company"}
        </span>
        <span style={societyBadge}>✓ {es ? "conforme" : "compliant"}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>Sociedad Demo SA</div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: "var(--text-body)", marginTop: 4 }}>
        CUIT 30-12345678-9
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>{k}</span>
            <span style={{ color: "var(--text-body)" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={societyLog}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: "var(--text-muted)" }}>
          auditor.log
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: "var(--accent)" }}>
          0x9f3a2c ✓ Ed25519
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "12px 0 0", lineHeight: 1.5 }}>
        {es
          ? "Ejemplo ilustrativo. Generada y operada por agentes. Cada decisión, firmada."
          : "Illustrative example. Generated and operated by agents. Every decision, signed."}
      </p>
    </div>
  );
}

// El Auditor peak visual: a few signed audit-log entries (HMAC + Ed25519).
function AuditLogVisual({ es }: { es: boolean }) {
  const entries: ReadonlyArray<[string, string, string]> = es
    ? [
        ["10:02:14", "emitir_factura", "CAE ✓"],
        ["10:02:15", "cobrar_mp", "$45.000 ✓"],
        ["10:03:01", "pagar_proveedor", "USDC→ARS ✓"],
        ["10:03:02", "firmar_log", "Ed25519 ✓"],
      ]
    : [
        ["10:02:14", "issue_invoice", "CAE ✓"],
        ["10:02:15", "charge_mp", "$45,000 ✓"],
        ["10:03:01", "pay_supplier", "USDC→ARS ✓"],
        ["10:03:02", "sign_log", "Ed25519 ✓"],
      ];
  return (
    <div style={societyCard}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
          }}
        >
          auditor.log
        </span>
        <span style={societyBadge}>HMAC + Ed25519</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {entries.map(([t, a, h]) => (
          <div
            key={t + a}
            style={{ display: "flex", justifyContent: "space-between", gap: 12, fontFamily: FONT_MONO, fontSize: 12 }}
          >
            <span style={{ color: "var(--text-muted)" }}>{t}</span>
            <span style={{ color: "var(--text-body)", flex: 1 }}>{a}</span>
            <span style={{ color: "var(--accent)" }}>{h}</span>
          </div>
        ))}
      </div>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          margin: "14px 0 0",
          paddingTop: 12,
          borderTop: "1px solid var(--border-color)",
          lineHeight: 1.5,
        }}
      >
        {es ? "Verificable por cualquiera, sin pedirte la clave." : "Verifiable by anyone, without asking for your key."}
      </p>
    </div>
  );
}

const proofStrip: React.CSSProperties = {
  marginTop: 22,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  fontSize: 12,
  color: "var(--text-muted)",
};

const societyCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: "var(--bg-tint)",
  borderRadius: 12,
  padding: 24,
  boxShadow: "var(--card-shadow)",
};

const societyBadge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--success)",
  background: "var(--success-bg)",
  padding: "2px 10px",
  borderRadius: 9999,
};

const societyLog: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 14,
  borderTop: "1px solid var(--border-color)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

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
};

const ctaGhost: React.CSSProperties = {
  padding: "10px 16px",
  background: "var(--bg)",
  color: "var(--text)",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  textDecoration: "none",
  boxShadow: "var(--shadow-ring-light)",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT_SANS,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const pulseDot: React.CSSProperties = {
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: 9999,
  background: "var(--accent)",
  boxShadow: "0 0 0 4px rgba(0, 188, 255, 0.18)",
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
  maxWidth: 680,
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
