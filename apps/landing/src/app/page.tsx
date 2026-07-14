"use client";

// Home, rebuilt on the vercel.com/eve anatomy (founder's explicit call,
// 2026-07-13: "completely overhauling including copy changes"). Giant-but-light
// headlines (weight 450, tight tracking), a 40px command pill, numbered
// inventories, stack-table rows and a 96px finale. Copy voice: short
// declaratives, zero hype, es-AR voseo, no em dashes. Studio
// (studio.ar-agents.ar) is the product's front door, so the primary CTA
// always points there, independent of LAW_STATUS. The LAW_STATUS pre/live
// switch drives a single slim status line under the finale button.

import { useState } from "react";
import { useLang } from "./i18n";
import { HomeJsonLd } from "./json-ld";
import { homeLawCopy, LAW_STATUS } from "./law-status";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const STUDIO_URL = "https://studio.ar-agents.ar";

// The one command that fits beside the CTA button in a compact 40px pill
// (eve pattern: one command, not a stack). This is the product's terminal
// on-ramp (the coach, in a terminal), not one rail among 39 packages.
// Verified working: `npx -y @ar-agents/cli` prints usage (login/whoami/
// chat/constitute/society).
const HERO_COMMAND = { cmd: "npx @ar-agents/cli chat", hl: "@ar-agents/cli" };

// ---------------------------------------------------------------------------
// Section 1 (pattern A): numbered inventory. `tag` is an optional small
// "leverages" chip; left untranslated since it names a proper noun (studio,
// art. 102, Vercel, Mercado Pago) that reads the same in both languages.
// ---------------------------------------------------------------------------
type InventoryItem = {
  n: string;
  t_es: string;
  t_en: string;
  d_es: string;
  d_en: string;
  tag?: string;
};

const INVENTORY: ReadonlyArray<InventoryItem> = [
  {
    n: "01",
    t_es: "Describí tu idea",
    t_en: "Describe your idea",
    d_es: "El coach valida el negocio antes de crearlo.",
    d_en: "The coach validates the business before creating it.",
    tag: "studio",
  },
  {
    n: "02",
    t_es: "Mirá el borrador",
    t_en: "See the draft",
    d_es: "Denominación, objeto, capital y capacidades. Lo ajustás conversando.",
    d_en: "Name, purpose, capital, and capabilities. You adjust it by talking.",
  },
  {
    n: "03",
    t_es: "Registrá la sociedad",
    t_en: "Register the company",
    d_es: "Firmás como administrador de la sociedad y se constituye de manera automática.",
    d_en: "You sign as the company's administrator and it incorporates automatically.",
    tag: "art. 102",
  },
  {
    n: "04",
    t_es: "Desplegá tu agente",
    t_en: "Deploy your agent",
    d_es: "El estudio crea el proyecto, configura todo y deja el agente corriendo.",
    d_en: "The studio creates the project, configures everything, and leaves the agent running.",
    tag: "Vercel",
  },
  {
    n: "05",
    t_es: "Conectá credenciales",
    t_en: "Connect credentials",
    d_es: "Mercado Pago, AFIP, WhatsApp. Las cargás en el panel, se validan solas.",
    d_en: "Mercado Pago, AFIP, WhatsApp. You add them in the panel, they validate themselves.",
  },
  {
    n: "06",
    t_es: "Gestionala desde el sitio web",
    t_en: "Manage it from the website",
    d_es: "Deploy, aprobaciones, kill switch y cada acción del agente, en una pantalla.",
    d_en: "Deploy, approvals, kill switch, and every agent action, on one screen.",
  },
  {
    n: "07",
    t_es: "Cobrá y facturá",
    t_en: "Charge and invoice",
    d_es: "Pagos, factura electrónica y pesos en tu cuenta.",
    d_en: "Payments, electronic invoicing, and pesos in your account.",
    tag: "Mercado Pago, AFIP",
  },
];

// ---------------------------------------------------------------------------
// Section 2 (pattern B): stack-table rows, term + one-line description.
// ---------------------------------------------------------------------------
type StackRow = { term_es: string; term_en: string; desc_es: string; desc_en: string };

