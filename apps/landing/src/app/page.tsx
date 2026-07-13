"use client";

// Home, redesigned around the founder's formula: as simple as OpenCode, as
// beautiful as Vercel (Geist + our light-blue accent), the copy of Cohere,
// the professionalism of Stripe, plus eve's "giant statement" and command-pill
// patterns. One promise, minimal chrome, whitespace as the design. Studio
// (studio.ar-agents.ar) is the product's front door now, so the primary CTA
// always points there, independent of LAW_STATUS. The LAW_STATUS pre/live
// switch still drives the honesty status line, now inside the "La ley"
// section (declutter pass, 2026-07-13) instead of under the hero CTA.

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

// Every command here is verified working (see report). `hl` is the substring
// rendered in accent color inside the pill (xAI/eve pill anatomy: one tinted
// segment, everything else neutral mono).
type Cmd = { cmd: string; hl: string };

const COMMANDS: ReadonlyArray<Cmd> = [
  {
    cmd: "npm i @ar-agents/mercadopago",
    hl: "@ar-agents/mercadopago",
  },
  {
    cmd: "claude mcp add --transport http ar-agents https://ar-agents.ar/api/mcp",
    hl: "https://ar-agents.ar/api/mcp",
  },
  {
    cmd: "npx degit ar-agents/ar-agents/apps/sociedad-ia-starter mi-sociedad",
    hl: "ar-agents/ar-agents/apps/sociedad-ia-starter",
  },
  {
    cmd: "curl https://ar-agents.ar/api/registry",
    hl: "https://ar-agents.ar/api/registry",
  },
];

// Hero inline pill (eve pattern): the one command short enough to sit beside
// the CTA button on one line inside the 800px column. The MCP one-liner and
// the degit command are too long; the npm install is the dev on-ramp that fits.
const HERO_COMMAND = COMMANDS[0];

// The hero already shows COMMANDS[0]; the install stack skips it so the same
// pill never renders twice on one screen.
const STACK_COMMANDS = COMMANDS.slice(1);

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
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* HERO: single column, LEFT-aligned (founder call 2026-07-13), headline does the
            work, whitespace over decoration. The first h1 line must stay ONE line on
            desktop (earlier founder call): size capped so "Creá tu sociedad
            automatizada." fits the container without wrapping. Declutter pass
            (2026-07-13): after the subtitle, ONLY the CTA row stays -- law banner,
            docs link, law note and proof strip moved to the "La ley" section and
            footer respectively (see below). Order stays eyebrow -> H1 -> subtitle ->
            CTA row per the founder's explicit call, NOT eve's headline-first order. */}
        <header style={{ marginBottom: 72, paddingTop: 24 }}>
          <p style={eyebrow}>
            {es ? "Sociedades automatizadas · Argentina" : "Automated companies · Argentina"}
          </p>
          <h1
            style={{
              fontSize: "clamp(30px, 5vw, 45px)",
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

          {/* CTA row, eve pattern: primary button + ONE inline command pill (the
              dev on-ramp), one flex row, wraps on narrow screens. */}
          <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <a href={STUDIO_URL} style={ctaPrimary}>
              {es ? "Crear mi empresa" : "Create my company"}
            </a>
            <div style={{ flex: "1 1 300px", maxWidth: 380 }}>
              <CommandPill cmd={HERO_COMMAND.cmd} hl={HERO_COMMAND.hl} es={es} size="sm" />
            </div>
          </div>
        </header>

        {/* START NOW: xAI/eve-style command pill stack, all 4 verified commands */}
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
                <div style={{ ...cardEyebrow, marginBottom: 10 }}>
                  {es ? "Paso" : "Step"} {s.n}
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

        {/* PROOF: eve's "giant statement + quiet explainer" pattern applied once
            here, the founder's explicit call ("born for this"). The claim is
            large, tight-tracked, alone; the explainer is small and plain; the
            factual specifics stay in the card below, unchanged in substance. */}
        <section style={sectionOuter}>
          <p style={eyebrowSty}>{es ? "La prueba" : "The proof"}</p>
          <h2 style={giantStatement}>
            {es
              ? "La primera sociedad operada por agentes ya existe."
              : "The first agent-operated company already exists."}
          </h2>
          <p style={quietExplainer}>
            {es
              ? "Cada decisión queda firmada y verificable, no es una promesa."
              : "Every decision is signed and verifiable, not a promise."}
          </p>

          <div style={proofPanel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ ...cardEyebrow, marginBottom: 8 }}>{es ? "Sociedad activa" : "Active company"}</div>
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
        </section>

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

        {/* THE LAW: the honesty banner + note relocated here from the hero
            (declutter pass, 2026-07-13), still driven by homeLawCopy()/LAW_STATUS
            -- the drift-guard test only checks the pure functions + that page.tsx
            branches on them, not placement. */}
        <Section
          eyebrow={es ? "La ley" : "The law"}
          title={es ? "Por qué ahora" : "Why now"}
        >
          <div style={lawStatusLine} role="status">
            {law.banner ? <span aria-hidden="true" style={lawDot} /> : null}
            <span style={{ color: "var(--text)" }}>{law.banner ?? law.note}</span>
            {law.banner ? <span style={{ color: "var(--text-muted)" }}> · {law.note}</span> : null}
          </div>
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

/* ---------- command pills (xAI / eve pill anatomy) ---------- */
// $ muted prefix, mono command, ONE accent-tinted segment, icon-only copy
// button at the right edge, rounded-full, subtle 1px border, slightly raised
// surface. Used both for the install-section stack and the single hero pill.

function CommandBlock({ es }: { es: boolean }) {
  return (
    <div>
      <div style={commandStack}>
        {STACK_COMMANDS.map((c) => (
          <CommandPill key={c.cmd} cmd={c.cmd} hl={c.hl} es={es} />
        ))}
      </div>
      <p style={commandCaption}>
        {es ? "Copialo y pegalo en tu terminal" : "Copy and paste into your terminal"}
      </p>
    </div>
  );
}

function CommandPill({
  cmd,
  hl,
  es,
  size = "md",
}: {
  cmd: string;
  hl: string;
  es: boolean;
  size?: "sm" | "md";
}) {
  const idx = cmd.indexOf(hl);
  const pre = idx >= 0 ? cmd.slice(0, idx) : cmd;
  const mid = idx >= 0 ? hl : "";
  const post = idx >= 0 ? cmd.slice(idx + hl.length) : "";
  return (
    <div style={{ ...commandPill, padding: size === "sm" ? "10px 16px" : "16px 22px" }}>
      <span aria-hidden="true" style={commandPrompt}>$</span>
      <code style={{ ...commandCode, fontSize: size === "sm" ? 14 : 15 }}>
        {pre}
        <span style={{ color: "var(--accent)" }}>{mid}</span>
        {post}
      </code>
      <CopyIconButton text={cmd} es={es} />
    </div>
  );
}

function CopyIconButton({ text, es }: { text: string; es: boolean }) {
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
        width: 30,
        height: 30,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: copied ? "var(--accent)" : "var(--text-muted)",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        transition: "color 120ms ease-out",
      }}
      aria-label={es ? "Copiar comando" : "Copy command"}
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
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
    <section id={id} style={sectionOuter}>
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
      {/* Relocated from the hero's old proof strip (declutter pass, 2026-07-13):
          same facts, quieter home. */}
      <div style={proofStrip}>
        <span>Open source · MIT</span>
        <span aria-hidden="true">·</span>
        <span>37 {es ? "paquetes en npm" : "npm packages"}</span>
        <span aria-hidden="true">·</span>
        <span>{es ? "corre como su propia sociedad" : "runs as its own company"}</span>
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

