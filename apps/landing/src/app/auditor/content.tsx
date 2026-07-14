import Link from "next/link";
import { JsonLd } from "../json-ld";

/**
 * Shared bilingual content for /auditor (es default) and /en/auditor (en).
 * Server component, receives `lang` prop and renders the appropriate
 * strings. Toggle in nav navigates between the two URLs.
 *
 * Designed for: a journalist, a legislator, an AAIP/AFIP/BCRA inspector
 * who arrived because someone forwarded the URL. They have ~90 seconds
 * before they decide whether to keep reading or close the tab.
 *
 * Optimised for:
 *  - Lang-first headline (this audience reads ES first by default)
 *  - Single-page, printable (regulators print things)
 *  - Every claim is link-out-able to evidence on the same site
 *  - No marketing fluff; no animations; no required JS for content
 *  - Concrete sample sessionId + sample CUIT they can verify themselves
 */

type Lang = "es" | "en";

const SAMPLE_SESSION_ID = "ar-agents-sociedad-automatizada";
const SAMPLE_CUIT = "XX-XXXXXXXX-X";

const T = {
  eyebrow: {
    es: "/auditor · español · 1-page · imprimible · 2026-05-11",
    en: "/auditor · english · 1-page · printable · 2026-05-11",
  },
  h1: {
    es: "Auditá una sociedad automatizada argentina, en una hoja.",
    en: "Audit an Argentine automated company, on a single page.",
  },
  lede: {
    es: (
      <>
        <strong>ar-agents</strong> es la infraestructura open-source sobre la
        que se está construyendo la primera generación de sociedades
        automatizadas argentinas. Esta página tiene un objetivo único:
        explicarle cómo verificar, sin pedir permiso al operador, qué hizo
        una sociedad automatizada durante un período de tiempo determinado.
      </>
    ),
    en: (
      <>
        <strong>ar-agents</strong> is the open-source infrastructure
        underpinning the first generation of Argentine automated companies.
        This page has a single goal: explain how to verify, without asking
        the operator for permission, what an automated company did during a
        given time window.
      </>
    ),
  },
  readingTime: {
    es: "Tiempo de lectura: 7 minutos · Sin glosa · Sin marketing · Cada afirmación enlaza a la prueba.",
    en: "Reading time: 7 minutes · No filler · No marketing · Every claim links to its evidence.",
  },
  s1Title: {
    es: "1 · El registro existe",
    en: "1 · The log exists",
  },
  s1p1: {
    es: (
      <>
        Toda sociedad automatizada que use <strong>ar-agents</strong>{" "}
        escribe cada acción en un registro <em>append-only</em>, firmado al
        momento de la
        escritura con HMAC-SHA256. El registro es público en lectura (las
        entradas no contienen secretos; sí contienen lo que pasó). La clave
        de firma es privada del operador.
      </>
    ),
    en: (
      <>
        Every automated company that uses <strong>ar-agents</strong> writes
        each action to an <em>append-only</em> log, signed at write time
        with HMAC-SHA256. The log is publicly readable (entries don't
        contain secrets; they contain what happened). The signing key is
        the operator's private key.
      </>
    ),
  },
  s1p2: { es: "Una entrada típica luce así:", en: "A typical entry looks like:" },
  s1p3: {
    es: (
      <>
        La especificación normativa de cada campo (lo que MUST/SHOULD/MAY
        aparecer) está en <A href="/rfcs/004">RFC-004</A>. La
        implementación de referencia (código TypeScript que cualquiera
        puede leer) está en{" "}
        <A href="/architecture/audit-log">/architecture/audit-log</A>.
      </>
    ),
    en: (
      <>
        The normative specification of each field (what MUST/SHOULD/MAY
        appear) is in <A href="/rfcs/004">RFC-004</A>. The reference
        implementation (TypeScript anyone can read) lives at{" "}
        <A href="/architecture/audit-log">/architecture/audit-log</A>.
      </>
    ),
  },
  s2Title: {
    es: "2 · El registro es verificable",
    en: "2 · The log is verifiable",
  },
  s2p1: {
    es: (
      <>
        La firma HMAC permite que un auditor que <em>no</em> tiene la
        clave del operador igual pueda detectar si una entrada fue
        modificada después de escrita. El operador no puede ir hacia
        atrás y cambiar &quot;cobré $1500&quot; por &quot;cobré $1.5M&quot;:
        la firma se rompe.
      </>
    ),
    en: (
      <>
        The HMAC signature lets an auditor who does <em>not</em> have the
        operator's key still detect whether an entry was modified after
        writing. The operator can't go back and change &quot;charged
        $1,500&quot; into &quot;charged $1.5M&quot;: the signature breaks.
      </>
    ),
  },
  s2p2: {
    es: "Cómo verificar usted mismo, sin instalar nada:",
    en: "How to verify it yourself, without installing anything:",
  },
  s2li1: {
    es: (
      <>
        Abra{" "}
        <A href={`/verify?sessionId=${SAMPLE_SESSION_ID}`}>
          /verify?sessionId={SAMPLE_SESSION_ID}
        </A>
        .
      </>
    ),
    en: (
      <>
        Open{" "}
        <A href={`/verify?sessionId=${SAMPLE_SESSION_ID}`}>
          /verify?sessionId={SAMPLE_SESSION_ID}
        </A>
        .
      </>
    ),
  },
  s2li2: {
    es: "El servidor recalcula la firma de cada entrada con su clave + le muestra el conteo: total / verified / tampered.",
    en: "The server recomputes each entry's signature with its key + shows the count: total / verified / tampered.",
  },
  s2li3: {
    es: (
      <>
        Si quiere verificar usted mismo sin confiar en el servidor,
        descargue las entradas crudas de{" "}
        <A href={`/api/play/audit/${SAMPLE_SESSION_ID}`}>
          /api/play/audit/{SAMPLE_SESSION_ID}
        </A>{" "}
        y aplique el algoritmo de <A href="/rfcs/004">RFC-004 § 3</A> con
        la clave pública (v2 asimétrica) o el desafío-respuesta de
        posesión de clave (v1 simétrica, planificado v1.1).
      </>
    ),
    en: (
      <>
        If you want to verify yourself without trusting the server,
        download the raw entries from{" "}
        <A href={`/api/play/audit/${SAMPLE_SESSION_ID}`}>
          /api/play/audit/{SAMPLE_SESSION_ID}
        </A>{" "}
        and apply the <A href="/rfcs/004">RFC-004 § 3</A> algorithm with
        the public key (v2 asymmetric) or the key-possession
        challenge-response (v1 symmetric, planned for v1.1).
      </>
    ),
  },
  s2p3: {
    es: (
      <>
        La verificación es{" "}
        <strong>computacionalmente determinística</strong>: la misma
        entrada con la misma clave produce siempre la misma firma. Esto
        significa que el operador no puede &quot;arreglar&quot; un
        registro de auditoría posterior sin que se note.
      </>
    ),
    en: (
      <>
        Verification is{" "}
        <strong>computationally deterministic</strong>: the same entry
        with the same key always produces the same signature. The operator
        can't &quot;fix&quot; an audit log after the fact without
        breaking the verification.
      </>
    ),
  },
  s3Title: {
    es: "3 · El registro es exportable",
    en: "3 · The log is exportable",
  },
  s3p1: {
    es: "El operador está obligado a producir, ante requerimiento regulatorio:",
    en: "On regulatory request, the operator is obligated to produce:",
  },
  s3li1Label: { es: "JSON completo", en: "Full JSON" },
  s3li2Label: {
    es: "CSV RFC-4180 con BOM",
    en: "RFC-4180 CSV with BOM",
  },
  s3li2Note: {
    es: "(abre limpio en Excel)",
    en: "(opens cleanly in Excel)",
  },
  s3li3Label: { es: "Cuenta de verificación", en: "Verification count" },
  s3li4Label: { es: "Stream en vivo", en: "Live stream" },
  s3li4Note: {
    es: "(Server-Sent Events) para dashboards regulatorios:",
    en: "(Server-Sent Events) for regulatory dashboards:",
  },
  s3sla: {
    es: "Plazo de respuesta: 1 día hábil desde el requerimiento. Los endpoints son automáticos; no hay intervención manual del operador.",
    en: "Response window: 1 business day from request. The endpoints are automatic; no manual intervention by the operator.",
  },
  s4Title: {
    es: "4 · El registro distingue qué fue automático y qué fue confirmado por un humano",
    en: "4 · The log distinguishes automated actions from human-confirmed actions",
  },
  s4p1: {
    es: (
      <>
        Cada entrada lleva un campo <Code inline>governance</Code> con uno
        de cuatro valores. La asignación de responsabilidad civil (RFC-001
        § 4) depende directamente de este campo:
      </>
    ),
    en: (
      <>
        Each entry carries a <Code inline>governance</Code> field with one
        of four values. The assignment of civil liability (RFC-001 § 4)
        depends directly on this field:
      </>
    ),
  },
  s4thGov: { es: "governance", en: "governance" },
  s4thMeaning: { es: "Significado", en: "Meaning" },
  s4thLiability: { es: "Responsabilidad", en: "Liability" },
  s4row1Meaning: {
    es: "Código puro, determinístico, sin LLM.",
    en: "Pure code, deterministic, no LLM.",
  },
  s4row1Liability: { es: "Operador.", en: "Operator." },
  s4row2Meaning: {
    es: "LLM corrió, output clasificado + registrado.",
    en: "LLM ran, output classified + recorded.",
  },
  s4row2Liability: {
    es: "Operador + proveedor del LLM (registrado).",
    en: "Operator + LLM provider (registered).",
  },
  s4row3Meaning: {
    es: "API externa no cableada. Es un demo, no es real.",
    en: "External API not wired. It's a demo, not productive.",
  },
  s4row3Liability: {
    es: "Demo-tier; sin efecto productivo.",
    en: "Demo-tier; no productive effect.",
  },
  s4row4Meaning: {
    es: "Acción confirmada explícitamente por un humano.",
    en: "Action explicitly confirmed by a human.",
  },
  s4row4Liability: {
    es: "El humano que confirmó absorbe.",
    en: "The confirming human absorbs liability.",
  },
  s4p2: {
    es: (
      <>
        Si una sociedad automatizada emite en producción una entrada con{" "}
        <Code inline>governance: &quot;mocked-upstream&quot;</Code>, está
        haciendo una admisión pública de que el efecto secundario{" "}
        <em>no</em> ocurrió contra el sistema real. Un regulador que lee
        el log distingue una operación productiva de un demo solamente
        por este campo.
      </>
    ),
    en: (
      <>
        If a productive automated company emits an entry with{" "}
        <Code inline>governance: &quot;mocked-upstream&quot;</Code>, it's
        a public admission that the side effect did <em>not</em> hit the
        real system. A regulator reading the log can distinguish a
        productive operation from a demo by this field alone.
      </>
    ),
  },
  s5Title: {
    es: "5 · Qué puede pedir un regulador, sin orden judicial",
    en: "5 · What a regulator can request, without a court order",
  },
  s5li1Label: { es: "Inventario de sesiones", en: "Session inventory" },
  s5li1Body: {
    es: " activas durante una ventana temporal.",
    en: " active during a time window.",
  },
  s5li2Label: { es: "Exportación completa", en: "Full export" },
  s5li2Body: {
    es: " de una sesión específica en JSON + CSV.",
    en: " of a specific session in JSON + CSV.",
  },
  s5li3Label: { es: "Prueba de verificación", en: "Verification proof" },
  s5li3Body: {
    es: ": el resultado de verificar las firmas + una prueba de posesión de clave (desafío-respuesta sin revelar la clave).",
    en: ": the result of verifying signatures + a key-possession proof (challenge-response without revealing the key).",
  },
  s5li4Label: { es: "Narrativa operativa", en: "Operational narrative" },
  s5li4Body: {
    es: (
      <>
        : un resumen legible por humanos de qué hizo la sociedad
        automatizada durante la ventana, generado <em>del log</em>, no del
        recuerdo del
        operador. Provisto vía <A href="/play">/play</A> + el CSV.
      </>
    ),
    en: (
      <>
        : a human-readable summary of what the automated company did during
        the window, generated <em>from the log</em>, not from operator
        memory. Provided via <A href="/play">/play</A> + the CSV.
      </>
    ),
  },
  s5p2: {
    es: "Con orden judicial, el regulador puede compeler adicionalmente la cadena de custodia de la clave de firma (quién la tuvo, dónde la guardó, cuándo la rotó), equivalente a compeler la custodia del sello de un escribano.",
    en: "With a court order, the regulator can additionally compel the chain of custody for the signing key (who held it, where it was stored, when it was rotated), equivalent to compelling the custody chain of a notary's seal.",
  },
  s6Title: {
    es: "6 · La sociedad automatizada se identifica en pleno",
    en: "6 · The automated company identifies itself fully",
  },
  s6p1: {
    es: (
      <>
        Toda sociedad automatizada construida con <strong>ar-agents</strong>{" "}
        publica en <Code inline>/.well-known/agents.json</Code> su
        identificación jurisdiccional + sus capacidades. Por ejemplo, para
        una sociedad cuyo operador es CUIT {SAMPLE_CUIT}:
      </>
    ),
    en: (
      <>
        Every automated company built with <strong>ar-agents</strong>{" "}
        publishes its jurisdictional identity + capabilities at{" "}
        <Code inline>/.well-known/agents.json</Code>. For example, for a
        company whose operator is CUIT {SAMPLE_CUIT}:
      </>
    ),
  },
  s6p2: {
    es: (
      <>
        La convención completa de discovery está en{" "}
        <A href="/rfcs/002">RFC-002</A>. La idea: no hay que adivinar
        dónde están los endpoints de una sociedad automatizada. Hay un lugar
        estándar.
      </>
    ),
    en: (
      <>
        The complete discovery convention lives in{" "}
        <A href="/rfcs/002">RFC-002</A>. The idea: you don't have to
        guess where an automated company's endpoints are. There's a
        standard place.
      </>
    ),
  },
  s7Title: {
    es: "7 · Si quiere ir más profundo",
    en: "7 · If you want to go deeper",
  },
  s7li1: {
    es: "Marco de responsabilidad civil de tres capas para sociedades automatizadas.",
    en: "Three-layer civil liability framework for automated companies.",
  },
  s7li2: {
    es: "Especificación normativa del log operativo. Es el documento técnico que la legislación puede citar.",
    en: "Normative specification of the operational log. The technical document legislation can cite.",
  },
  s7li3: {
    es: "Desarmado técnico del log (código + razonamiento, 11 secciones).",
    en: "Code-level breakdown of the log (code + reasoning, 11 sections).",
  },
  s7li4: {
    es: "Modelo de amenazas, 18 escenarios.",
    en: "Threat model, 18 scenarios.",
  },
  s7li5: {
    es: "Demo anotado de 5 pasos: hacer una operación, ver cómo queda en el log, intentar manipularla y ver cómo se detecta.",
    en: "Annotated 5-step demo: run an operation, see how it lands in the log, try to tamper it, see how it's detected.",
  },
  s7li6: {
    es: "Cifras en vivo (npm, GitHub, packages, tests). Auto-refresh cada 6 horas.",
    en: "Live numbers (npm, GitHub, packages, tests). Auto-refreshed every 6 hours.",
  },
  s7li7: {
    es: "Contexto político-jurídico del régimen propuesto (28-abr-2026).",
    en: "Political-legal context of the proposed regime (Apr 28, 2026).",
  },
  s8Title: { es: "8 · Reunión técnica", en: "8 · Technical meeting" },
  s8p: {
    es: (
      <>
        Si querés conversar sobre cómo este stack se usa, sus limitaciones
        reales, o cómo se cita en un proyecto de ley:{" "}
        <strong>
          30 minutos por videollamada, sin honorarios, sin agenda
          comercial.
        </strong>{" "}
        Escribime a{" "}
        <A href="mailto:naza@naza.ar">naza@naza.ar</A> con la
        franja horaria que te sirva. El régimen está en debate; el código
        ya existe; conviene que ambos lados se hablen.
      </>
    ),
    en: (
      <>
        If you'd like to talk about how this stack is used, its real
        limitations, or how to cite it in a draft bill:{" "}
        <strong>
          30 minutes by video call, no fees, no commercial agenda.
        </strong>{" "}
        Email <A href="mailto:naza@naza.ar">naza@naza.ar</A>{" "}
        with a time window that works. The regime is being debated; the
        code already exists; both sides should be talking.
      </>
    ),
  },
  s9Title: {
    es: "9 · Si no le convence",
    en: "9 · If you're not convinced",
  },
  s9p1: {
    es: (
      <>
        Esta página puede estar equivocada. La implementación puede tener
        bugs. La especificación puede tener huecos. Si encuentra alguno,
        abra un issue público en{" "}
        <A href="https://github.com/ar-agents/ar-agents/issues">
          github.com/ar-agents/ar-agents/issues
        </A>
        . Toda la conversación es pública; toda corrección queda
        registrada en el changelog público.
      </>
    ),
    en: (
      <>
        This page might be wrong. The implementation might have bugs. The
        specification might have gaps. If you find one, open a public
        issue at{" "}
        <A href="https://github.com/ar-agents/ar-agents/issues">
          github.com/ar-agents/ar-agents/issues
        </A>
        . Every conversation is public; every correction is recorded in
        the public changelog.
      </>
    ),
  },
  s9p2: {
    es: "Esta es una página de un proyecto open-source. No es un documento oficial de ningún organismo. El régimen de sociedades automatizadas fue anunciado el 28 de abril de 2026 por el Ministerio de Desregulación; al momento de esta publicación, no hay aún ley aprobada. Esta infraestructura existe para que la conversación legislativa tenga un referente técnico concreto que mirar.",
    en: "This is a page from an open-source project. It is not an official document from any agency. The automated-company regime was announced on April 28, 2026 by Argentina's Ministry of Deregulation and State Transformation; at the time of this publication, there is no enacted law yet. This infrastructure exists so the legislative conversation has a concrete technical reference to look at.",
  },
} as const;

