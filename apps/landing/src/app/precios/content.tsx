/**
 * Shared bilingual content for /precios (ES default) and /en/pricing (EN).
 * Server component. Receives `lang` and renders the matching column of T.
 *
 * Commercial model (v4, 2026-07-13): the MODEL stays public (free to build,
 * usage-based once operational, see docs/NORTH-STAR.md § Pricing); the
 * MECHANICS (the exact pricing factor, the cost-based math behind it, any
 * worked cost-vs-price example) are private. No formula, no worked example,
 * no rate on this page or in any machine surface. Rendered in the eve/vercel
 * card language (weight 450 headings, var(--card) surfaces, 40px buttons) to
 * match the rest of the site's 2026-07-13 redesign, not the old prose
 * doc-shell.
 *
 * El Auditor (the signed, hosted audit log, art. 102 defense) is a separate
 * product with its own fixed pricing, out of scope for this page. It is
 * designed to be purchased autonomously by an agent via
 * /api/auditor/subscribe (see /api/discovery), not sold to a human here.
 */

const FONT_SANS = "var(--font-geist-sans), Arial, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
const STUDIO_URL = "https://studio.ar-agents.ar";

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

type Lang = "es" | "en";

const T = {
  eyebrow: { es: "precios", en: "pricing" },
  title: {
    es: "Gratis hasta que tu sociedad factura.",
    en: "Free until your company earns.",
  },
  subtitle: {
    es: "Crear, deployar y operar tu sociedad automatizada no cuesta nada, sin límite de tiempo. El día que empieza a facturar, pasás a precio por uso. Sin suscripciones, sin asientos, sin cargos fijos.",
    en: "Creating, deploying, and operating your automated company costs nothing, with no time limit. The day it starts earning, you move to usage-based pricing. No subscriptions, no seats, no fixed fees.",
  },
  ctaPrimary: { es: "Crear mi empresa", en: "Create my company" },
  h2tiers: { es: "Dos planes", en: "Two plans" },
  h2free: { es: "Siempre gratis", en: "Always free" },
  freeP: {
    es: "Esto no cambia nunca, factures o no:",
    en: "This never changes, whether you earn or not:",
  },
  freeItems: {
    es: [
      "Los 39 paquetes @ar-agents/* en npm, MIT.",
      "El starter, self-hosteable: corré tu propia sociedad sin pagarnos nada.",
      "El registro público y sus APIs (/api/registry, /api/registry/good-standing).",
    ],
    en: [
      "The 39 @ar-agents/* packages on npm, MIT.",
      "The starter, self-hostable: run your own company without paying us anything.",
      "The public registry and its APIs (/api/registry, /api/registry/good-standing).",
    ],
  },
  h2honest: { es: "Estado real", en: "Honest status" },
  honestP: {
    es: "El cobro todavía no está activo. Mientras tanto medimos el uso de tu sociedad y te mostramos una estimación en tu dashboard, para que sepas qué esperar, pero no ejecutamos ningún cargo. Toda sociedad opera gratis, incluso las que ya facturan. Vamos a avisar acá el día que se prenda.",
    en: "Billing is not active yet. In the meantime we meter your company's usage and show you an estimate in your dashboard, so you know what to expect, but we do not execute any charge. Every company operates free, even the ones already earning. We will post here the day it turns on.",
  },
  h2faq: { es: "Preguntas", en: "FAQ" },
} as const;

type Tier = {
  name: { es: string; en: string };
  price: { es: string; en: string };
  tag?: { es: string; en: string };
  items: { es: string[]; en: string[] };
  cta?: { label: { es: string; en: string }; href: string };
};