// Mono uppercase micro-label: the one eyebrow style used for both section
// headers and card eyebrows (STEPS "Paso NN", proof panel "Sociedad activa"),
// so the "card language" reads as one system (founder call, Vercel-grade
// containers pass, 2026-07-13).
const eyebrowSty: React.CSSProperties = {
  fontSize: 11,
  fontFamily: FONT_MONO,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  margin: "0 0 12px",
  fontWeight: 600,
};

const cardEyebrow: React.CSSProperties = {
  ...eyebrowSty,
  margin: 0,
};

const h2Sty: React.CSSProperties = {
  fontSize: "clamp(24px, 5vw, 34px)",
  fontWeight: 600,
  letterSpacing: "-0.03em",
  lineHeight: 1.15,
  margin: "0 0 28px",
  maxWidth: 760,
};

// The shared section wrapper rhythm, also used by the bespoke PROOF section
// below so its spacing matches every Section()-wrapped block.
const sectionOuter: React.CSSProperties = {
  marginBottom: 80,
  paddingTop: 32,
  borderTop: "1px solid var(--border-color)",
};

// Vercel-grade container: 1px border, one step above the page bg, no shadow.
const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border-color)",
  borderRadius: 12,
  padding: 26,
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

// Relocated proof-strip facts, now a quiet footer line (was the hero's
// bottom-most element before the declutter pass).
const proofStrip: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  fontSize: 12,
  color: "var(--text-muted)",
};

// Same Vercel-grade container language as `card`.
const proofPanel: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border-color)",
  borderRadius: 12,
  padding: 26,
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

// eve's "giant statement + quiet explainer": one big, tight-tracked claim,
// used once (the PROOF section, per the founder's explicit call).
const giantStatement: React.CSSProperties = {
  fontSize: "clamp(32px, 6vw, 48px)",
  fontWeight: 600,
  letterSpacing: "var(--tracking-display)",
  lineHeight: 1.08,
  margin: "0 0 18px",
  maxWidth: 680,
};

const quietExplainer: React.CSSProperties = {
  fontSize: 16,
  color: "var(--text-body)",
  lineHeight: 1.6,
  margin: "0 0 28px",
  maxWidth: 520,
};

/* Command pills: xAI-style / eve-style. Fully rounded, subtle 1px border,
   a surface one step above the page bg, generous padding, no shadow. */

const commandStack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const commandPill: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  background: "var(--card)",
  border: "1px solid var(--border-color)",
  borderRadius: 9999,
};

const commandPrompt: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 15,
  color: "var(--text-muted)",
  flexShrink: 0,
  userSelect: "none",
};

const commandCode: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 15,
  color: "var(--text)",
  overflowX: "auto",
  whiteSpace: "pre",
  flex: 1,
  lineHeight: 1.4,
};

const commandCaption: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  margin: "14px 0 0",
};

// The relocated honesty banner + note (was under the hero CTA), now a slim
// status line inside the "La ley" section.
const lawStatusLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 13,
  lineHeight: 1.5,
  marginBottom: 20,
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