const ENTRY_SAMPLE = `{
  "id": "2026-05-11T14:23:01.512Z-a1b2c3d4",
  "sessionId": "${SAMPLE_SESSION_ID}",
  "ts": "2026-05-11T14:23:01.512Z",
  "tool": "mercadopago.preapproval.create",
  "governance": "audit-logged",
  "input": { "payerEmail": "comprador@ejemplo.com.ar", "amount": 1500 },
  "output": { "preapprovalId": "abc123" },
  "durationMs": 412,
  "hmac": "sha256:a4b1c8f7..."
}`;

const AGENTS_JSON_SAMPLE = `{
  "$schema": "https://ar-agents.ar/schemas/agents.v1.json",
  "version": "1.0",
  "issuer": {
    "jurisdiction": "AR",
    "type": "sociedad-ia",
    "operatorCuit": "${SAMPLE_CUIT}",
    "operatorName": "Nazareno Clemente",
    "supervisionRegime": "rfc-001-v1"
  },
  "endpoints": {
    "auditRead":   "https://ar-agents.ar/api/play/audit/{sessionId}",
    "auditVerify": "https://ar-agents.ar/api/play/audit/{sessionId}?verify=1",
    "auditCsv":    "https://ar-agents.ar/api/play/audit/{sessionId}/csv",
    "auditStream": "https://ar-agents.ar/api/play/audit-stream/{sessionId}"
  },
  "rfcConformance": ["rfc-001-v1", "rfc-002-v1", "rfc-003-draft", "rfc-004-draft"]
}`;