const STACK_ROWS: ReadonlyArray<StackRow> = [
  { term_es: "Pagos", term_en: "Payments", desc_es: "Mercado Pago: cobros, suscripciones, cuotas.", desc_en: "Mercado Pago: charges, subscriptions, installments." },
  { term_es: "Identidad", term_en: "Identity", desc_es: "CUIT, padrón ARCA, validación.", desc_en: "CUIT, ARCA padron, validation." },
  { term_es: "Facturación", term_en: "Invoicing", desc_es: "Factura electrónica AFIP con CAE.", desc_en: "AFIP electronic invoicing with CAE." },
  { term_es: "Banca", term_en: "Banking", desc_es: "CBU, CVU y BCRA.", desc_en: "CBU, CVU, and BCRA." },
  { term_es: "Billetera", term_en: "Wallet", desc_es: "USDC con política de gasto en dos capas.", desc_en: "USDC with a two-layer spend policy." },
  { term_es: "Off-ramp", term_en: "Off-ramp", desc_es: "De stablecoin a pesos en tu cuenta.", desc_en: "From stablecoin to pesos in your account." },
  { term_es: "MCP", term_en: "MCP", desc_es: "Un server para Claude, Cursor y más.", desc_en: "One server for Claude, Cursor, and more." },
];

// ---------------------------------------------------------------------------
// Section 3 (pattern C): 6-card feature grid. The last card absorbs the old
// proof section (links to the live society + the public registry entry).
// ---------------------------------------------------------------------------
type FeatureCard = {
  t_es: string;
  t_en: string;
  d_es: string;
  d_en: string;
  /** The one card that links out (to the case study). */
  proof?: boolean;
};

const FEATURE_CARDS: ReadonlyArray<FeatureCard> = [
  {
    t_es: "Aprobaciones humanas",
    t_en: "Human approvals",
    d_es: "Las acciones irreversibles esperan tu OK. La sesión se pausa y retoma sola.",
    d_en: "Irreversible actions wait for your OK. The session pauses and resumes on its own.",
  },
  {
    t_es: "Audit log firmado",
    t_en: "Signed audit log",
    d_es: "Cada tool call queda firmado con HMAC. Cualquiera lo verifica.",
    d_en: "Every tool call is signed with HMAC. Anyone can verify it.",
  },
  {
    t_es: "Kill switch",
    t_en: "Kill switch",
    d_es: "Suspendé la sociedad con un click. Todo se detiene, nada se pierde.",
    d_en: "Suspend the company with one click. Everything stops, nothing is lost.",
  },
  {
    t_es: "Política de gasto",
    t_en: "Spend policy",
    d_es: "La billetera rechaza sola lo que excede el límite. Dos capas independientes.",
    d_en: "The wallet rejects on its own whatever exceeds the limit. Two independent layers.",
  },
  {
    t_es: "Evals",
    t_en: "Evals",
    d_es: "El coach pasa sus propias evaluaciones en cada deploy.",
    d_en: "The coach passes its own evaluations on every deploy.",
  },
  {
    t_es: "Primera sociedad viva",
    t_en: "First company alive",
    d_es: "AR Agents Operaciones ya opera con su historia auditada.",
    d_en: "AR Agents Operaciones already operates with its audited history.",
    proof: true,
  },
];

// ---------------------------------------------------------------------------
// Hero file-tree visual: illustrative directory for a generic sociedad
// (estatuto = the real legal term used in the AR Agents Operaciones filing
// pack; agente.ts / herramientas/ mirror the real eve agent-directory shape
// used by apps/incorporate-agent, translated to the domain's own words).
// ---------------------------------------------------------------------------
type TreeRow = { depth: number; kind: "folder" | "file"; label: string };

