"use client";

// /ley, the single law/context hub. One clear page: what a sociedad automatizada
// is, where the bill stands (honest), the articles that matter, the open RFCs,
// and links to the detail pages. Replaces the dozen scattered advocacy pages as
// the main-path entry. Copy is a first pass; legal facts are verified.

import { useLang } from "../i18n";
import { LAW_STATUS } from "../law-status";

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

const ARTICLES: ReadonlyArray<{ n: string; es: string; en: string }> = [
  {
    n: "Art. 14",
    es: "Crea la Sociedad Automatizada. Aplica a cualquier tipo societario. La sociedad responde con su patrimonio.",
    en: "Creates the Automated Company. Applies to any company type. The company is liable with its assets.",
  },
  {
    n: "Art. 101",
    es: "Protege al administrador por la discrecionalidad empresarial cuando decide con un procedimiento adecuado.",
    en: "Protects the administrator under the business judgment rule when decisions follow an adequate procedure.",
  },
  {
    n: "Art. 102",
    es: "Usar IA no exime del deber de configurar y supervisar el sistema. La supervisión no se delega.",
    en: "Using AI does not remove the duty to configure and supervise the system. Supervision is not delegated.",
  },
  {
    n: "Art. 263",
    es: "Exige que todo registro digital sea públicamente verificable y reproducible.",
    en: "Requires every digital record to be publicly verifiable and reproducible.",
  },
];

const RFCS: ReadonlyArray<{ id: string; es: string; en: string }> = [
  { id: "001", es: "Identidad y firma de agentes ante el Estado.", en: "Agent identity and signing before the State." },
  { id: "002", es: "Descubrimiento de agentes por defecto (.well-known).", en: "Agent discovery by default (.well-known)." },
  { id: "003", es: "Reciprocidad de logs entre jurisdicciones.", en: "Cross-jurisdictional audit-log reciprocity." },
  { id: "004", es: "Especificación del log operativo. La pieza clave.", en: "Operational-log specification. The key piece." },
  { id: "005", es: "Upgrade a firmas Ed25519 con rotación de claves.", en: "Upgrade to Ed25519 signatures with key rotation." },
  { id: "006", es: "Ledger hash-encadenado con anclaje externo.", en: "Hash-chained ledger with external anchoring." },
];

const DETAIL: ReadonlyArray<{ href: string; es: string; en: string; d_es: string; d_en: string }> = [
  {
    href: "/legislacion",
    es: "Síntesis legislativa",
    en: "Legislative synthesis",
    d_es: "Los RFCs con articulado sugerido para quien redacta la ley.",
    d_en: "The RFCs with suggested legislative text for drafters.",
  },
  {
    href: "/implementacion",
    es: "Implementación de referencia",
    en: "Reference implementation",
    d_es: "Cláusulas operables y respuesta a las objeciones jurídicas.",
    d_en: "Operable clauses and answers to the legal objections.",
  },
  {
    href: "/jurisdicciones",
    es: "Jurisdicciones",
    en: "Jurisdictions",
    d_es: "Comparativa con Wyoming, Estonia, Marshall y Singapur.",
    d_en: "Comparison with Wyoming, Estonia, Marshall and Singapore.",
  },
  {
    href: "/manifiesto",
    es: "Manifiesto",
    en: "Manifesto",
    d_es: "Por qué infraestructura abierta, y por qué ahora.",
    d_en: "Why open infrastructure, and why now.",
  },
];

