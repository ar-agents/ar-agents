import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../json-ld";

/**
 * /auditor — Regulator-facing single page.
 *
 * Designed for the reader who has never used the product before and
 * arrived because someone forwarded them this URL: a journalist, a
 * legislator, an AAIP/AFIP/BCRA inspector. They have ~90 seconds before
 * they decide whether to keep reading or close the tab.
 *
 * Optimised for:
 *  - Spanish-first headline (this audience reads Spanish first)
 *  - Single-page, printable (regulators print things)
 *  - Every claim is link-out-able to evidence on the same site
 *  - No marketing fluff; no animations; no required JS for content
 *  - Concrete sample sessionId + sample CUIT they can verify themselves
 */

const SAMPLE_SESSION_ID = "demo-public-ar-001";
const SAMPLE_CUIT = "20-41758101-5";

export const metadata: Metadata = {
  title: "/auditor · for regulators, journalists, legislators · ar-agents",
  description:
    "Una sociedad-IA argentina opera bajo /arg. Cada llamada deja un registro firmado HMAC-SHA256 que cualquier auditor puede verificar sin pedirle al operador su clave. Esta página resume el proceso completo en una sola hoja imprimible. En español, sin glosas.",
  alternates: {
    canonical: "https://ar-agents.vercel.app/auditor",
    languages: { es: "/auditor", en: "/auditor" },
  },
  openGraph: {
    title: "/auditor · for regulators, journalists, legislators",
    description:
      "Una sociedad-IA argentina opera bajo /arg. Cada llamada deja un registro firmado HMAC-SHA256 que cualquier auditor puede verificar sin pedirle al operador su clave.",
    url: "https://ar-agents.vercel.app/auditor",
    type: "article",
  },
};