const TIERS: ReadonlyArray<Tier> = [
  {
    name: { es: "Gratis", en: "Free" },
    price: { es: "$0", en: "$0" },
    tag: { es: "crear y operar", en: "build and run" },
    items: {
      es: [
        "Generar tu sociedad desde un prompt",
        "Validar y ajustar el borrador con el coach",
        "Constituir en simulación, pre-ley: no inscribe nada real",
        "Operar sin límite de tiempo mientras no factura",
      ],
      en: [
        "Generate your company from a prompt",
        "Validate and adjust the draft with the coach",
        "Incorporate in simulation, pre-law: nothing real is filed",
        "Operate with no time limit while it is not earning",
      ],
    },
    cta: { label: { es: "Crear mi empresa", en: "Create my company" }, href: STUDIO_URL },
  },
  {
    name: { es: "Producción", en: "Production" },
    price: { es: "Por uso", en: "Usage-based" },
    tag: { es: "cuando factura", en: "once it earns" },
    items: {
      es: [
        "Se activa el día que tu sociedad le cobra a un cliente real",
        "Precio por uso, facturado sobre lo que tus agentes realmente consumen",
        "Sin suscripciones, sin asientos, sin cargos fijos",
        "Facturación todavía no activa: hoy corre gratis, ver Estado real",
      ],
      en: [
        "Activates the day your company charges a real customer",
        "Usage-based price, billed on what your agents actually consume",
        "No subscriptions, no seats, no fixed fees",
        "Billing not active yet: runs free today, see Honest status",
      ],
    },
  },
];

const CUSTOM_TIER = {
  name: { es: "A medida", en: "Custom" },
  body: {
    es: "¿Volumen alto, varias sociedades, o algo que no encaja en lo de arriba? Escribinos.",
    en: "High volume, multiple companies, or something that does not fit above? Reach out.",
  },
  cta: { label: { es: "naza@naza.ar", en: "naza@naza.ar" }, href: "mailto:naza@naza.ar" },
};

type FaqItem = { q: { es: string; en: string }; a: { es: React.ReactNode; en: React.ReactNode } };

const FAQ: ReadonlyArray<FaqItem> = [
  {
    q: { es: "¿Cuándo empieza a cobrarse?", en: "When does billing start?" },
    a: {
      es: "El día que tu sociedad le cobra por primera vez a un cliente real. Antes de eso, generar, deployar y operar es gratis, sin límite de tiempo.",
      en: "The day your company first charges a real customer. Before that, generating, deploying, and operating is free, with no time limit.",
    },
  },
  {
    q: { es: "¿Qué cuenta como facturar?", en: "What counts as earning?" },
    a: {
      es: "Un cobro real a un tercero: una venta, un servicio, una suscripción. Transacciones de prueba o simuladas no cuentan.",
      en: "A real charge to a third party: a sale, a service, a subscription. Test or simulated transactions do not count.",
    },
  },
  {
    q: { es: "¿Puedo usar mi propia clave de modelo?", en: "Can I use my own model key?" },
    a: {
      es: "Sí. Podés traer tu propia clave de modelo (Anthropic, OpenAI, etc.) desde el panel de credenciales de studio. El precio por uso solo aplica a lo que corre sobre la plataforma; lo que corre con tu propia clave lo pagás directo a tu proveedor.",
      en: "Yes. You can bring your own model key (Anthropic, OpenAI, etc.) from studio's credentials panel. Usage-based pricing only applies to what runs on the platform; what runs on your own key, you pay your provider directly.",
    },
  },
  {
    q: { es: "¿Cómo se calcula el precio por uso?", en: "How is usage-based pricing calculated?" },
    a: {
      es: "No publicamos la fórmula. Lo que sí es público: es gratis hasta que facturás, y una vez que facturás se mide el uso real de tus agentes, no un plan fijo ni una suscripción.",
      en: "We do not publish the formula. What is public: it is free until you earn, and once you earn we meter your agents' actual usage, not a fixed plan or a subscription.",
    },
  },
  {
    q: { es: "¿El Auditor tiene otro precio?", en: "Does The Auditor have separate pricing?" },
    a: {
      es: (
        <>
          Sí. El Auditor es un producto aparte: un audit log firmado y hosteado que tu propia
          sociedad puede contratar sola, por API, para cumplir el art. 102. Tiene su propio
          pricing, fuera de este modelo. Más en <a href="/auditor" style={linkSty}>/auditor</a>.
        </>
      ),
      en: (
        <>
          Yes. The Auditor is a separate product: a signed, hosted audit log your own company can
          contract by itself, via API, to satisfy art. 102. It has its own pricing, outside this
          model. More at <a href="/auditor" style={linkSty}>/auditor</a>.
        </>
      ),
    },
  },
];