export default function Ley() {
  const { lang } = useLang();
  const es = lang === "es";
  const live = LAW_STATUS === "live";

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
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <p style={eyebrow}>{es ? "La ley" : "The law"}</p>
        <h1 style={h1Sty}>
          {es ? "El marco para las sociedades automatizadas" : "The framework for automated companies"}
        </h1>
        <p style={sub}>
          {es
            ? "Una sociedad automatizada es una sociedad cuya gestión opera con agentes de IA. El Anteproyecto de Ley General de Sociedades la crea (art. 14), define de quién es la responsabilidad cuando el agente actúa solo, y exige registros digitales verificables."
            : "An automated company is a company managed by AI agents. The draft General Companies Law creates it (art. 14), defines who is liable when the agent acts alone, and requires verifiable digital records."}
        </p>

        {/* STATUS */}
        <div style={statusCard}>
          <span aria-hidden="true" style={statusDot} />
          <div>
            <strong style={{ color: "var(--text)", fontWeight: 600 }}>
              {live
                ? es
                  ? "Estado: vigente."
                  : "Status: in force."
                : es
                  ? "Estado: en el Senado. Todavía no es ley."
                  : "Status: in the Senate. Not law yet."}
            </strong>
            <p style={{ margin: "4px 0 0", color: "var(--text-body)", fontSize: 14, lineHeight: 1.5 }}>
              {es
                ? "Anteproyecto de Ley General de Sociedades (277 artículos, reemplaza la Ley 19.550). Anunciado el 28-abr-2026, firmado el 28-may-2026, enviado al Senado el 1-jun-2026. El texto puede cambiar."
                : "Draft General Companies Law (277 articles, replaces Law 19,550). Announced Apr 28 2026, signed May 28 2026, sent to the Senate Jun 1 2026. The text may change."}
            </p>
          </div>
        </div>

        {/* ARTICLES */}
        <h2 style={h2Sty}>{es ? "Los artículos que importan" : "The articles that matter"}</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {ARTICLES.map((a) => (
            <div key={a.n} style={rowCard}>
              <span style={tag}>{a.n}</span>
              <span style={rowText}>{es ? a.es : a.en}</span>
            </div>
          ))}
        </div>

        {/* RFCs */}
        <h2 style={h2Sty}>{es ? "Las especificaciones" : "The specifications"}</h2>
        <p style={{ ...sub, fontSize: 15, margin: "0 0 20px" }}>
          {es
            ? "La infraestructura técnica, abierta (CC-BY-4.0) y citada por referencia."
            : "The technical infrastructure, open (CC-BY-4.0) and cited by reference."}
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {RFCS.map((r) => (
            <a key={r.id} href={`/rfcs/${r.id}`} style={{ ...rowCard, textDecoration: "none" }}>
              <span style={tag}>RFC-{r.id}</span>
              <span style={rowText}>{es ? r.es : r.en}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 14 }}>→</span>
            </a>
          ))}
        </div>

        {/* DETAIL */}
        <h2 style={h2Sty}>{es ? "Más a fondo" : "Go deeper"}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {DETAIL.map((d) => (
            <a key={d.href} href={d.href} style={linkCard}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                {es ? d.es : d.en}
              </div>
              <p style={{ fontSize: 13, color: "var(--text-body)", margin: 0, lineHeight: 1.5 }}>
                {es ? d.d_es : d.d_en}
              </p>
            </a>
          ))}
        </div>

        {/* CAVEAT */}
        <p style={caveat}>
          {es
            ? "No es asesoramiento jurídico. Los RFCs son una propuesta técnica de un desarrollador independiente y no reemplazan a un abogado matriculado."
            : "Not legal advice. The RFCs are a technical proposal by an independent developer and do not replace a licensed lawyer."}
        </p>
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
  maxWidth: 680,
};

const h2Sty: React.CSSProperties = {
  fontSize: "clamp(22px, 4vw, 28px)",
  fontWeight: 600,
  letterSpacing: "-0.03em",
  lineHeight: 1.15,
  margin: "48px 0 18px",
};

const statusCard: React.CSSProperties = {
  marginTop: 24,
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: "16px 18px",
  background: "var(--warning-bg, var(--bg-tint))",
  borderRadius: 10,
  boxShadow: "var(--shadow-border)",
};

const statusDot: React.CSSProperties = {
  display: "inline-block",
  width: 9,
  height: 9,
  borderRadius: 9999,
  background: "var(--warning, var(--accent))",
  flexShrink: 0,
  marginTop: 6,
};

const rowCard: React.CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "center",
  padding: "14px 18px",
  background: "var(--bg-tint)",
  borderRadius: 10,
  boxShadow: "var(--card-shadow, var(--shadow-ring-light))",
  color: "inherit",
};

const tag: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 13,
  color: "var(--accent)",
  minWidth: 64,
  flexShrink: 0,
};

const rowText: React.CSSProperties = {
  color: "var(--text-body)",
  fontSize: 14,
  lineHeight: 1.5,
  flex: 1,
};

const linkCard: React.CSSProperties = {
  display: "block",
  padding: "18px 18px",
  background: "var(--bg-tint)",
  borderRadius: 10,
  boxShadow: "var(--card-shadow, var(--shadow-ring-light))",
  textDecoration: "none",
  color: "inherit",
};

const caveat: React.CSSProperties = {
  marginTop: 40,
  paddingTop: 20,
  borderTop: "1px solid var(--border-color)",
  fontSize: 13,
  color: "var(--text-muted)",
  lineHeight: 1.6,
  maxWidth: 680,
};
