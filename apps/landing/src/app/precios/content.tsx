import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { SubscribeCTA } from "./subscribe-cta";

/**
 * Shared bilingual content for /precios (ES default) and /en/pricing (EN).
 * Server component. Receives `lang` and renders the matching column of T.
 *
 * Commercial model (v2, fairness-tested + Vercel/Rauch-shaped): OPEN CORE +
 * paid managed trust layer. The rule: the party who NEEDS the trust pays, not
 * the party being verified. The open core is MIT/CC-BY-4.0 forever and never
 * relicensed. We monetize the managed substrate (hosted, anchored, independent
 * attestation; a legally-required human role) the buyer cannot safely self-
 * provide, never access to the spec. El Auditor is live; the rest is labelled
 * honestly (a medida / en camino).
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
    es: "Precios",
    en: "Pricing",
  },
  subtitle: {
    es: "El código es abierto y gratis para siempre. La capa hosted que asume responsabilidad (el audit log firmado, el rol humano que la ley exige y la atestación para terceros) es paga.",
    en: "The code is open and free forever. The hosted layer that bears liability (the signed audit log, the human role the law requires, and the attestation for third parties) is paid.",
  },
  h2model: { es: "Cómo funciona el modelo", en: "How the model works" },
  modelP: {
    es: (
      <>
        El núcleo es abierto: los paquetes <DocCode>@ar-agents/*</DocCode> en
        npm (MIT), los RFCs (CC-BY-4.0) y el wizard de{" "}
        <a href="/incorporar" style={linkSty}>
          /incorporar
        </a>
        . Con eso constituís y operás una Sociedad Automatizada por tu cuenta,
        sin pagarnos nada. Lo pago es la capa hosted que asume responsabilidad:
        un log de auditoría firmado e independiente, un rol humano que la ley
        exige, y la atestación que una contraparte necesita. Un fork copia el
        código, pero no la responsabilidad ni la atestación: eso es lo pago.
      </>
    ),
    en: (
      <>
        The core is open: the <DocCode>@ar-agents/*</DocCode> packages on npm
        (MIT), the RFCs (CC-BY-4.0), and the{" "}
        <a href="/incorporar" style={linkSty}>
          /incorporar
        </a>{" "}
        wizard. With that you incorporate and run an automated company on your
        own, paying us nothing. The paid part is the hosted layer that bears
        liability: a signed, independent audit log, a human role the law
        requires, and the attestation a counterparty needs. A fork copies the
        code, but not the liability or the attestation: that is the paid part.
      </>
    ),
  },
  h2fair: { es: "Quién paga", en: "Who pays" },
  fairP: {
    es: (
      <>
        Regla simple: paga el que <strong>necesita confiar</strong>, no el que
        es verificado. El empleador paga el background check, no el candidato. El
        prestamista paga el buró, no quien pide el crédito. Acá igual: la
        sociedad se verifica, y el banco, la aseguradora o el Estado pagan por
        poder confiar en ella. Nadie paga de más. Y por eso la atestación es
        creíble: el auditado no nos paga, así que no tenemos incentivo para
        mirar para otro lado.
      </>
    ),
    en: (
      <>
        Simple rule: the party who <strong>needs the trust</strong> pays, not the
        party being verified. The employer pays for the background check, not the
        applicant. The lender pays the bureau, not the borrower. Same here: the
        company gets verified, and the bank, the insurer, or the state pays to be
        able to trust it. No one overpays. And that is why the attestation is
        credible: the audited party does not pay us, so we have no incentive to
        look the other way.
      </>
    ),
  },
  h2auditor: { es: "El Auditor (vivo)", en: "The Auditor (live)" },
  auditorP1: {
    es: (
      <>
        El anteproyecto deja al administrador{" "}
        <strong>personalmente responsable</strong> por lo que hace la IA
        (art. 102). Solo lo protege si actuó &ldquo;con arreglo a un
        procedimiento de decisión adecuado&rdquo; (art. 101, regla de
        discrecionalidad empresarial). El Auditor es esa prueba: un registro de
        decisiones append-only y firmado (RFC-004). La firma asimétrica deja que
        el regulador verifique sin tu clave (RFC-005). El anclaje lo vuelve
        tamper-evidente: cualquiera guarda un anchor y, desde ahí, nadie
        reescribe el pasado sin que se note (RFC-006).
      </>
    ),
    en: (
      <>
        The draft bill leaves the administrator{" "}
        <strong>personally liable</strong> for what the AI does (art. 102). It
        only protects them if they acted &ldquo;through an adequate
        decision-making procedure&rdquo; (art. 101, the business-judgment rule).
        The Auditor is that proof: an append-only, signed decision log
        (RFC-004). An asymmetric signature lets a regulator verify without your
        key (RFC-005). Anchoring makes it tamper-evident: anyone keeps an anchor
        and, from that point on, no one rewrites the past unnoticed (RFC-006).
      </>
    ),
  },
  auditorP2: {
    es: (
      <>
        El log self-hosted es gratis (RFC-004 abierto). Lo pago es la versión
        hosted, anclada y certificada, USD 199/mes, con acceso de lectura para
        tu auditor o el regulador. La ley se aplica de pleno derecho a todas las
        sociedades existentes (art. 272). Así que el comprador no es solo la
        empresa-agente nueva: es cualquier empresa que use IA en su gestión.
        Vivo en{" "}
        <a href="/auditor" style={linkSty}>
          /auditor
        </a>
        .
      </>
    ),
    en: (
      <>
        The self-hosted log is free (RFC-004 is open). What is paid is the
        hosted, anchored, certified version, USD 199/mo, with read access for
        your auditor or the regulator. The law applies by operation of law to
        all existing companies (art. 272). So the buyer is not only the new
        agent-company: it is any company that uses AI in its management. Live
        at{" "}
        <a href="/auditor" style={linkSty}>
          /auditor
        </a>
        .
      </>
    ),
  },
  h2selfhost: { es: "Self-hosting", en: "Self-hosting" },
  selfhostP: {
    es: (
      <>
        El núcleo es MIT (los paquetes) y CC-BY-4.0 (los RFCs), para siempre. No
        relicenciamos nunca, y el spec va a un hogar neutral: es un bien público.
        Cualquiera puede correr el log y verificar las firmas, incluso un
        competidor. Eso es lo que lo vuelve confiable. Pagás la versión operada
        que un regulador acepta, no el derecho a usar el código.
      </>
    ),
    en: (
      <>
        The core is MIT (the packages) and CC-BY-4.0 (the RFCs), forever. We
        never relicense, and the spec goes to a neutral home: it is a public
        good. Anyone can run the log and verify the signatures, even a
        competitor. That is what makes it trustworthy. You pay for the managed
        version a regulator accepts, not for the right to use the code.
      </>
    ),
  },
  h2autonomo: { es: "100% autónomo", en: "100% autonomous" },
  autonomoP: {
    es: (
      <>
        El anteproyecto no permite cero humanos: toda sociedad necesita un
        administrador (art. 88) y la DAO un representante legal humano
        (art. 260). Pero la <em>operación</em> sí es 100% autónoma (art. 14:
        sin empleados, los agentes hacen todo). Automatizamos ese rol humano
        mínimo como servicio. Vos firmás como autor, no operás. La empresa-agente
        contrata El Auditor por API, sola:
      </>
    ),
    en: (
      <>
        The draft bill does not allow zero humans: every company needs an
        administrator (art. 88) and a DAO needs a human legal representative
        (art. 260). But the <em>operation</em> is 100% autonomous (art. 14: no
        employees, the agents do everything). We automate that minimal human
        role as a service. You sign as the author, you do not operate. The
        agent-company contracts The Auditor over the API, by itself:
      </>
    ),
  },
  h2cta: { es: "Acceso anticipado", en: "Early access" },
  ctaP: {
    es: (
      <>
        El Auditor ya cobra y opera. El representante y el cumplimiento son a
        medida (hablanos). La API de verificación está en camino. Para empezar,
        escribinos a{" "}
        <a href="mailto:naza@naza.ar" style={linkSty}>
          naza@naza.ar
        </a>{" "}
        o activá El Auditor acá:
      </>
    ),
    en: (
      <>
        The Auditor already charges and operates. Representative and compliance
        are custom (talk to us). The verification API is on the way. To start,
        write to{" "}
        <a href="mailto:naza@naza.ar" style={linkSty}>
          naza@naza.ar
        </a>{" "}
        or turn on The Auditor here:
      </>
    ),
  },
  h2honest: { es: "Nota honesta", en: "Honest note" },
  honestP: {
    es: "Lo único cobrando hoy es El Auditor, USD 199/mes, vía nuestro propio @ar-agents/mercadopago. El representante y el cumplimiento se contratan por contacto. La API de verificación todavía no está construida. El núcleo abierto no cambia ni cambiará: el código y los RFCs siguen gratis (MIT + CC-BY-4.0).",
    en: "The only thing charging today is The Auditor, USD 199/mo, via our own @ar-agents/mercadopago. Representative and compliance are contracted by contact. The verification API is not built yet. The open core does not change and will not: the code and the RFCs stay free (MIT + CC-BY-4.0).",
  },
} as const;

type Status = "free" | "live" | "custom" | "soon";

interface Layer {
  name: { es: string; en: string };
  payer: { es: string; en: string };
  status: Status;
  fair: { es: string; en: string };
}

const LAYERS: ReadonlyArray<Layer> = [
  {
    name: { es: "Núcleo abierto", en: "Open core" },
    payer: { es: "Nadie", en: "No one" },
    status: "free",
    fair: {
      es: "37 paquetes (MIT) + 6 RFCs (CC-BY-4.0) + wizard. Gratis y self-hosteable.",
      en: "37 packages (MIT) + 6 RFCs (CC-BY-4.0) + wizard. Free and self-hostable.",
    },
  },
  {
    name: { es: "El Auditor", en: "The Auditor" },
    payer: { es: "La sociedad", en: "The company" },
    status: "live",
    fair: {
      es: "Self-hosteás el log gratis. Pagás la firma independiente y el anclaje, no el código (art. 102).",
      en: "Self-host the log for free. You pay for the independent signature and anchoring, not the code (art. 102).",
    },
  },
  {
    name: { es: "Representante + cumplimiento", en: "Representative + compliance" },
    payer: { es: "La sociedad", en: "The company" },
    status: "custom",
    fair: {
      es: "La ley exige un humano, la IA no puede (arts. 260/264). Cuesta una fracción de un oficial de cumplimiento.",
      en: "The law requires a human, the AI cannot (arts. 260/264). It costs a fraction of a compliance officer.",
    },
  },
  {
    name: { es: "Verificación", en: "Verification" },
    payer: { es: "Banco / aseguradora / Estado", en: "Bank / insurer / state" },
    status: "soon",
    fair: {
      es: "Paga el que necesita confiar. La sociedad se verifica gratis. Como un background check.",
      en: "The party who needs the trust pays. The company is verified for free. Like a background check.",
    },
  },
];

const STATUS_LABEL: Record<Status, { es: string; en: string }> = {
  free: { es: "gratis", en: "free" },
  live: { es: "vivo · USD 199/mes", en: "live · USD 199/mo" },
  custom: { es: "a medida", en: "custom" },
  soon: { es: "en camino", en: "on the way" },
};

const AGENT_BUY = `// Tu Sociedad Automatizada contrata El Auditor sola, por API.

▶ agent: Para cumplir el art. 102 necesito un registro de decisiones peritable.

  → POST https://ar-agents.ar/api/auditor/subscribe
      { payerEmail: "ops@miempresa.ai", plan: "mensual", entityCuit: "30-XXXXXXXX-X" }
    ← { ok: true, subscription: { plan: "mensual", priceUsd: 199 },
        checkout: { initPoint: "https://mercadopago..." },
        activation: { endpoint: ".../api/auditor/activate" } }

  → tras autorizar el pago: POST /api/auditor/activate { preapprovalId }
    ← { ok: true, apiKey: "arag_live_..." }

  → cada decisión: POST /api/auditor/log con header x-api-key
    se firma (RFC-004/005) y se ancla (RFC-006); el regulador verifica solo.

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

      <DocH2>{t("h2fair")}</DocH2>
      <DocP>{t("fairP")}</DocP>
      <FairnessTable lang={lang} />

      <DocH2>{t("h2auditor")}</DocH2>
      <DocP>{t("auditorP1")}</DocP>
      <DocP>{t("auditorP2")}</DocP>

      <DocH2>{t("h2selfhost")}</DocH2>
      <DocP>{t("selfhostP")}</DocP>

      <DocH2>{t("h2autonomo")}</DocH2>
      <DocP>{t("autonomoP")}</DocP>
      <DocBlock>{AGENT_BUY}</DocBlock>

      <DocH2>{t("h2cta")}</DocH2>
      <DocP>{t("ctaP")}</DocP>
      <SubscribeCTA lang={lang} />

      <DocH2>{t("h2honest")}</DocH2>
      <DocP>{t("honestP")}</DocP>
    </DocShell>
  );
}

function FairnessTable({ lang }: { lang: Lang }) {
  const headers =
    lang === "es"
      ? { layer: "Capa", payer: "Quién paga", status: "Estado", fair: "Por qué" }
      : { layer: "Layer", payer: "Who pays", status: "Status", fair: "Why" };

  return (
    <div style={{ overflowX: "auto", margin: "16px 0 24px" }}>
      <table
        style={{
          width: "100%",
          minWidth: 680,
          borderCollapse: "collapse",
          fontSize: 13,
          background: "var(--bg-tint)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <thead>
          <tr>
            <th style={th}>{headers.layer}</th>
            <th style={th}>{headers.payer}</th>
            <th style={th}>{headers.status}</th>
            <th style={th}>{headers.fair}</th>
          </tr>
        </thead>
        <tbody>
          {LAYERS.map((l) => {
            const live = l.status === "live";
            const free = l.status === "free";
            return (
              <tr key={l.name.en} style={{ borderTop: "1px solid var(--border-color)" }}>
                <td style={{ ...td, color: "var(--text)", fontWeight: 600 }}>{l.name[lang]}</td>
                <td style={{ ...td, color: "var(--text-muted)" }}>{l.payer[lang]}</td>
                <td style={td}>
                  <span
                    style={{
                      padding: "1px 8px",
                      borderRadius: 9999,
                      fontSize: 10.5,
                      fontFamily: FONT_MONO_VAR,
                      whiteSpace: "nowrap",
                      letterSpacing: "0.02em",
                      background: live ? "var(--accent)" : "transparent",
                      color: live ? "var(--bg)" : free ? "var(--text-body)" : "var(--text-muted)",
                      boxShadow: live ? "none" : "inset 0 0 0 1px var(--border-color)",
                    }}
                  >
                    {STATUS_LABEL[l.status][lang]}
                  </span>
                </td>
                <td style={{ ...td }}>{l.fair[lang]}</td>
              </tr>
            );
          })}
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