export function PreciosContent({ lang }: { lang: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  return (
    <main style={pageWrap}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={eyebrowSty}>{t("eyebrow") as string}</p>
        <h1 style={h1Sty}>{t("title") as string}</h1>
        <p style={subtitleSty}>{t("subtitle") as string}</p>
        <div style={{ marginTop: 24 }}>
          <a href={STUDIO_URL} style={ctaPrimary}>
            {t("ctaPrimary") as string}
          </a>
        </div>

        <section style={sectionOuter}>
          <div style={tiersGrid}>
            {TIERS.map((tier) => (
              <div key={tier.name.es} style={card}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <h2 style={cardHeading}>{tier.name[lang]}</h2>
                  {tier.tag ? <span style={tagSty}>{tier.tag[lang]}</span> : null}
                </div>
                <p style={priceSty}>{tier.price[lang]}</p>
                <ul style={cardList}>
                  {tier.items[lang].map((item) => (
                    <li key={item} style={cardListItem}>
                      <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
                        {"– "}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                {tier.cta ? (
                  <a href={tier.cta.href} style={{ ...ctaPrimary, marginTop: 20 }}>
                    {tier.cta.label[lang]}
                  </a>
                ) : null}
              </div>
            ))}
            <div style={card}>
              <h2 style={cardHeading}>{CUSTOM_TIER.name[lang]}</h2>
              <p style={{ ...cardBody, margin: "12px 0 20px" }}>{CUSTOM_TIER.body[lang]}</p>
              <a href={CUSTOM_TIER.cta.href} style={linkSty}>
                {CUSTOM_TIER.cta.label[lang]} →
              </a>
            </div>
          </div>
        </section>

        <section style={sectionOuter}>
          <h2 style={sectionHeading}>{t("h2free")}</h2>
          <p style={quietExplainer}>{t("freeP")}</p>
          <ul style={{ margin: "16px 0 0", paddingLeft: 20, color: "var(--text-body)" }}>
            {T.freeItems[lang].map((item) => (
              <li key={item} style={{ margin: "0 0 6px", fontSize: 15, lineHeight: 1.6 }}>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section style={sectionOuter}>
          <h2 style={sectionHeading}>{t("h2honest")}</h2>
          <p style={quietExplainer}>{t("honestP")}</p>
        </section>

        <section style={sectionOuter}>
          <h2 style={sectionHeading}>{t("h2faq")}</h2>
          {FAQ.map((item) => (
            <div key={item.q.es} style={faqRow}>
              <p style={faqQ}>{item.q[lang]}</p>
              <p style={faqA}>{item.a[lang]}</p>
            </div>
          ))}
        </section>

        <FooterNav lang={lang} />
      </div>
    </main>
  );
}

/* ---------- footer (mirrors doc-shell.tsx's nav for cross-page consistency) ---------- */

function FooterNav({ lang }: { lang: Lang }) {
  const es = lang === "es";
  return (
    <>
      <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "56px 0 24px" }} />
      <footer style={{ color: "var(--text-muted)", fontSize: 13, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontFamily: FONT_MONO, fontSize: 12 }}>
          <a href="/" style={shellLinkSty}>/</a>
          <a href="/sociedades-ia" style={shellLinkSty}>thesis</a>
          <a href="/rfcs/001" style={shellLinkSty}>spec</a>
          <a href="/registro" style={shellLinkSty}>registry</a>
          <a href="/auditor" style={shellLinkSty}>auditor</a>
          <a href={es ? "/precios" : "/en/pricing"} style={shellLinkSty}>precios</a>
          <a href="/legislacion" style={shellLinkSty}>legislación</a>
          <a href="/sdk" style={shellLinkSty}>sdk</a>
          <a href="/faq" style={shellLinkSty}>faq</a>
          <a href="/privacy" style={shellLinkSty}>privacy</a>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingTop: 8, borderTop: "1px solid var(--border-color)" }}>
          <span>
            MIT (code) + CC-BY-4.0 (specs) ·{" "}
            <a href="https://github.com/naza00000" style={shellLinkSty}>Nazareno Clemente</a>
          </span>
          <span>
            <a href="https://github.com/ar-agents/ar-agents" style={shellLinkSty}>github.com/ar-agents</a>
          </span>
        </div>
      </footer>
    </>
  );
}

/* ---------- styles (eve/vercel card language: weight 450 headings,
   var(--card) surfaces, 40px pill buttons; matches page.tsx's 2026-07-13
   redesign) ---------- */

const pageWrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--bg)",
  fontFamily: FONT_SANS,
  color: "var(--text)",
  padding: "56px 24px 120px",
};

const eyebrowSty: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "var(--accent)",
  margin: 0,
  fontFamily: FONT_MONO,
  fontWeight: 600,
};