const FILE_TREE: ReadonlyArray<TreeRow> = [
  { depth: 0, kind: "folder", label: "sociedad/" },
  { depth: 1, kind: "file", label: "estatuto.md" },
  { depth: 1, kind: "file", label: "agente.ts" },
  { depth: 1, kind: "folder", label: "herramientas/" },
  { depth: 2, kind: "file", label: "facturar.ts" },
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
        padding: "0 0 120px",
      }}
    >
      {/* HERO: wide (1100px) container so the H1 gets the full line budget
          64px/-0.06em tracking needs; the file-tree card is a fixed 320px
          column on desktop (.home-hero, globals.css) and stacks below the
          CTA row on mobile. Order follows the measured eve anatomy: H1 ->
          toggle line -> CTA row -> analogy paragraph. */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 0", minHeight: "calc(100svh - 64px)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {/* H1 spans the full hero width (own row) so "Creá tu sociedad
            automatizada." gets the ~1050px line budget it needs to stay on
            one line at 64px. The file-tree card sits to the right of the
            CTA/analogy block below it (.home-hero), not beside the H1. */}
        <h1 style={h1Sty}>
          {es ? "Creá tu sociedad automatizada." : "Create your automated company."}
          <br />
          <span style={{ color: "var(--accent)" }}>{es ? "Gratis." : "Free."}</span>
        </h1>

        <div className="home-hero" style={{ marginTop: 20 }}>
          <div>
            <ToggleLine es={es} />

            <div style={ctaRow}>
              <a href={STUDIO_URL} style={ctaPrimary}>
                {es ? "Crear mi empresa" : "Create my company"}
              </a>
              <div style={{ minWidth: 0 }}>
                <CommandPill cmd={HERO_COMMAND.cmd} hl={HERO_COMMAND.hl} es={es} />
              </div>
            </div>

            <p style={analogyP}>
              {es
                ? "Como una empresa tradicional, pero operada por agentes. Cobra, factura y paga de manera automática. Cada decisión queda firmada y es verificable."
                : "Like a traditional company, but run by agents. It charges, invoices, and pays in pesos. Every decision is signed and verifiable."}
            </p>
          </div>

          <FileTreeCard />
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 24px" }}>
        {/* SECTION 1 (pattern A): giant statement + numbered inventory */}
        <section id="conversacion" style={sectionOuter}>
          <h2 style={sectionHeading}>
            {es ? "Describí tu empresa y creala en un click." : "Describe your company and create it in one click."}
          </h2>
          <p style={quietExplainer}>
            {es
              ? "Describile tu idea al agente. El estudio valida el negocio, arma el borrador y deja la sociedad operando."
              : "Describe your idea to the agent. The studio validates the business, drafts the plan, and leaves the company running."}
          </p>
          <div style={{ marginTop: 12 }}>
            {INVENTORY.map((item) => (
              <InventoryRow
                key={item.n}
                n={item.n}
                title={es ? item.t_es : item.t_en}
                body={es ? item.d_es : item.d_en}
                tag={item.tag}
              />
            ))}
          </div>
        </section>

        {/* SECTION 2 (pattern B): stack table of the open rails */}
        <section id="rieles" style={sectionOuter}>
          <h2 style={sectionHeading}>{es ? "Rieles de código abierto" : "Open-source rails"}</h2>
          <p style={quietExplainer}>
            {es
              ? "39 paquetes MIT en npm. Todo el stack argentino que una sociedad necesita, sin pegar soluciones sueltas."
              : "39 MIT packages on npm. The whole Argentine stack a company needs, without gluing together loose solutions."}
          </p>
          <dl style={{ margin: "12px 0 0", display: "grid", gap: 1 }}>
            {STACK_ROWS.map((r) => (
              <div key={r.term_en} className="eve-use-row" style={stackRow}>
                <dt style={stackTerm}>{es ? r.term_es : r.term_en}</dt>
                <dd style={stackDesc}>{es ? r.desc_es : r.desc_en}</dd>
              </div>
            ))}
          </dl>
          <div style={{ marginTop: 20 }}>
            <a href="/sdk" style={inlineLink}>
              {es ? "Ver toda la documentación" : "Browse the docs"} →
            </a>
          </div>
        </section>

        {/* SECTION 3 (pattern C): 6-card feature grid, governance/audit/control */}
        <section id="gobernanza" style={sectionOuter}>
          <h2 style={sectionHeading}>
            {es ? "Todo lo que una sociedad seria necesita" : "Everything a serious company needs"}
          </h2>
          <p style={quietExplainer}>
            {es
              ? "Gobernanza, auditoría y control humano vienen de fábrica. Vos decidís, el agente ejecuta."
              : "Governance, audit, and human control come standard. You decide, the agent executes."}
          </p>
          <div style={{ ...grid(228), marginTop: 12 }}>
            {FEATURE_CARDS.map((c) =>
              c.proof ? (
                // The proof card is the one card that links out: the whole
                // card goes to the case study (no inline link texts, founder
                // call), where the audited history and registry entry live.
                <a key={c.t_en} href="/caso-ar-agents" style={{ ...card, textDecoration: "none", display: "block" }}>
                  <h3 style={cardTitle}>{es ? c.t_es : c.t_en}</h3>
                  <p style={cardBody}>{es ? c.d_es : c.d_en}</p>
                </a>
              ) : (
                <div key={c.t_en} style={card}>
                  <h3 style={cardTitle}>{es ? c.t_es : c.t_en}</h3>
                  <p style={cardBody}>{es ? c.d_es : c.d_en}</p>
                </div>
              ),
            )}
          </div>
        </section>

        {/* FINALE: one giant statement, one button, one status line. Nothing else. */}
        <section id="finale" style={{ ...sectionOuter, textAlign: "center", marginBottom: 48 }}>
          <h2 style={finaleHeading}>{es ? "Creá la tuya." : "Create yours."}</h2>
          <div style={{ marginTop: 32, display: "flex", justifyContent: "center" }}>
            <a href={STUDIO_URL} style={ctaPrimary}>
              {es ? "Crear mi empresa" : "Create my company"}
            </a>
          </div>
          <div style={lawStatusLine} role="status">
            {law.banner ? <span aria-hidden="true" style={lawDot} /> : null}
            <span style={{ color: "var(--text-muted)" }}>{law.banner ?? law.note}</span>
            {law.banner ? <span style={{ color: "var(--text-muted)" }}> · {law.note}</span> : null}
          </div>
        </section>

        {/* PRICING: one plain sentence, per docs/NORTH-STAR.md */}
        <p style={{ textAlign: "center", fontSize: 14, color: "var(--text-body)", margin: "0 0 64px", lineHeight: 1.6 }}>
          {es
            ? "Crear y operar tu sociedad es gratis. Cuando empieza a facturar, pasás a pagar por uso."
            : "Creating and operating your company is free. Once it starts earning, you move to usage-based pricing."}{" "}
          <a href={es ? "/precios" : "/en/pricing"} style={inlineLink}>{es ? "Ver precios" : "See pricing"} →</a>
        </p>

        <Footer es={es} />
      </div>
      <HomeJsonLd />
    </main>
  );
}