export function AuditorContent({ lang }: { lang: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline:
            lang === "es"
              ? "/auditor, for regulators, journalists, legislators"
              : "/auditor, for regulators, journalists, legislators (EN)",
          inLanguage: lang === "es" ? "es-AR" : "en-US",
          url:
            lang === "es"
              ? "https://ar-agents.ar/auditor"
              : "https://ar-agents.ar/en/auditor",
          datePublished: "2026-05-11",
          author: {
            "@type": "Person",
            name: "Nazareno Clemente",
            email: "naza@naza.ar",
          },
          publisher: {
            "@type": "Organization",
            name: "ar-agents",
            url: "https://ar-agents.ar",
          },
          isPartOf: {
            "@type": "WebSite",
            name: "ar-agents",
            url: "https://ar-agents.ar",
          },
          audience: {
            "@type": "Audience",
            audienceType: "Regulators, journalists, legislators",
          },
        }}
      />

      <main
        style={{
          maxWidth: 800,
          margin: "0 auto",
          padding: "48px 24px 96px",
          color: "var(--text-body)",
          fontSize: 15,
          lineHeight: 1.6,
        }}
      >
        <header style={{ marginBottom: 32 }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: 8,
            }}
          >
            {t("eyebrow")}
          </p>
          <h1
            style={{
              fontSize: 32,
              lineHeight: 1.15,
              fontWeight: 450,
              color: "var(--text-strong)",
              marginBottom: 12,
              letterSpacing: "-0.06em",
            }}
          >
            {t("h1")}
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.55,
              color: "var(--text-body)",
              marginBottom: 16,
            }}
          >
            {t("lede")}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {t("readingTime")}
          </p>
        </header>

        <Section title={t("s1Title")}>
          <p>{t("s1p1")}</p>
          <p>{t("s1p2")}</p>
          <Code>{ENTRY_SAMPLE}</Code>
          <p>{t("s1p3")}</p>
        </Section>

        <Section title={t("s2Title")}>
          <p>{t("s2p1")}</p>
          <p>{t("s2p2")}</p>
          <ol style={olStyle}>
            <li style={liStyle}>{t("s2li1")}</li>
            <li style={liStyle}>{t("s2li2")}</li>
            <li style={liStyle}>{t("s2li3")}</li>
          </ol>
          <p>{t("s2p3")}</p>
        </Section>

        <Section title={t("s3Title")}>
          <p>{t("s3p1")}</p>
          <ul style={ulStyle}>
            <li style={liStyle}>
              <strong>{t("s3li1Label")}</strong>:{" "}
              <A href={`/api/play/audit/${SAMPLE_SESSION_ID}`}>
                /api/play/audit/{SAMPLE_SESSION_ID}
              </A>
            </li>
            <li style={liStyle}>
              <strong>{t("s3li2Label")}</strong> {t("s3li2Note")}:{" "}
              <A href={`/api/play/audit/${SAMPLE_SESSION_ID}/csv`}>
                /api/play/audit/{SAMPLE_SESSION_ID}/csv
              </A>
            </li>
            <li style={liStyle}>
              <strong>{t("s3li3Label")}</strong>:{" "}
              <A href={`/api/play/audit/${SAMPLE_SESSION_ID}?verify=1`}>
                /api/play/audit/{SAMPLE_SESSION_ID}?verify=1
              </A>
            </li>
            <li style={liStyle}>
              <strong>{t("s3li4Label")}</strong> {t("s3li4Note")}{" "}
              <Code inline>
                GET /api/play/audit-stream/{SAMPLE_SESSION_ID}
              </Code>
            </li>
          </ul>
          <p>{t("s3sla")}</p>
        </Section>

        <Section title={t("s4Title")}>
          <p>{t("s4p1")}</p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{t("s4thGov")}</th>
                <th style={thStyle}>{t("s4thMeaning")}</th>
                <th style={thStyle}>{t("s4thLiability")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdMonoStyle}>algorithm-only</td>
                <td style={tdStyle}>{t("s4row1Meaning")}</td>
                <td style={tdStyle}>{t("s4row1Liability")}</td>
              </tr>
              <tr>
                <td style={tdMonoStyle}>audit-logged</td>
                <td style={tdStyle}>{t("s4row2Meaning")}</td>
                <td style={tdStyle}>{t("s4row2Liability")}</td>
              </tr>
              <tr>
                <td style={tdMonoStyle}>mocked-upstream</td>
                <td style={tdStyle}>{t("s4row3Meaning")}</td>
                <td style={tdStyle}>{t("s4row3Liability")}</td>
              </tr>
              <tr>
                <td style={tdMonoStyle}>requires-confirmation</td>
                <td style={tdStyle}>{t("s4row4Meaning")}</td>
                <td style={tdStyle}>{t("s4row4Liability")}</td>
              </tr>
            </tbody>
          </table>
          <p>{t("s4p2")}</p>
        </Section>

        <Section title={t("s5Title")}>
          <ul style={ulStyle}>
            <li style={liStyle}>
              <strong>{t("s5li1Label")}</strong>
              {t("s5li1Body")}
            </li>
            <li style={liStyle}>
              <strong>{t("s5li2Label")}</strong>
              {t("s5li2Body")}
            </li>
            <li style={liStyle}>
              <strong>{t("s5li3Label")}</strong>
              {t("s5li3Body")}
            </li>
            <li style={liStyle}>
              <strong>{t("s5li4Label")}</strong>
              {t("s5li4Body")}
            </li>
          </ul>
          <p>{t("s5p2")}</p>
        </Section>

        <Section title={t("s6Title")}>
          <p>{t("s6p1")}</p>
          <Code>{AGENTS_JSON_SAMPLE}</Code>
          <p>{t("s6p2")}</p>
        </Section>

        <Section title={t("s7Title")}>
          <ul style={ulStyle}>
            <li style={liStyle}>
              <A href="/rfcs/001">RFC-001</A>, {t("s7li1")}
            </li>
            <li style={liStyle}>
              <A href="/rfcs/004">RFC-004</A>, {t("s7li2")}
            </li>
            <li style={liStyle}>
              <A href="/architecture/audit-log">/architecture/audit-log</A>:{" "}
            {t("s7li3")}
            </li>
            <li style={liStyle}>
              <A href="/architecture/security">/architecture/security</A>, {" "}
              {t("s7li4")}
            </li>
            <li style={liStyle}>
              <A href="/play">/play</A>, {t("s7li5")}
            </li>
            <li style={liStyle}>
              <A href="/data-room">/data-room</A>, {t("s7li6")}
            </li>
            <li style={liStyle}>
              <A href="/sociedades-ia">/sociedades-ia</A>, {t("s7li7")}
            </li>
          </ul>
        </Section>

        <Section title={t("s8Title")}>
          <p style={{ marginBottom: 12 }}>{t("s8p")}</p>
        </Section>

        <Section title={t("s9Title")}>
          <p>{t("s9p1")}</p>
          <p
            style={{
              marginTop: 24,
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            {t("s9p2")}
          </p>
        </Section>

        <footer
          style={{
            marginTop: 64,
            paddingTop: 24,
            borderTop: "1px solid var(--border-subtle)",
            fontSize: 12,
            color: "var(--text-muted)",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "space-between",
          }}
        >
          <span>ar-agents.ar · MIT + CC-BY-4.0</span>
          <span>
            <A href="/">/</A> ·{" "}
            <A href={lang === "es" ? "/manifiesto" : "/en/manifesto"}>
              {lang === "es" ? "/manifiesto" : "/manifesto"}
            </A>{" "}
            ·{" "}
            <A
              href={lang === "es" ? "/sociedades-ia" : "/en/ai-corporations"}
            >
              {lang === "es" ? "/sociedades-ia" : "/ai-corporations"}
            </A>{" "}
            ·{" "}
            <A href="https://github.com/ar-agents/ar-agents">github</A>
          </span>
        </footer>
      </main>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline styled components (no CSS module needed; print-friendly)
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginBottom: 40,
        paddingBottom: 32,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <h2
        style={{
          fontSize: 20,
          lineHeight: 1.2,
          fontWeight: 500,
          color: "var(--text-strong)",
          marginBottom: 16,
          letterSpacing: "-0.005em",
        }}
      >
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function A({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  if (external) {
    return (
      <a
        href={href}
        style={{ color: "var(--accent)", textDecoration: "underline" }}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      style={{ color: "var(--accent)", textDecoration: "underline" }}
    >
      {children}
    </Link>
  );
}

function Code({
  children,
  inline = false,
}: {
  children: React.ReactNode;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <code
        style={{
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 13,
          padding: "1px 5px",
          background: "var(--bg-tint)",
          borderRadius: 4,
          color: "var(--text-strong)",
        }}
      >
        {children}
      </code>
    );
  }
  return (
    <pre
      style={{
        background: "var(--bg-tint)",
        padding: 14,
        borderRadius: 8,
        fontSize: 12.5,
        lineHeight: 1.55,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        color: "var(--text-body)",
        overflow: "auto",
        boxShadow: "var(--card-shadow)",
        marginBottom: 16,
        whiteSpace: "pre",
      }}
    >
      {children}
    </pre>
  );
}

const ulStyle: React.CSSProperties = {
  paddingLeft: 24,
  marginBottom: 16,
};

const olStyle: React.CSSProperties = {
  paddingLeft: 24,
  marginBottom: 16,
};

const liStyle: React.CSSProperties = {
  marginBottom: 6,
  lineHeight: 1.55,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  marginBottom: 16,
  boxShadow: "var(--card-shadow)",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--bg-tint)",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  borderBottom: "1px solid var(--border-subtle)",
  fontWeight: 500,
  fontSize: 12,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid var(--border-subtle)",
  color: "var(--text-body)",
};

const tdMonoStyle: React.CSSProperties = {
  ...tdStyle,
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 12,
  color: "var(--text-strong)",
  whiteSpace: "nowrap",
};