export default function AuditorPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "/auditor — for regulators, journalists, legislators",
          inLanguage: "es-AR",
          url: "https://ar-agents.vercel.app/auditor",
          datePublished: "2026-05-11",
          author: {
            "@type": "Person",
            name: "Nazareno Clemente",
            email: "naza@helloastro.co",
          },
          publisher: {
            "@type": "Organization",
            name: "ar-agents",
            url: "https://ar-agents.vercel.app",
          },
          isPartOf: {
            "@type": "WebSite",
            name: "ar-agents",
            url: "https://ar-agents.vercel.app",
          },
          audience: {
            "@type": "Audience",
            audienceType: "Regulators, journalists, legislators",
          },
        }}
      />

      <main
        style={{
          maxWidth: 880,
          margin: "0 auto",
          padding: "48px 24px 96px",
          color: "var(--text-body)",
          fontSize: 15,
          lineHeight: 1.6,
        }}
      >
        {/* Print-friendly header */}
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
            /arg · /auditor · español · 1-page · imprimible · 2026-05-11
          </p>
          <h1
            style={{
              fontSize: 32,
              lineHeight: 1.15,
              fontWeight: 500,
              color: "var(--text-strong)",
              marginBottom: 12,
              letterSpacing: "-0.01em",
            }}
          >
            Auditar una sociedad-IA argentina, en una hoja.
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.55,
              color: "var(--text-body)",
              marginBottom: 16,
            }}
          >
            Si alguien le mandó este link, es porque <strong>/arg</strong> es
            la infraestructura open-source sobre la que se está construyendo
            la primera generación de sociedades-IA argentinas. Esta página
            tiene un objetivo único: explicarle cómo verificar, sin pedir
            permiso al operador, qué hizo una sociedad-IA durante un período
            de tiempo determinado.
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Tiempo de lectura: 7 minutos · Sin glosa · Sin marketing ·
            Cada afirmación enlaza a la prueba.
          </p>
        </header>

        <Section title="1 · El registro existe">
          <p>
            Toda sociedad-IA que use <strong>/arg</strong> escribe cada
            acción en un registro <em>append-only</em>, firmado al momento
            de la escritura con HMAC-SHA256. El registro es público en lectura
            (las entradas no contienen secretos; sí contienen lo que pasó).
            La clave de firma es privada del operador.
          </p>
          <p>
            Una entrada típica luce así:
          </p>
          <Code>{`{
  "id": "2026-05-11T14:23:01.512Z-a1b2c3d4",
  "sessionId": "${SAMPLE_SESSION_ID}",
  "ts": "2026-05-11T14:23:01.512Z",
  "tool": "mercadopago.preapproval.create",
  "governance": "audit-logged",
  "input": { "payerEmail": "comprador@ejemplo.com.ar", "amount": 1500 },
  "output": { "preapprovalId": "abc123" },
  "durationMs": 412,
  "hmac": "sha256:a4b1c8f7..."
}`}</Code>
          <p>
            La especificación normativa de cada campo (lo que MUST/SHOULD/MAY
            aparecer) está en{" "}
            <A href="/rfcs/004">RFC-004</A>. La implementación de referencia
            (código TypeScript que cualquiera puede leer) está en{" "}
            <A href="/architecture/audit-log">/architecture/audit-log</A>.
          </p>
        </Section>

        <Section title="2 · El registro es verificable">
          <p>
            La firma HMAC permite que un auditor que <em>no</em> tiene la
            clave del operador igual pueda detectar si una entrada fue
            modificada después de escrita. El operador no puede ir hacia
            atrás y cambiar &quot;cobré $1500&quot; por &quot;cobré $1.5M&quot;:
            la firma se rompe.
          </p>
          <p>
            Cómo verificar usted mismo, sin instalar nada:
          </p>
          <ol style={olStyle}>
            <li style={liStyle}>
              Abra{" "}
              <A href={`/verify?sessionId=${SAMPLE_SESSION_ID}`}>
                /verify?sessionId={SAMPLE_SESSION_ID}
              </A>
              .
            </li>
            <li style={liStyle}>
              El servidor recalcula la firma de cada entrada con su clave +
              le muestra el conteo: total / verified / tampered.
            </li>
            <li style={liStyle}>
              Si quiere verificar usted mismo sin confiar en el servidor,
              descargue las entradas crudas de{" "}
              <A href={`/api/play/audit/${SAMPLE_SESSION_ID}`}>
                /api/play/audit/{SAMPLE_SESSION_ID}
              </A>{" "}
              y aplique el algoritmo de{" "}
              <A href="/rfcs/004">RFC-004 § 3</A> con la clave pública (v2
              asimétrica) o el desafío-respuesta de posesión de clave
              (v1 simétrica, planificado v1.1).
            </li>
          </ol>
          <p>
            La verificación es <strong>computacionalmente determinística</strong>:
            la misma entrada con la misma clave produce siempre la misma firma.
            Esto significa que el operador no puede &quot;arreglar&quot; un
            registro de auditoría posterior sin que se note.
          </p>
        </Section>

        <Section title="3 · El registro es exportable">
          <p>
            El operador está obligado a producir, ante requerimiento
            regulatorio:
          </p>
          <ul style={ulStyle}>
            <li style={liStyle}>
              <strong>JSON completo</strong> de la sesión:{" "}
              <A href={`/api/play/audit/${SAMPLE_SESSION_ID}`}>
                /api/play/audit/{SAMPLE_SESSION_ID}
              </A>
            </li>
            <li style={liStyle}>
              <strong>CSV RFC-4180 con BOM</strong> (abre limpio en Excel):{" "}
              <A href={`/api/play/audit/${SAMPLE_SESSION_ID}/csv`}>
                /api/play/audit/{SAMPLE_SESSION_ID}/csv
              </A>
            </li>
            <li style={liStyle}>
              <strong>Cuenta de verificación</strong>:{" "}
              <A href={`/api/play/audit/${SAMPLE_SESSION_ID}?verify=1`}>
                /api/play/audit/{SAMPLE_SESSION_ID}?verify=1
              </A>
            </li>
            <li style={liStyle}>
              <strong>Stream en vivo</strong> (Server-Sent Events) para
              dashboards regulatorios:{" "}
              <Code inline>GET /api/play/audit-stream/{SAMPLE_SESSION_ID}</Code>
            </li>
          </ul>
          <p>
            Plazo proyectado para producción: 1 día hábil desde el
            requerimiento. Los endpoints son automáticos; no hay
            intervención manual del operador.
          </p>
        </Section>

        <Section title="4 · El registro distingue qué fue automático y qué fue confirmado por un humano">
          <p>
            Cada entrada lleva un campo <Code inline>governance</Code> con
            uno de cuatro valores. La asignación de responsabilidad civil
            (RFC-001 § 4) depende directamente de este campo:
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>governance</th>
                <th style={thStyle}>Significado</th>
                <th style={thStyle}>Responsabilidad</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdMonoStyle}>algorithm-only</td>
                <td style={tdStyle}>Código puro, determinístico, sin LLM.</td>
                <td style={tdStyle}>Operador.</td>
              </tr>
              <tr>
                <td style={tdMonoStyle}>audit-logged</td>
                <td style={tdStyle}>LLM corrió, output clasificado + registrado.</td>
                <td style={tdStyle}>Operador + proveedor del LLM (registrado).</td>
              </tr>
              <tr>
                <td style={tdMonoStyle}>mocked-upstream</td>
                <td style={tdStyle}>API externa no cableada. Es un demo, no es real.</td>
                <td style={tdStyle}>Demo-tier; sin efecto productivo.</td>
              </tr>
              <tr>
                <td style={tdMonoStyle}>requires-confirmation</td>
                <td style={tdStyle}>Acción confirmada explícitamente por un humano.</td>
                <td style={tdStyle}>El humano que confirmó absorbe.</td>
              </tr>
            </tbody>
          </table>
          <p>
            Si una sociedad-IA emite en producción una entrada con{" "}
            <Code inline>governance: &quot;mocked-upstream&quot;</Code>, está
            haciendo una admisión pública de que el efecto secundario{" "}
            <em>no</em> ocurrió contra el sistema real. Un regulador que lee
            el log distingue una operación productiva de un demo solamente
            por este campo.
          </p>
        </Section>

        <Section title="5 · Qué puede pedir un regulador, sin orden judicial">
          <ul style={ulStyle}>
            <li style={liStyle}>
              <strong>Inventario de sesiones</strong> activas durante una
              ventana temporal.
            </li>
            <li style={liStyle}>
              <strong>Exportación completa</strong> de una sesión específica
              en JSON + CSV.
            </li>
            <li style={liStyle}>
              <strong>Prueba de verificación</strong>: el resultado de
              verificar las firmas + una prueba de posesión de clave
              (desafío-respuesta sin revelar la clave).
            </li>
            <li style={liStyle}>
              <strong>Narrativa operativa</strong>: un resumen legible por
              humanos de qué hizo la sociedad-IA durante la ventana,
              generado <em>del log</em>, no del recuerdo del operador.
              Provisto vía{" "}
              <A href="/play/dashboard">/play/dashboard</A> + el CSV.
            </li>
          </ul>
          <p>
            Con orden judicial, el regulador puede compeler adicionalmente
            la cadena de custodia de la clave de firma (quién la tuvo, dónde
            la guardó, cuándo la rotó) — equivalente a compeler la custodia
            del sello de un escribano.
          </p>
        </Section>

        <Section title="6 · La sociedad-IA se identifica en pleno">
          <p>
            Toda sociedad-IA construida con <strong>/arg</strong> publica
            en{" "}
            <Code inline>/.well-known/agents.json</Code> su identificación
            jurisdiccional + sus capacidades. Por ejemplo, para una sociedad
            cuyo operador es CUIT {SAMPLE_CUIT}:
          </p>
          <Code>{`{
  "$schema": "https://ar-agents.vercel.app/schemas/agents.v1.json",
  "version": "1.0",
  "issuer": {
    "jurisdiction": "AR",
    "type": "sociedad-ia",
    "operatorCuit": "${SAMPLE_CUIT}",
    "operatorName": "Nazareno Clemente",
    "supervisionRegime": "rfc-001-v1"
  },
  "endpoints": {
    "auditRead":   "https://ar-agents.vercel.app/api/play/audit/{sessionId}",
    "auditVerify": "https://ar-agents.vercel.app/api/play/audit/{sessionId}?verify=1",
    "auditCsv":    "https://ar-agents.vercel.app/api/play/audit/{sessionId}/csv",
    "auditStream": "https://ar-agents.vercel.app/api/play/audit-stream/{sessionId}"
  },
  "rfcConformance": ["rfc-001-v1", "rfc-002-v1", "rfc-003-draft", "rfc-004-draft"]
}`}</Code>
          <p>
            La convención completa de discovery está en{" "}
            <A href="/rfcs/002">RFC-002</A>. La idea: no hay que adivinar
            dónde están los endpoints de una sociedad-IA. Hay un lugar
            estándar.
          </p>
        </Section>

        <Section title="7 · Si quiere ir más profundo">
          <ul style={ulStyle}>
            <li style={liStyle}>
              <A href="/rfcs/001">RFC-001</A> — Marco de responsabilidad
              civil de tres capas para sociedades-IA.
            </li>
            <li style={liStyle}>
              <A href="/rfcs/004">RFC-004</A> — Especificación normativa
              del log operativo. Es el documento técnico que la legislación
              puede citar.
            </li>
            <li style={liStyle}>
              <A href="/architecture/audit-log">/architecture/audit-log</A>{" "}
              — Desarmado técnico del log (código + razonamiento, 11
              secciones).
            </li>
            <li style={liStyle}>
              <A href="/architecture/security">/architecture/security</A>{" "}
              — Modelo de amenazas, 14 escenarios.
            </li>
            <li style={liStyle}>
              <A href="/walkthrough">/walkthrough</A> — Demo anotado de
              5 pasos: hacer una operación, ver cómo queda en el log,
              intentar manipularla y ver cómo se detecta.
            </li>
            <li style={liStyle}>
              <A href="/data-room">/data-room</A> — Cifras en vivo (npm,
              GitHub, packages, tests). Auto-refresh cada 6 horas.
            </li>
            <li style={liStyle}>
              <A href="/sociedades-ia">/sociedades-ia</A> — Contexto
              político-jurídico del régimen propuesto (28-abr-2026).
            </li>
          </ul>
        </Section>

        <Section title="8 · Si no le convence">
          <p>
            Esta página puede estar equivocada. La implementación puede
            tener bugs. La especificación puede tener huecos. Si encuentra
            alguno, abra un issue público en{" "}
            <A href="https://github.com/ar-agents/ar-agents/issues">
              github.com/ar-agents/ar-agents/issues
            </A>{" "}
            — o escriba directo a{" "}
            <A href="mailto:naza@helloastro.co">naza@helloastro.co</A>.
            Toda la conversación es pública; toda corrección queda
            registrada en el changelog público.
          </p>
          <p style={{ marginTop: 24, color: "var(--text-muted)", fontSize: 13 }}>
            Esta es una página de un proyecto open-source. No es un
            documento oficial de ningún organismo. El régimen de
            sociedades-IA fue anunciado el 28 de abril de 2026 por el
            Ministerio de Desregulación; al momento de esta publicación,
            no hay aún ley aprobada. Esta infraestructura existe para que
            la conversación legislativa tenga un referente técnico
            concreto que mirar.
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
          <span>ar-agents.vercel.app · MIT + CC-BY-4.0</span>
          <span>
            <A href="/">/</A> ·{" "}
            <A href="/manifiesto">/manifiesto</A> ·{" "}
            <A href="/sociedades-ia">/sociedades-ia</A> ·{" "}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  if (external) {
    return (
      <a href={href} style={{ color: "var(--accent)", textDecoration: "underline" }}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} style={{ color: "var(--accent)", textDecoration: "underline" }}>
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