/* ---------- hero pieces ---------- */

function ToggleLine({ es }: { es: boolean }) {
  return (
    <div style={toggleLine}>
      <span style={{ color: "var(--text)" }}>{es ? "Para founders" : "For founders"}</span>
      <span aria-hidden="true" style={toggleDivider} />
      <a href="/llms.txt" style={{ color: "var(--text-muted)" }}>
        {es ? "Para agentes" : "For agents"}
      </a>
    </div>
  );
}

function IconFolder() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function FileTreeCard() {
  return (
    <div style={{ position: "relative" }}>
      <div aria-hidden="true" style={wireRectA} />
      <div aria-hidden="true" style={wireRectB} />
      <div style={fileTreeCard}>
        {FILE_TREE.map((row, i) => (
          <div key={i} style={{ ...fileTreeRow, paddingLeft: 14 + row.depth * 16 }}>
            <span style={{ color: row.kind === "folder" ? "var(--text)" : "var(--text-muted)", display: "flex", flexShrink: 0 }}>
              {row.kind === "folder" ? <IconFolder /> : <IconFile />}
            </span>
            <span style={{ color: row.kind === "folder" ? "var(--text)" : "var(--text-body)" }}>{row.label}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <span style={tinyPill}>
          <span style={{ color: "var(--text-muted)" }}>$</span>&nbsp;ar-agents login
        </span>
      </div>
    </div>
  );
}

/* ---------- command pill (eve pill anatomy: 40px total height) ---------- */

function CommandPill({ cmd, hl, es }: { cmd: string; hl: string; es: boolean }) {
  const idx = cmd.indexOf(hl);
  const pre = idx >= 0 ? cmd.slice(0, idx) : cmd;
  const mid = idx >= 0 ? hl : "";
  const post = idx >= 0 ? cmd.slice(idx + hl.length) : "";
  return (
    <div style={commandPill}>
      <span aria-hidden="true" style={commandPrompt}>$</span>
      <code style={commandCode}>
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
        width: 26,
        height: 26,
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

/* ---------- section 1: numbered inventory row ---------- */

function InventoryRow({
  n,
  title,
  body,
  tag,
}: {
  n: string;
  title: string;
  body: string;
  tag?: string;
}) {
  return (
    <div style={inventoryRow}>
      <span style={inventoryN}>[{n}]</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h3 style={inventoryTitle}>{title}</h3>
          {tag ? <span style={leverageTag}>{tag}</span> : null}
        </div>
        <p style={inventoryBody}>{body}</p>
      </div>
    </div>
  );
}


/* ---------- footer ---------- */

function Footer({ es }: { es: boolean }) {
  const cols: { h: string; links: { l: string; href: string }[] }[] = [
    {
      h: es ? "Producto" : "Product",
      links: [
        { l: es ? "Studio" : "Studio", href: STUDIO_URL },
        { l: es ? "Cómo funciona" : "How it works", href: "/sociedades-ia" },
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
      <div style={proofStrip}>
        <span>Open source · MIT</span>
        <span aria-hidden="true">·</span>
        <span>39 {es ? "paquetes en npm" : "npm packages"}</span>
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

/* ---------- helpers ---------- */

function grid(min: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
    gap: 14,
  };
}

/* ---------- styles ---------- */

// H1: eve's signature "large but light". 64px/1.0/450/-0.06em on desktop,
// scaled down via clamp so it never overflows on mobile. The wide (1100px)
// hero container + fixed-width file-tree column (globals.css .home-hero)
// give this the line budget "Creá tu sociedad automatizada." needs to stay
// on one line at desktop widths.
const h1Sty: React.CSSProperties = {
  fontSize: "clamp(44px, 6vw, 64px)",
  fontWeight: 450,
  lineHeight: 1.0,
  letterSpacing: "-0.06em",
  margin: 0,
  fontFamily: FONT_SANS,
};

const toggleLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 14,
  marginTop: 20,
  fontFamily: FONT_SANS,
};

const toggleDivider: React.CSSProperties = {
  width: 1,
  height: 12,
  background: "var(--border-color)",
  display: "inline-block",
};

const ctaRow: React.CSSProperties = {
  marginTop: 24,
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const analogyP: React.CSSProperties = {
  color: "var(--text-body)",
  fontSize: 18,
  margin: "24px 0 0",
  maxWidth: 560,
  lineHeight: 1.5,
};

// Primary button, eve pattern: 40px height, full pill radius, white bg /
// near-black text (dark theme).
const ctaPrimary: React.CSSProperties = {
  height: 40,
  padding: "0 20px",
  background: "var(--primary-bg)",
  color: "var(--primary-text)",
  borderRadius: 9999,
  fontSize: 14,
  fontWeight: 500,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: FONT_SANS,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

// Command pill, eve pattern: 40px TOTAL height, padding 6/8/6/12, full
// radius, mono ~14-15px, one accent-tinted segment, icon-only copy button.
const commandPill: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 40,
  padding: "6px 8px 6px 12px",
  gap: 10,
  background: "var(--card)",
  border: "1px solid var(--border-color)",
  borderRadius: 9999,
  maxWidth: "100%",
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
  fontSize: 14,
  color: "var(--text)",
  overflowX: "auto",
  whiteSpace: "pre",
  flex: 1,
  lineHeight: 1.2,
};

// Hero visual: file-tree card + tiny CLI pill + faint wireframe rects.
const fileTreeCard: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border-color)",
  borderRadius: 12,
  padding: "14px 6px",
  position: "relative",
};

const fileTreeRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 8px",
  fontFamily: FONT_MONO,
  fontSize: 13,
};

const tinyPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 28,
  padding: "0 12px",
  borderRadius: 9999,
  background: "var(--card)",
  border: "1px solid var(--border-color)",
  fontFamily: FONT_MONO,
  fontSize: 12,
  color: "var(--text-body)",
};

const wireRectA: React.CSSProperties = {
  position: "absolute",
  top: -18,
  right: -14,
  width: 56,
  height: 56,
  border: "1px solid var(--border-color)",
  borderRadius: 10,
  opacity: 0.5,
  pointerEvents: "none",
  zIndex: 0,
};

const wireRectB: React.CSSProperties = {
  position: "absolute",
  bottom: -46,
  left: -16,
  width: 40,
  height: 40,
  border: "1px solid var(--border-color)",
  borderRadius: 8,
  opacity: 0.35,
  pointerEvents: "none",
  zIndex: 0,
};

// Section headings: 56px / weight 450 / -0.06em, the giant-statement pattern
// used uniformly across sections 1-3.
const sectionHeading: React.CSSProperties = {
  fontSize: "clamp(32px, 5vw, 56px)",
  fontWeight: 450,
  letterSpacing: "-0.06em",
  lineHeight: 1.05,
  margin: 0,
  maxWidth: 720,
};

const quietExplainer: React.CSSProperties = {
  fontSize: 16,
  color: "var(--text-body)",
  lineHeight: 1.6,
  margin: "18px 0 0",
  maxWidth: 560,
};

const sectionOuter: React.CSSProperties = {
  marginBottom: 80,
  paddingTop: 56,
  borderTop: "1px solid var(--border-color)",
};

const eyebrowSty: React.CSSProperties = {
  fontSize: 11,
  fontFamily: FONT_MONO,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  margin: "0 0 12px",
  fontWeight: 600,
};

// Numbered inventory row (section 1).
const inventoryRow: React.CSSProperties = {
  display: "flex",
  gap: 20,
  padding: "20px 0",
  boxShadow: "inset 0 -1px 0 var(--border-color)",
};

const inventoryN: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 14,
  color: "var(--text-muted)",
  flexShrink: 0,
  paddingTop: 2,
  minWidth: 34,
};

const inventoryTitle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  color: "var(--text)",
  margin: 0,
};

const inventoryBody: React.CSSProperties = {
  fontSize: 14,
  color: "var(--text-body)",
  lineHeight: 1.55,
  margin: "6px 0 0",
  maxWidth: 560,
};

const leverageTag: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 11,
  color: "var(--accent-text, var(--accent))",
  background: "var(--accent-bg)",
  padding: "2px 8px",
  borderRadius: 9999,
  whiteSpace: "nowrap",
};

// Stack-table row (section 2), shares .eve-use-row's mobile stack behavior.
const stackRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(110px, 160px) 1fr",
  gap: 24,
  padding: "14px 0",
  boxShadow: "inset 0 -1px 0 var(--border-color)",
  alignItems: "baseline",
};

