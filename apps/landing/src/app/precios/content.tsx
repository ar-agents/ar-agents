import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

/**
 * Shared bilingual content for /precios (ES default) and /en/pricing (EN).
 * Server component. Receives `lang` and renders the matching column of T.
 *
 * Commercial model: OPEN CORE + paid trust layer.
 *  - Free  : the 33 @ar-agents/* packages (MIT), the RFCs (CC-BY-4.0), the
 *            self-serve wizard at /incorporar, the self-hosted audit log.
 *  - Paid  : hosted, liability-bearing services, each with a legal hook in the
 *            anteproyecto de Ley General de Sociedades (art. 102 / 260 / 264).
 * Every paid product is operable by an agent via API/MCP, so a Sociedad
 * Automatizada can contract it without humans in the loop.
 */

type Lang = "es" | "en";

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const FONT_MONO_VAR = "var(--font-geist-mono), ui-monospace, monospace";

const T = {
  eyebrow: { es: "precios", en: "pricing" },
  title: {
    es: "El estándar es gratis. La confianza es el negocio.",
    en: "The standard is free. Trust is the business.",
  },
  subtitle: {
    es: "ar-agents es una Sociedad Automatizada que constituye y opera Sociedades Automatizadas. El código abierto es la infraestructura; lo que se cobra es la capa que vuelve a tu empresa-agente bancable, asegurable y auditable ante el Estado.",
    en: "ar-agents is an automated company that incorporates and operates automated companies. The open source is the infrastructure; what we bill is the layer that makes your agent-company bankable, insurable, and auditable before the state.",
  },
  h2model: { es: "Cómo funciona el modelo", en: "How the model works" },
  modelP: {
    es: (
      <>
        El núcleo es abierto y gratis: los paquetes{" "}
        <DocCode>@ar-agents/*</DocCode> en npm (MIT), los RFCs (CC-BY-4.0), el
        wizard de{" "}
        <a href="/incorporar" style={linkSty}>
          /incorporar
        </a>{" "}
        y el audit log self-hosted. Con eso constituís y operás una Sociedad
        Automatizada por tu cuenta, sin pagarnos un peso. Lo que se cobra es la
        capa hosted que <strong>asume responsabilidad</strong>: auditoría
        peritable, representación legal y cumplimiento. Esa capa un fork no la
        puede copiar — porque no es código, es confianza con respaldo.
      </>
    ),
    en: (
      <>
        The core is open and free: the <DocCode>@ar-agents/*</DocCode> packages
        on npm (MIT), the RFCs (CC-BY-4.0), the{" "}
        <a href="/incorporar" style={linkSty}>
          /incorporar
        </a>{" "}
        wizard, and the self-hosted audit log. With that you incorporate and
        run an automated company on your own, paying us nothing. What's billed
        is the hosted layer that <strong>bears liability</strong>: court-grade
        auditing, legal representation, and compliance. A fork can't copy that
        layer — because it isn't code, it's backed trust.
      </>
    ),
  },
  h2table: { es: "Productos", en: "Products" },
  tableIntro: {
    es: "Cada producto pago tiene un anclaje legal en el anteproyecto, y se contrata por API o MCP — para que tu empresa-agente lo active sola.",
    en: "Every paid product has a legal anchor in the draft bill, and is contracted via API or MCP — so your agent-company can turn it on by itself.",
  },
  h2auditor: { es: "El Auditor (producto estrella)", en: "The Auditor (flagship)" },
  auditorP1: {
    es: (
      <>
        El anteproyecto deja al administrador{" "}
        <strong>personalmente responsable</strong> por lo que hace la IA
        (art. 102), y solo lo protege si actuó &ldquo;con arreglo a un
        procedimiento de decisión adecuado&rdquo; (art. 101, regla de
        discrecionalidad empresarial). El Auditor es esa prueba: un registro de
        decisiones append-only, firmado (RFC-004), con upgrade a firma
        asimétrica para que el regulador verifique sin tu clave (RFC-005), y
        anclado para que valga incluso si el operador es el adversario
        (RFC-006).
      </>
    ),
    en: (
      <>
        The draft bill leaves the administrator{" "}
        <strong>personally liable</strong> for what the AI does (art. 102), and
        only protects them if they acted &ldquo;through an adequate
        decision-making procedure&rdquo; (art. 101, the business-judgment rule).
        The Auditor is that proof: an append-only, signed decision log
        (RFC-004), with an asymmetric-signature upgrade so a regulator can
        verify without your key (RFC-005), anchored so it holds even when the
        operator is the adversary (RFC-006).
      </>
    ),
  },
  auditorP2: {
    es: (
      <>
        El log self-hosted es gratis (RFC-004 abierto). Lo pago es la versión{" "}
        <strong>hosted, anclada y certificada</strong>, con acceso de lectura
        para tu auditor o el regulador. Y porque la ley se aplica de pleno
        derecho a todas las sociedades existentes (art. 272), el comprador no
        es solo la empresa-agente nueva: es cualquier empresa que use IA en su
        gestión. Vivo en{" "}
        <a href="/auditor" style={linkSty}>
          /auditor
        </a>
        .
      </>
    ),
    en: (
      <>
        The self-hosted log is free (RFC-004 is open). What's paid is the{" "}
        <strong>hosted, anchored, certified</strong> version, with read access
        for your auditor or the regulator. And because the law applies by
        operation of law to all existing companies (art. 272), the buyer isn't
        only the new agent-company: it's any company that uses AI in its
        management. Live at{" "}
        <a href="/auditor" style={linkSty}>
          /auditor
        </a>
        .
      </>
    ),
  },
  h2autonomo: { es: "100% autónomo, de verdad", en: "100% autonomous, for real" },
  autonomoP: {
    es: (
      <>
        El anteproyecto no permite cero humanos: toda sociedad necesita un
        administrador (art. 88) y la DAO un representante legal humano
        (art. 260). Pero la <em>operación</em> sí es 100% autónoma (art. 14:
        sin empleados, los agentes hacen todo). Nosotros automatizamos ese rol
        humano mínimo como servicio — vos firmás como autor, no operás. La
        empresa-agente contrata El Auditor, su representante y su cumplimiento{" "}
        <strong>por API, sola</strong>:
      </>
    ),
    en: (
      <>
        The draft bill does not allow zero humans: every company needs an
        administrator (art. 88) and a DAO needs a human legal representative
        (art. 260). But the <em>operation</em> is 100% autonomous (art. 14: no
        employees, the agents do everything). We automate that minimal human
        role as a service — you sign as the author, you don't operate. The
        agent-company contracts The Auditor, its representative, and its
        compliance <strong>over the API, by itself</strong>:
      </>
    ),
  },
  h2cta: { es: "Acceso anticipado", en: "Early access" },
  ctaP: {
    es: (
      <>
        El núcleo open-source ya está vivo. La capa paga abre en acceso
        anticipado para las primeras Sociedades Automatizadas: escribinos a{" "}
        <a href="mailto:naza@naza.ar" style={linkSty}>
          naza@naza.ar
        </a>{" "}
        o entrá por{" "}
        <a href="/incorporar" style={linkSty}>
          /incorporar
        </a>
        .
      </>
    ),
    en: (
      <>
        The open-source core is already live. The paid layer opens in early
        access for the first automated companies: write to{" "}
        <a href="mailto:naza@naza.ar" style={linkSty}>
          naza@naza.ar
        </a>{" "}
        or start at{" "}
        <a href="/incorporar" style={linkSty}>
          /incorporar
        </a>
        .
      </>
    ),
  },
  h2honest: { es: "Nota honesta", en: "Honest note" },
  honestP: {
    es: "Estos son precios de lanzamiento, en acceso anticipado. El checkout en vivo se conecta dogfoodeando nuestro propio @ar-agents/mercadopago (MP Subscriptions); hasta entonces el alta es por contacto. La capa abierta no cambia: el código y los RFCs son y van a seguir siendo gratis (MIT + CC-BY-4.0).",
    en: "These are launch prices, in early access. Live checkout ships by dogfooding our own @ar-agents/mercadopago (MP Subscriptions); until then onboarding is by contact. The open layer doesn't change: the code and the RFCs are and will stay free (MIT + CC-BY-4.0).",
  },
} as const;

interface Product {
  lead?: boolean;
  name: { es: string; en: string };
  free: { es: string; en: string };
  paid: { es: string; en: string };
  hook: { es: string; en: string };
}

const PRODUCTS: ReadonlyArray<Product> = [
  {
    name: { es: "Constitución", en: "Incorporation" },
    free: { es: "Wizard self-serve (DIY)", en: "Self-serve wizard (DIY)" },
    paid: { es: "Gestionada: USD 500 setup + USD 99/mes", en: "Managed: USD 500 setup + USD 99/mo" },
    hook: { es: "Constituimos y mantenemos el compliance al día", en: "We incorporate and keep compliance current" },
  },
  {
    lead: true,
    name: { es: "El Auditor", en: "The Auditor" },
    free: { es: "Log self-hosted (RFC-004)", en: "Self-hosted log (RFC-004)" },
    paid: { es: "Pro USD 199/mes · Enterprise a medida", en: "Pro USD 199/mo · Enterprise custom" },
    hook: { es: "Art. 102 — el administrador responde por la IA", en: "Art. 102 — the administrator is liable for the AI" },
  },
  {
    name: { es: "Representante & Cumplimiento", en: "Representative & Compliance" },
    free: { es: "—", en: "—" },
    paid: { es: "A medida, con seguro", en: "Custom, insured" },
    hook: { es: "Arts. 260/264 — representante humano + oficial de cumplimiento", en: "Arts. 260/264 — human rep + compliance officer" },
  },
];

const AGENT_BUY = `// Tu Sociedad Automatizada contrata El Auditor sola, por API. Sin humanos.

▶ agent: Para cumplir el art. 102 necesito un registro de decisiones peritable.

  → POST https://ar-agents.ar/api/auditor/subscribe
      { plan: "pro", entity_cuit: "30-XXXXXXXX-X", anchor: "rfc-006" }
    ← { ok: true, plan: "pro", logEndpoint: "https://...",
        verifyUrl: "https://ar-agents.ar/auditor/<sessionId>" }

  → cada decisión del agente se firma (RFC-004) y se ancla (RFC-006)
    automáticamente; el regulador verifica con clave pública (RFC-005).

✓ El Auditor activo. La empresa opera sola; la prueba de que operó
  bien queda firmada. Vos sos el autor, no el operador.`;

export function PreciosContent({ lang }: { lang: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  return (
    <DocShell
      eyebrow={t("eyebrow") as string}
      title={t("title") as string}
      subtitle={t("subtitle") as string}
    >
      <DocH2>{t("h2model")}</DocH2>
      <DocP>{t("modelP")}</DocP>

      <DocH2>{t("h2table")}</DocH2>
      <DocP>{t("tableIntro")}</DocP>
      <PreciosTable lang={lang} />

      <DocH2>{t("h2auditor")}</DocH2>
      <DocP>{t("auditorP1")}</DocP>
      <DocP>{t("auditorP2")}</DocP>

      <DocH2>{t("h2autonomo")}</DocH2>
      <DocP>{t("autonomoP")}</DocP>
      <DocBlock>{AGENT_BUY}</DocBlock>

      <DocH2>{t("h2cta")}</DocH2>
      <DocP>{t("ctaP")}</DocP>

      <DocH2>{t("h2honest")}</DocH2>
      <DocP>{t("honestP")}</DocP>
    </DocShell>
  );
}

function PreciosTable({ lang }: { lang: Lang }) {
  const headers =
    lang === "es"
      ? { prod: "Producto", free: "Gratis", paid: "Pago", hook: "Anclaje legal" }
      : { prod: "Product", free: "Free", paid: "Paid", hook: "Legal anchor" };

  return (
    <div style={{ overflowX: "auto", margin: "16px 0 24px" }}>
      <table
        style={{
          width: "100%",
          minWidth: 640,
          borderCollapse: "collapse",
          fontSize: 13,
          background: "var(--bg-tint)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <thead>
          <tr>
            <th style={th}>{headers.prod}</th>
            <th style={th}>{headers.free}</th>
            <th style={th}>{headers.paid}</th>
            <th style={th}>{headers.hook}</th>
          </tr>
        </thead>
        <tbody>
          {PRODUCTS.map((p) => (
            <tr
              key={p.name.en}
              style={{ borderTop: "1px solid var(--border-color)" }}
            >
              <td style={{ ...td, color: "var(--text)", fontWeight: 600 }}>
                {p.name[lang]}
                {p.lead ? (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: "1px 7px",
                      borderRadius: 9999,
                      fontSize: 10,
                      fontFamily: FONT_MONO_VAR,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      background: "var(--accent)",
                      color: "var(--bg)",
                    }}
                  >
                    {lang === "es" ? "estrella" : "flagship"}
                  </span>
                ) : null}
              </td>
              <td style={{ ...td, color: "var(--text-muted)" }}>
                {p.free[lang]}
              </td>
              <td style={{ ...td, color: "var(--text)", fontWeight: 500 }}>
                {p.paid[lang]}
              </td>
              <td style={{ ...td, fontFamily: FONT_MONO_VAR, fontSize: 11.5 }}>
                {p.hook[lang]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--border-color)",
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--text-body)",
  verticalAlign: "top",
};
