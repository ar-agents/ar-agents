import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../json-ld";

/**
 * /legislacion, Single Spanish-language synthesis of all 4 RFCs aimed
 * at someone drafting the AR sociedad-IA legislation.
 *
 * Different from /auditor (investigation/forensics) and from
 * /sociedades-ia (political context). This page is regime-design:
 * "here is the technical scaffolding; here is suggested legislative
 * language that incorporates it by reference."
 *
 * The reader is: a staffer at the Ministerio de Desregulación, an asesor
 * técnico at the Cámara de Diputados, or an external counsel drafting
 * the bill. They want to know which RFC anchors which legislative
 * concept and what the suggested cite-by-reference text looks like.
 */

export const metadata: Metadata = {
  title: "/legislación · síntesis técnica para legisladores · ar-agents",
  description:
    "Síntesis de los 4 RFCs publicados (responsabilidad, descubrimiento, reciprocidad, log operativo) con sugerencias de texto legislativo cite-by-reference. Para quien esté redactando la ley de sociedades-IA: aquí está la infraestructura técnica de referencia + cómo incorporarla sin reinventarla.",
  alternates: { canonical: "https://ar-agents.ar/legislacion" },
  openGraph: {
    title: "/legislación · síntesis técnica para legisladores",
    description:
      "Síntesis de los 4 RFCs publicados con sugerencias de texto legislativo cite-by-reference. Para quien esté redactando la ley de sociedades-IA.",
    url: "https://ar-agents.ar/legislacion",
    type: "article",
  },
};