const h1Sty: React.CSSProperties = {
  fontSize: "clamp(34px, 5.4vw, 64px)",
  fontWeight: 450,
  lineHeight: 1.0,
  letterSpacing: "-0.06em",
  margin: "16px 0 0",
};

const subtitleSty: React.CSSProperties = {
  color: "var(--text-body)",
  fontSize: "clamp(16px, 2.2vw, 19px)",
  margin: "20px 0 0",
  lineHeight: 1.55,
  maxWidth: 640,
};

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

const sectionOuter: React.CSSProperties = {
  marginTop: 64,
  paddingTop: 48,
  borderTop: "1px solid var(--border-color)",
};

const sectionHeading: React.CSSProperties = {
  fontSize: "clamp(24px, 3.6vw, 34px)",
  fontWeight: 450,
  letterSpacing: "-0.04em",
  lineHeight: 1.1,
  margin: 0,
};

const quietExplainer: React.CSSProperties = {
  fontSize: 16,
  color: "var(--text-body)",
  lineHeight: 1.6,
  margin: "14px 0 0",
  maxWidth: 640,
};

const tiersGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 16,
};

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border-color)",
  borderRadius: 12,
  padding: 24,
  display: "flex",
  flexDirection: "column",
};

const cardHeading: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 450,
  letterSpacing: "-0.02em",
  color: "var(--text)",
  margin: 0,
};

const tagSty: React.CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 11,
  color: "var(--accent-text, var(--accent))",
  background: "var(--accent-bg)",
  padding: "2px 8px",
  borderRadius: 9999,
  whiteSpace: "nowrap",
};

const priceSty: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  color: "var(--text-muted)",
  margin: "10px 0 0",
};

const cardBody: React.CSSProperties = {
  fontSize: 14,
  color: "var(--text-body)",
  lineHeight: 1.5,
};

const cardList: React.CSSProperties = {
  margin: "16px 0 0",
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: 8,
  flex: 1,
};

const cardListItem: React.CSSProperties = {
  fontSize: 14,
  color: "var(--text-body)",
  lineHeight: 1.5,
};

const faqRow: React.CSSProperties = {
  marginTop: 24,
};

const faqQ: React.CSSProperties = {
  margin: "0 0 6px",
  fontWeight: 600,
  color: "var(--text)",
  fontSize: 15,
};

const faqA: React.CSSProperties = {
  margin: 0,
  color: "var(--text-body)",
  fontSize: 15,
  lineHeight: 1.6,
};

const shellLinkSty: React.CSSProperties = {
  color: "var(--text-muted)",
  textDecoration: "none",
};