const stackTerm: React.CSSProperties = {
  fontSize: 15,
  color: "var(--text)",
  fontWeight: 500,
  margin: 0,
};

const stackDesc: React.CSSProperties = {
  fontSize: 14,
  color: "var(--text-body)",
  lineHeight: 1.5,
  margin: 0,
};

// Vercel-grade container surface, one step above --bg, no shadow.
const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border-color)",
  borderRadius: 12,
  padding: 22,
};

const cardTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "var(--text)",
  margin: "0 0 6px",
};

const cardBody: React.CSSProperties = {
  fontSize: 14,
  color: "var(--text-body)",
  lineHeight: 1.5,
  margin: 0,
};

const inlineLink: React.CSSProperties = {
  fontSize: 14,
  color: "var(--accent)",
  fontWeight: 500,
  textDecoration: "underline",
};

// Audit-log mini visual, inside the "Audit log firmado" card.




// Finale: 96px statement, weight 450, -0.06em, nothing else beside the button.
const finaleHeading: React.CSSProperties = {
  fontSize: "clamp(48px, 9vw, 96px)",
  fontWeight: 450,
  letterSpacing: "-0.06em",
  lineHeight: 1.0,
  margin: 0,
};

const lawStatusLine: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: 8,
  fontSize: 13,
  lineHeight: 1.5,
  marginTop: 24,
};

const lawDot: React.CSSProperties = {
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: 9999,
  background: "var(--warning, var(--accent))",
  flexShrink: 0,
};

const proofStrip: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  fontSize: 12,
  color: "var(--text-muted)",
};