export default function LegislacionPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "Síntesis técnica para la legislación de sociedades-IA argentinas",
          inLanguage: "es-AR",
          url: "https://ar-agents.ar/legislacion",
          datePublished: "2026-05-11",
          author: {
            "@type": "Person",
            name: "Naza",
            email: "naza@naza.ar",
          },
          audience: {
            "@type": "Audience",
            audienceType:
              "Legisladores, asesores técnicos, redactores de proyectos de ley",
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
            /legislación · síntesis · español · 2026-05-11
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
            Cinco RFCs listos para citar en el articulado.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55 }}>
            El régimen de sociedades-IA fue anunciado el 28 de abril de
            2026. Esta página resume cinco documentos técnicos
            (RFC-001 a RFC-005) publicados como infraestructura
            open-source que la legislación puede incorporar{" "}
            <em>cite-by-reference</em> (referenciar la norma técnica en
            lugar de transcribirla, como cuando una ley dice
            &ldquo;según norma IRAM 4001&rdquo; sin copiar la norma) en
            lugar de reescribir cada concepto desde cero. Cada sección
            propone texto sugerido para el articulado.
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
            Tiempo de lectura: 10 minutos · Sin marketing · Texto sugerido
            en cajas destacadas · Toda la infraestructura referenciada es
            de código abierto bajo MIT + CC-BY-4.0
          </p>
        </header>

        {/* Disclaimer legal honesto. Lo primero que pide un asesor
            regulatorio escéptico es esta cláusula. */}
        <div
          style={{
            padding: 14,
            background: "var(--bg-tint)",
            borderLeft: "3px solid var(--text-muted)",
            borderRadius: 4,
            marginBottom: 24,
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--text-muted)",
          }}
          role="note"
        >
          <strong style={{ color: "var(--text-body)" }}>
            Aviso.
          </strong>{" "}
          Este documento es una propuesta técnica de un desarrollador
          independiente (Naza,
          monotributista). <strong>No constituye opinión jurídica
          profesional</strong> y no reemplaza la revisión por especialistas
          matriculados. La adopción legislativa de cualquier porción de
          este material requiere análisis por abogados corporativos y
          asesores técnicos del organismo legislativo correspondiente. Las
          referencias a las especificaciones (RFC-001..005) apuntan a
          documentos versionados en{" "}
          <a
            href="https://github.com/ar-agents/ar-agents"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            github.com/ar-agents/ar-agents
          </a>
          ; cualquier cita normativa debería anclarse a un commit hash o
          DOI inmutable, no a la URL canónica.
        </div>

        {/* TL;DR placed at the top per copy review, legislative staffers
            scan from above. The full "Resumen ejecutivo" stays at the
            bottom (sec 9) for completeness. */}
        <div
          style={{
            padding: 16,
            background: "var(--bg-tint)",
            borderLeft: "3px solid var(--accent)",
            borderRadius: 4,
            margin: "0 0 32px",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
              margin: "0 0 8px",
              fontWeight: 600,
            }}
          >
            TL;DR · resumen en 3 líneas
          </p>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            <li style={{ marginBottom: 6 }}>
              <strong>Línea 1.</strong> Cinco RFCs publicados, abiertos,
              versionados, con tests automatizados que prueban
              conformidad. Listos para citar.
            </li>
            <li style={{ marginBottom: 6 }}>
              <strong>Línea 2.</strong> Cite-by-reference: la ley fija
              v1; los RFCs evolucionan en su propio gobierno público;
              los operadores eligen versión al incorporarse.
            </li>
            <li>
              <strong>Línea 3.</strong> Toda la infraestructura es MIT +
              CC-BY-4.0. Ningún operador pagó por nada para
              implementarla; ningún operador puede ser excluido por
              motivos comerciales.
            </li>
          </ul>
        </div>

        <Section title="1 · El problema en una oración">
          <P>
            Un agente de IA actúa autónomamente. Compra, vende, firma,
            paga impuestos. La pregunta legal es: <strong>¿de quién es la
            responsabilidad civil cuando algo sale mal?</strong> La respuesta
            actual es ambigua y disuade la inversión. El régimen de
            sociedades-IA propone un marco específico; este documento
            sugiere cómo anclar técnicamente cada elemento del marco para
            que la responsabilidad sea operativizable (es decir un juez +
            perito puedan reconstruir qué pasó).
          </P>
        </Section>

        <Section title="2 · Responsabilidad civil, RFC-001">
          <P>
            <strong>Concepto.</strong> Tres capas de responsabilidad civil
            (Layer 1: operador humano · Layer 2: sociedad-IA · Layer 3:
            proveedor de modelo) según la categoría de governance asignada
            a cada acción.
          </P>
          <P>
            <strong>Anclaje técnico.</strong> Cada acción de la sociedad-IA
            se etiqueta con uno de cuatro valores:{" "}
            <Code>algorithm-only</Code>, <Code>audit-logged</Code>,{" "}
            <Code>mocked-upstream</Code>, <Code>requires-confirmation</Code>.
            La etiqueta determina capa: <Code>algorithm-only</Code> ⇒
            operador. <Code>audit-logged</Code> ⇒ operador + proveedor
            registrado. <Code>requires-confirmation</Code> ⇒ humano que
            confirmó. <Code>mocked-upstream</Code> ⇒ es demo, sin efecto.
          </P>
          <LegislativeBox>
            <strong>Texto sugerido</strong> (Art. X):
            <br />
            <em>
              &quot;La responsabilidad civil de las sociedades de IA se
              determinará en función de la categoría operativa asignada a
              cada acción según el estándar técnico publicado en RFC-001
              v1 (
              <A href="https://ar-agents.ar/rfcs/001">
                ar-agents.ar/rfcs/001
              </A>
              ) y su especificación complementaria RFC-004 § 6 (
              <A href="https://ar-agents.ar/rfcs/004">
                ar-agents.ar/rfcs/004
              </A>
              ).&quot;
            </em>
          </LegislativeBox>
          <P>
            <strong>Ventaja del cite-by-reference.</strong> Cuando avance
            el estado del arte (ej. surgen sub-categorías por nuevos
            patrones HITL), la actualización del estándar técnico no
            requiere reabrir la ley; basta con actualizar el RFC. La ley
            congela el cite. El operador opta por la versión vigente al
            momento de incorporación + queda libre de migrar.
          </P>
        </Section>

        <Section title="3 · Descubrimiento, RFC-002">
          <P>
            <strong>Concepto.</strong> Para que un regulador pueda
            inspeccionar a una sociedad-IA sin pedir permiso, debe poder
            encontrar sus endpoints públicos en una ubicación estándar.
          </P>
          <P>
            <strong>Anclaje técnico.</strong> Convención{" "}
            <Code>/.well-known/agents.json</Code> (similar a{" "}
            <Code>/.well-known/security.txt</Code> de RFC 9116). Todo
            agente conformante publica ahí sus capacidades + jurisdicción
            + endpoints de auditoría.
          </P>
          <LegislativeBox>
            <strong>Texto sugerido</strong> (Art. X+1):
            <br />
            <em>
              &quot;Toda sociedad de IA deberá publicar en{" "}
              <Code>/.well-known/agents.json</Code> bajo el dominio
              registrado en su acto constitutivo la información mínima
              especificada por RFC-002 v1 (
              <A href="https://ar-agents.ar/rfcs/002">
                ar-agents.ar/rfcs/002
              </A>
              ): jurisdicción, tipo societario, CUIT del operador,
              endpoints de auditoría, conformidad con RFCs aplicables. La
              omisión o el incumplimiento de este requisito habilitará al
              regulador a iniciar el procedimiento sancionatorio
              previsto en el Art. XX.&quot;
            </em>
          </LegislativeBox>
        </Section>

        <Section title="4 · Reciprocidad cross-jurisdiccional, RFC-003">
          <P>
            <strong>Concepto.</strong> Una sociedad-IA argentina puede
            transaccionar con una entidad-agente de otra jurisdicción
            (Wyoming DAO LLC, Marshall Islands MIDAO, Estonia OÜ). Ambos
            lados llevan su propio log. Sin formato portable, reconciliar
            requiere coordinación contractual ad-hoc.
          </P>
          <P>
            <strong>Anclaje técnico.</strong> Envelope JSON portable{" "}
            <Code>cross-jurisdiction-audit.v1.json</Code>: metadata del
            emisor, sus entradas firmadas, referencias externas a la
            contraparte. Vence en 30 días por defecto (la contraparte
            re-pide antes).
          </P>
          <LegislativeBox>
            <strong>Texto sugerido</strong> (Art. X+2):
            <br />
            <em>
              &quot;Cuando una sociedad de IA argentina opere con una
              entidad-agente extranjera, la documentación recíproca de las
              transacciones deberá ajustarse al envelope normativo RFC-003
              v1 (
              <A href="https://ar-agents.ar/rfcs/003">
                ar-agents.ar/rfcs/003
              </A>
              ). Las firmas criptográficas allí establecidas tendrán
              valor probatorio equivalente al documento privado con
              firma autógrafa para las transacciones que documenten.&quot;
            </em>
          </LegislativeBox>
        </Section>

        <Section title="5 · Log operativo, RFC-004">
          <P>
            <strong>Concepto.</strong> El registro append-only firmado con
            HMAC-SHA256 que toda sociedad-IA debe llevar.{" "}
            <strong>Este es el documento clave para enforcement.</strong>{" "}
            Sin él, un regulador no puede reconstruir qué hizo una
            sociedad-IA.
          </P>
          <P>
            <strong>Anclaje técnico.</strong> RFC-004 fija: forma exacta
            de cada entrada, algoritmo de canonical-JSON, cómo se computa
            la firma HMAC, qué significa append-only en código, qué
            puede exigir un regulador sin orden judicial, retención
            mínima (180 días) y máxima (5 años), vectores de conformidad
            con valores hex deterministas (
            <A href="https://ar-agents.ar/test-vectors">
              /test-vectors
            </A>
            ).
          </P>
          <LegislativeBox>
            <strong>Texto sugerido</strong> (Art. X+3):
            <br />
            <em>
              &quot;Toda sociedad de IA deberá llevar un registro
              operativo conforme a la especificación normativa RFC-004 v1
              (
              <A href="https://ar-agents.ar/rfcs/004">
                ar-agents.ar/rfcs/004
              </A>
              ), firmando cada entrada con HMAC-SHA256 al momento de su
              creación. El registro será conservado por el plazo mínimo
              de 180 días con extensión a 5 años para entradas de
              relevancia fiscal o contractual. Su disponibilidad bajo
              los formatos JSON + CSV especificados en RFC-004 § 5
              constituirá una obligación administrativa cuya omisión
              hará perder al operador la limitación de responsabilidad
              prevista en el Art. X.&quot;
            </em>
          </LegislativeBox>
          <P>
            <strong>Cláusula de prueba.</strong> El log RFC-004 es
            <em> per se </em>medio de prueba admisible en sede
            administrativa + judicial, según el Art. 286 + 287 CPCCN
            (firma electrónica con clave). El cite-by-reference le da
            valor probatorio sin tener que regular criptografía en la
            ley.
          </P>
        </Section>

        <Section title="6 · Auto-incorporación + plantilla">
          <P>
            <strong>Concepto.</strong> El operador humano que quiere
            constituir una sociedad-IA no debería tener que cablear 17
            piezas de software. Debería poder ir a un wizard, llenar 4
            campos (denominación, capital, objeto, representante), y
            obtener una sociedad operativa con todos los endpoints
            requeridos por la ley.
          </P>
          <P>
            <strong>Anclaje técnico.</strong> El paquete{" "}
            <Code>@ar-agents/incorporate</Code> + la plantilla Vercel{" "}
            <Code>sociedad-ia-starter</Code> generan el código + los
            archivos de configuración. Hay un wizard público en{" "}
            <A href="/incorporar">/incorporar</A>.
          </P>
          <LegislativeBox>
            <strong>Texto sugerido</strong> (Art. X+4, transitorio):
            <br />
            <em>
              &quot;A los efectos de facilitar el cumplimiento, se
              recomienda al órgano de aplicación reconocer como prueba
              de conformidad técnica el deploy verificable de una
              sociedad-IA generada por la plantilla pública{" "}
              <Code>sociedad-ia-starter</Code> (
              <A href="https://github.com/ar-agents/ar-agents">
                github.com/ar-agents/ar-agents
              </A>
              ), sin perjuicio del derecho del operador a desarrollar su
              propia infraestructura conforme a los RFCs aplicables.&quot;
            </em>
          </LegislativeBox>
        </Section>

        <Section title="7 · Por qué cite-by-reference y no reescribir">
          <ul style={ulStyle}>
            <li style={liStyle}>
              <strong>Tiempo.</strong> Los RFCs ya existen, están
              publicados, son discutidos públicamente. La ley no necesita
              empezar el debate técnico de cero.
            </li>
            <li style={liStyle}>
              <strong>Versionabilidad.</strong> El estado del arte
              técnico avanza más rápido que la ley. Cite-by-reference deja
              que el RFC se actualice (con un changelog público) sin
              reabrir la legislación. La ley fija el cite a v1, los
              operadores opt-in a v2 cuando estén listos.
            </li>
            <li style={liStyle}>
              <strong>Interoperabilidad.</strong> Wyoming DAO LLC,
              Estonia e-Residency, Marshall Islands MIDAO y Singapore
              VCC ya tienen primitivas análogas (Title 17 §17-31-106,
              eIDAS + X-Road, DAO Act 2022, AI Verify); RFC-003 ya
              prevé la reciprocidad entre todas. Comparativa completa
              en{" "}
              <A href="/jurisdicciones">/jurisdicciones</A>. Los
              regímenes pueden coordinar al nivel técnico sin tratados.
            </li>
            <li style={liStyle}>
              <strong>Auditabilidad pública.</strong> Cualquier ciudadano
              puede abrir{" "}
              <A href="https://github.com/ar-agents/ar-agents">
                github.com/ar-agents/ar-agents
              </A>{" "}
              + leer el código que la ley referenció. La transparencia
              es estructural, no declarativa.
            </li>
          </ul>
        </Section>

        <Section title="8 · Qué no resuelven los RFCs (todavía)">
          <P>
            Honestidad obligatoria. Los RFCs cubren la infraestructura
            técnica + el formato de evidencia. <em>No</em> resuelven:
          </P>
          <ul style={ulStyle}>
            <li style={liStyle}>
              <strong>Aspectos tributarios.</strong> ¿Sociedad-IA paga
              monotributo, IVA, ganancias, ganancia mínima presunta?
              Cada uno requiere su propia decisión política.
            </li>
            <li style={liStyle}>
              <strong>Aspectos laborales.</strong> ¿Una sociedad-IA puede
              ser empleadora? ¿Es responsable solidaria por los humanos
              que ejecutan instrucciones suyas?
            </li>
            <li style={liStyle}>
              <strong>Régimen de quiebra.</strong> Cómo se liquida una
              sociedad-IA. Qué pasa con las claves criptográficas en el
              concurso.
            </li>
            <li style={liStyle}>
              <strong>Penal.</strong> Mens rea de una entidad sin
              consciencia. Imputabilidad del operador por dolo o culpa
              del agente.
            </li>
          </ul>
          <P>
            Los RFCs son piezas de infraestructura, no doctrina jurídica.
            Necesitan complementarse con derecho positivo argentino.
          </P>
        </Section>

        <Section title="9 · Resumen ejecutivo · 3 líneas">
          <ul style={ulStyle}>
            <li style={liStyle}>
              <strong>Línea 1.</strong> Cuatro RFCs publicados, abiertos,
              versionados, con tests automatizados que prueban
              conformidad. Listos para citar.
            </li>
            <li style={liStyle}>
              <strong>Línea 2.</strong> Cite-by-reference: la ley fija
              v1; los RFCs evolucionan en su propio gobierno público; los
              operadores eligen versión al incorporarse.
            </li>
            <li style={liStyle}>
              <strong>Línea 3.</strong> Toda la infraestructura es MIT +
              CC-BY-4.0. Ningún operador pagó por nada para
              implementarla; ningún operador puede ser excluido por
              motivos comerciales.
            </li>
          </ul>
        </Section>

        <Section title="10 · Contacto">
          <P>
            Soy <strong>Naza</strong>, autor de los RFCs y
            mantenedor de la infraestructura. Domicilio en Monte
            Grande, BA. Disponible para reuniones
            técnicas con asesores legislativos, ministerios, o cualquier
            organismo interesado. Sin honorarios para este tipo de
            consultas, el trabajo está hecho, el código es público, la
            conversación es pública.
          </P>
          <P>
            <A href="mailto:naza@naza.ar">naza@naza.ar</A> ·{" "}
            <A href="https://github.com/ar-agents/ar-agents/discussions">
              github.com/ar-agents/ar-agents/discussions
            </A>
          </P>
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
            <Link href="/" style={linkStyle}>/</Link>{" · "}
            <Link href="/manifiesto" style={linkStyle}>/manifiesto</Link>{" · "}
            <Link href="/sociedades-ia" style={linkStyle}>/sociedades-ia</Link>{" · "}
            <Link href="/auditor" style={linkStyle}>/auditor</Link>{" · "}
            <Link href="/rfcs/001" style={linkStyle}>RFC-001</Link>{" · "}
            <Link href="/rfcs/002" style={linkStyle}>RFC-002</Link>{" · "}
            <Link href="/rfcs/003" style={linkStyle}>RFC-003</Link>{" · "}
            <Link href="/rfcs/004" style={linkStyle}>RFC-004</Link>
          </span>
        </footer>
      </main>
    </>
  );
}

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

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ marginBottom: 12, lineHeight: 1.6 }}>{children}</p>;
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith("http") || href.startsWith("mailto:");
  if (external) {
    return (
      <a href={href} style={linkStyle}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} style={linkStyle}>
      {children}
    </Link>
  );
}

function Code({ children }: { children: React.ReactNode }) {
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

function LegislativeBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--bg-tint)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: 4,
        boxShadow: "var(--card-shadow)",
        margin: "16px 0",
        fontSize: 14,
        lineHeight: 1.65,
      }}
    >
      {children}
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const ulStyle: React.CSSProperties = {
  paddingLeft: 24,
  marginBottom: 12,
};

const liStyle: React.CSSProperties = {
  marginBottom: 6,
  lineHeight: 1.55,
};
