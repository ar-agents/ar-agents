import Link from "next/link";
import { DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { JsonLd } from "../json-ld";

/**
 * Shared bilingual content for /gobierno (ES) and /en/government (EN).
 * Operational briefing for ministry advisors. The page an asesor can
 * forward inside the ministry to brief upward: structured, scan-friendly.
 */

type Lang = "es" | "en";

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const ulSty: React.CSSProperties = {
  paddingLeft: 24,
  marginBottom: 16,
};

const liSty: React.CSSProperties = {
  marginBottom: 10,
  lineHeight: 1.55,
};

/** Tiny helper: pick by lang. JSX-safe. */
function L({ es, en, lang }: { es: React.ReactNode; en: React.ReactNode; lang: Lang }) {
  return <>{lang === "es" ? es : en}</>;
}

export function GobiernoContent({ lang }: { lang: Lang }) {
  const legPath = lang === "es" ? "/legislacion" : "/en/legislation";
  const audPath = lang === "es" ? "/auditor" : "/en/auditor";
  const manPath = lang === "es" ? "/manifiesto" : "/en/manifesto";
  const minPath = lang === "es" ? "/al-ministro" : "/en/to-the-minister";
  const implPath = lang === "es" ? "/implementacion" : "/en/implementation";
  const jurPath = lang === "es" ? "/jurisdicciones" : "/en/jurisdictions";
  const cofPath = lang === "es" ? "/co-firmar" : "/en/co-sign";
  const cloudPath = lang === "es" ? "/cloud" : "/en/cloud";
  const regPath = lang === "es" ? "/registro" : "/en/registry";

  return (
    <DocShell
      eyebrow={
        lang === "es"
          ? "briefing operativo · para el estado argentino · 2026-05"
          : "operational briefing · for the argentine state · 2026-05"
      }
      title={
        lang === "es"
          ? "Briefing operativo para el Estado argentino."
          : "Operational briefing for the Argentine state."
      }
      subtitle={
        lang === "es"
          ? "Para el asesor que recibe este link de Sturzenegger, Reidel, Subsec TIC, AAIP, o cualquier organismo del régimen de sociedades-IA. Pensado para leer en una pasada de 10 minutos y reenviar internamente con confianza."
          : "For the advisor who receives this link from Sturzenegger, Reidel, Subsec TIC, AAIP, or any agency in the sociedades-IA regime. Built to read in one 10-minute pass and forward internally with confidence."
      }
    >
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline:
            lang === "es"
              ? "ar-agents, briefing operativo para el Estado argentino"
              : "ar-agents, operational briefing for the Argentine state",
          inLanguage: lang === "es" ? "es-AR" : "en-US",
          url:
            lang === "es"
              ? "https://ar-agents.ar/gobierno"
              : "https://ar-agents.ar/en/government",
          datePublished: "2026-05-13",
        }}
      />

      <div
        style={{
          padding: "14px 16px",
          background: "var(--bg-tint)",
          borderLeft: "3px solid var(--accent)",
          borderRadius: 4,
          margin: "16px 0 28px",
          fontSize: 14,
          lineHeight: 1.55,
        }}
      >
        <strong>
          <L
            lang={lang}
            es="Resumen ejecutivo · 3 líneas"
            en="Executive summary · 3 lines"
          />
        </strong>
        <ol style={{ marginTop: 6, paddingLeft: 22, marginBottom: 0 }}>
          <li>
            <L
              lang={lang}
              es="Soy un desarrollador independiente argentino. Construí la implementación técnica de referencia del régimen de sociedades-IA que anunció el Ministro el 28-abr: 33 paquetes npm + 6 specs técnicas CC-BY-4.0 + audit log criptográfico peritable."
              en="I'm an independent Argentine developer. I built the technical reference implementation for the sociedades-IA regime the Minister announced on April 28: 33 npm packages + 6 technical specs (CC-BY-4.0) + a forensic cryptographic audit log."
            />
          </li>
          <li>
            <L
              lang={lang}
              es="No vendo nada al Estado hoy. El código es MIT y va a seguir siendo MIT. Vine con propuestas concretas, no con pedidos: ver sección 6."
              en="I'm not selling anything to the state today. The code is MIT and will stay MIT. I'm bringing concrete proposals, not requests: see section 6."
            />
          </li>
          <li>
            <L
              lang={lang}
              es={
                <>
                  Estoy disponible para reuniones técnicas de 30 minutos sin
                  honorarios. Si después el ministerio considera útil
                  algún acuerdo de soporte o servicios, hay un tier
                  comercial, separado por diseño del código abierto, en{" "}
                  <Link href={cloudPath} style={linkSty}>
                    /cloud
                  </Link>
                  .
                </>
              }
              en={
                <>
                  I'm available for 30-minute technical meetings, no
                  fees. If the ministry later finds a support or
                  services agreement useful, there's a commercial tier,
                  separate by design from the open source, at{" "}
                  <Link href={cloudPath} style={linkSty}>
                    /cloud
                  </Link>
                  .
                </>
              }
            />
          </li>
        </ol>
      </div>

      <DocH2>
        <L lang={lang} es="1 · Quién soy" en="1 · Who I am" />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>Nazareno Clemente</strong>, 26 años, monotributista
              categoría A (servicios informáticos),
              domicilio en Monte Grande, Buenos Aires. Sin formación
              jurídica formal. Sin financiamiento estatal ni privado, sin
              contratos con servicios de inteligencia ni seguridad.
              Trabajo documentado en{" "}
              <a href="https://github.com/naza00000" style={linkSty}>
                github.com/naza00000
              </a>
              . Antes construí Astro (astro.ar) y Publi (publi.ar), dos
              productos AI consumer en Argentina; este proyecto es
              infraestructura, no producto consumer.
            </>
          }
          en={
            <>
              <strong>Nazareno Clemente</strong>, 26, monotributista
              category A (IT services), based in
              Monte Grande, Buenos Aires. No formal legal training. No
              state or private funding, no contracts with intelligence or
              security services. Documented work at{" "}
              <a href="https://github.com/naza00000" style={linkSty}>
                github.com/naza00000
              </a>
              . Previously built Astro (astro.ar) and Publi (publi.ar),
              two AI consumer products in Argentina; this project is
              infrastructure, not a consumer product.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L lang={lang} es="2 · Qué construí, técnicamente" en="2 · What I built, technically" />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>33 paquetes npm</strong> bajo{" "}
                <DocCode>@ar-agents/*</DocCode> con licencia MIT. Cubren
                16 de las 17 piezas operativas que una sociedad-IA
                argentina necesita para operar end-to-end (identidad /
                firma / dinero / operación al cliente / monitoreo del BO
                / registro corporativo). La pieza que falta (alta de
                aplicación cliente en TAD/GDE) requiere autorización
                gubernamental y no tiene proceso público.
              </>
            }
            en={
              <>
                <strong>33 npm packages</strong> under{" "}
                <DocCode>@ar-agents/*</DocCode> with MIT license. They
                cover 16 of the 17 operational pieces an Argentine
                AI corporation needs to operate end-to-end (identity /
                signing / money / customer ops / Official Gazette
                monitoring / corporate registry). The missing piece
                (registering a client app on TAD/GDE) requires
                government authorization with no public process.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>6 RFCs</strong> publicados bajo CC-BY-4.0,
                propuestas técnico-normativas que la legislación puede
                incorporar <em>cite-by-reference</em>. Texto sugerido
                para articulado en{" "}
                <Link href={legPath} style={linkSty}>
                  /legislación
                </Link>
                .
              </>
            }
            en={
              <>
                <strong>6 RFCs</strong> published under CC-BY-4.0,
                technical-normative proposals that legislation can
                incorporate <em>cite-by-reference</em>. Suggested text
                for the articulado at{" "}
                <Link href={legPath} style={linkSty}>
                  /legislation
                </Link>
                .
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Audit log forense</strong> firmado dual con
                HMAC-SHA256 + Ed25519. Cualquier organismo (regulador,
                perito judicial, AAIP) puede verificar sin pedir la
                clave privada al operador. Detalle técnico en{" "}
                <Link href={audPath} style={linkSty}>
                  /auditor
                </Link>{" "}
                (1 página imprimible) +{" "}
                <Link href="/architecture/audit-log" style={linkSty}>
                  /architecture/audit-log
                </Link>{" "}
                (code-level deep-dive).
              </>
            }
            en={
              <>
                <strong>Forensic audit log</strong> dual-signed with
                HMAC-SHA256 + Ed25519. Any agency (regulator, court
                expert, AAIP) can verify without asking the operator
                for the private key. Technical details at{" "}
                <Link href={audPath} style={linkSty}>
                  /auditor
                </Link>{" "}
                (printable 1-pager) +{" "}
                <Link href="/architecture/audit-log" style={linkSty}>
                  /architecture/audit-log
                </Link>{" "}
                (code-level deep-dive).
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Generador de citaciones inmutables</strong> (
                <Link href="/cite" style={linkSty}>
                  /cite
                </Link>
                ): BibTeX, APA y Chicago anclados a commit hash de
                GitHub. Permite que el articulado de la ley cite versión
                exacta de un RFC sin depender de la URL canónica
                mutable. DOI inmutable en Zenodo agregado al roadmap.
              </>
            }
            en={
              <>
                <strong>Immutable citation generator</strong> (
                <Link href="/cite" style={linkSty}>
                  /cite
                </Link>
                ): BibTeX, APA and Chicago anchored to a GitHub commit
                hash. Lets the law's articulado cite a specific RFC
                version without relying on the mutable canonical URL.
                Zenodo immutable DOI is on the roadmap.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Comparativa internacional</strong> (
                <Link href={jurPath} style={linkSty}>
                  /jurisdicciones
                </Link>
                ), análisis lado-a-lado con Wyoming DAO LLC, Marshall
                Islands MIDAO, Estonia e-Residency, Singapore VCC + AI
                Verify y EU AI Act Art. 50.
              </>
            }
            en={
              <>
                <strong>International comparison</strong> (
                <Link href={jurPath} style={linkSty}>
                  /jurisdictions
                </Link>
                ), side-by-side analysis with Wyoming DAO LLC, Marshall
                Islands MIDAO, Estonia e-Residency, Singapore VCC + AI
                Verify, and EU AI Act Art. 50.
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="3 · Lo que esto le ahorra al Ministerio"
          en="3 · What this saves the Ministry"
        />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Trabajo técnico previo:</strong> los 6 RFCs
                cubren las decisiones operacionales que cualquier diseño
                regulatorio tendría que tomar igual. Estimación honesta:
                4-6 meses de definición técnica + revisión de pares, ya
                hechos y abiertos a comentario en GitHub Discussions.
              </>
            }
            en={
              <>
                <strong>Prior technical work:</strong> the 6 RFCs cover
                the operational decisions any regulatory design would
                have to make anyway. Honest estimate: 4-6 months of
                technical definition + peer review, already done and open
                to comment on GitHub Discussions.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Referente citable open-source:</strong> el
                articulado puede incorporar <em>cite-by-reference</em>{" "}
                en lugar de transcribir especificaciones técnicas dentro
                de la ley. Si la spec evoluciona, no requiere reabrir el
                debate legislativo, la ley fija el cite a una versión
                específica (commit hash o DOI Zenodo).
              </>
            }
            en={
              <>
                <strong>Citable open-source reference:</strong> the
                articulado can use <em>cite-by-reference</em> instead of
                transcribing technical specs into the law. If the spec
                evolves, it doesn't require reopening the legislative
                debate, the law pins the cite to a specific version
                (commit hash or Zenodo DOI).
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>
                  Implementación de referencia que cualquier sociedad
                  puede usar el día 1 de la ley:
                </strong>{" "}
                sin costo de licencia, sin dependencia de proveedor
                único, sin lock-in. Esto baja la fricción de adopción
                del régimen.
              </>
            }
            en={
              <>
                <strong>
                  Reference implementation any AI corp can use on day 1
                  of the law:
                </strong>{" "}
                no license fee, no single-vendor dependency, no lock-in.
                Lowers adoption friction.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Comparativa internacional cuantitativa</strong>{" "}
                para fundamentar posicionamiento competitivo. Si el
                ministerio necesita defender públicamente &ldquo;Argentina
                vs Wyoming vs Estonia vs Marshall Islands&rdquo;, los
                datos ya están sistematizados.
              </>
            }
            en={
              <>
                <strong>Quantitative international comparison</strong>{" "}
                to ground competitive positioning. If the ministry
                needs to publicly defend &ldquo;Argentina vs Wyoming vs
                Estonia vs Marshall Islands&rdquo;, the data is already
                organized.
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="4 · Lo que esto NO es"
          en="4 · What this is NOT"
        />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>
                  No es un proyecto comercial vendiéndose al Estado.
                </strong>{" "}
                El código es MIT, el sitio es gratis, el demo es público,
                los RFCs son CC-BY-4.0. Cualquier consultora (Globant,
                Accenture, BGH) puede implementarlo para un cliente sin
                pedirme permiso. Si en el futuro hay servicios pagos
                (hosting managed, soporte SLA, custodia de claves), están
                separados en{" "}
                <Link href={cloudPath} style={linkSty}>
                  /cloud
                </Link>
                {" "}, pero la infra de base se queda libre por diseño.
              </>
            }
            en={
              <>
                <strong>
                  This is not a commercial project selling to the state.
                </strong>{" "}
                The code is MIT, the site is free, the demo is public,
                the RFCs are CC-BY-4.0. Any consultancy (Globant,
                Accenture, BGH) can implement it for a client without
                asking me. If in the future there are paid services
                (managed hosting, SLA support, key custody), they live
                separately at{" "}
                <Link href={cloudPath} style={linkSty}>
                  /cloud
                </Link>
                {" "}, but the base infrastructure stays free by design.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>No es opinión jurídica profesional.</strong> No
                soy abogado matriculado. Los RFCs son drafts técnicos y
                necesitan revisión por especialistas (derecho corporativo,
                AAIP, derecho de la prueba) antes de cualquier adopción
                legislativa. Por eso publiqué{" "}
                <Link href={cofPath} style={linkSty}>
                  /co-firmar
                </Link>:{" "}
              invitación abierta a académicos y juristas argentinos
                para sumar co-autoría sin compromiso comercial.
              </>
            }
            en={
              <>
                <strong>This is not professional legal opinion.</strong>{" "}
                I'm not a licensed lawyer. The RFCs are technical drafts
                that need review by specialists (corporate law, AAIP,
                evidentiary law) before any legislative adoption. That's
                why I published{" "}
                <Link href={cofPath} style={linkSty}>
                  /co-sign
                </Link>:{" "}
              open invitation for Argentine scholars and jurists to
                add co-authorship without commercial commitment.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>
                  No es una propuesta SIDE / inteligencia / seguridad
                  estatal.
                </strong>{" "}
                El{" "}
                <Link href={manPath} style={linkSty}>
                  manifiesto
                </Link>{" "}
                es explícito: civil-comercial-OSS, no participo de
                contratos con servicios de inteligencia ni seguridad.
                Si el Estado necesita Palantir-grade tooling, hay otros
                lugares; este proyecto se queda en la capa civil.
              </>
            }
            en={
              <>
                <strong>
                  This is not an intelligence / state security proposal.
                </strong>{" "}
                The{" "}
                <Link href={manPath} style={linkSty}>
                  manifesto
                </Link>{" "}
                is explicit: civil-commercial-OSS, I don't participate
                in intelligence or security service contracts. If the
                state needs Palantir-grade tooling, there are other
                places; this project stays in the civil layer.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>No es token / DAO / cripto.</strong> No hay
                token de governance, no hay yield farming, no hay
                tesorería on-chain. La diferenciación con $SAIRI /
                WAGMI.law está explícita en{" "}
                <Link href={jurPath} style={linkSty}>
                  /jurisdicciones
                </Link>
                .
              </>
            }
            en={
              <>
                <strong>This is not a token / DAO / crypto play.</strong>{" "}
                No governance token, no yield farming, no on-chain
                treasury. The differentiation from $SAIRI / WAGMI.law is
                explicit at{" "}
                <Link href={jurPath} style={linkSty}>
                  /jurisdictions
                </Link>
                .
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="5 · Limitaciones honestas (que un asesor escéptico encontraría primero)"
          en="5 · Honest limitations (what a skeptical advisor would find first)"
        />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Único maintainer.</strong> Si yo me caigo, el
                proyecto se ralentiza. Mitigaciones: código MIT en
                GitHub público con historial completo; npm provenance
                attestations; archivo de RFCs en Zenodo (CERN) en el
                roadmap, para preservación 20+ años. Cualquier consultora
                puede tomar el código y darle continuidad mañana.
              </>
            }
            en={
              <>
                <strong>Single maintainer.</strong> If I'm out, the
                project slows. Mitigations: MIT code on public GitHub
                with full history; npm provenance attestations; Zenodo
                (CERN) RFC archival on the roadmap for 20+ year
                preservation. Any consultancy can take the code and give
                it continuity tomorrow.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>
                  Infraestructura corre en proveedores extranjeros
                </strong>{" "}
                (Vercel US, Upstash sa-east-1, npm US, GitHub US). Para
                uso civil no es bloqueante, pero para producción
                regulada por Ley 25.326 (AAIP) requiere o DPA con cada
                proveedor o migración a residencia argentina.{" "}
                <Link href={cloudPath} style={linkSty}>
                  /cloud
                </Link>{" "}
                contempla &ldquo;Government tier&rdquo; con residencia
                AR + HSM auditable como path planeado, no como solución
                hoy.
              </>
            }
            en={
              <>
                <strong>
                  Infrastructure runs on foreign providers
                </strong>{" "}
                (Vercel US, Upstash sa-east-1, npm US, GitHub US). For
                civil use it's not blocking, but for production
                regulated by Argentine LPDP (25.326) it requires either
                a DPA with each provider or migration to AR residency.{" "}
                <Link href={cloudPath} style={linkSty}>
                  /cloud
                </Link>{" "}
                contemplates a &ldquo;Government tier&rdquo; with AR
                residency + auditable HSM as a planned path, not a
                solution today.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>
                  Registro tiene 5 entradas, todas mías.
                </strong>{" "}
                El{" "}
                <Link href={regPath} style={linkSty}>
                  /registro
                </Link>{" "}
                lo dice: muestra la implementación de referencia + 4
                demos del autor, no un ecosistema. La ley todavía no
                existe; los operadores reales aparecen cuando aparezca el
                régimen.
              </>
            }
            en={
              <>
                <strong>
                  The registry has 5 entries, all mine.
                </strong>{" "}
                The{" "}
                <Link href={regPath} style={linkSty}>
                  /registry
                </Link>{" "}
                says so: it shows the reference implementation + 4 demos
                by the author, not an ecosystem. The law doesn't exist
                yet; real operators appear when the regime appears.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>RFCs en estado draft.</strong> Las specs están
                en <DocCode>draft-01</DocCode>. La etapa siguiente
                requiere revisión por co-firmantes externos (jurista +
                académico) y archivo inmutable en Zenodo. Citarlas en
                articulado <em>final</em> de una ley antes de que pasen
                a estado <DocCode>stable</DocCode> no se recomienda;
                para discusión legislativa preparatoria, sí.
              </>
            }
            en={
              <>
                <strong>RFCs are in draft status.</strong> The specs are
                in <DocCode>draft-01</DocCode>. Next stage requires
                review by external co-signers (jurist + scholar) and
                immutable archival on Zenodo. Citing them in the{" "}
                <em>final</em> articulado of a law before they reach{" "}
                <DocCode>stable</DocCode> status is not recommended; for
                preparatory legislative discussion, it is.
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="6 · Lo que estoy proponiendo (no pidiendo)"
          en="6 · What I'm proposing (not asking for)"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es="En orden de menor a mayor compromiso institucional:"
          en="In order from least to most institutional commitment:"
        />
      </DocP>
      <ol style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>
                  Conciencia técnica del equipo del Ministro
                </strong>{" "}
                de que la implementación de referencia existe, antes de
                que el articulado se redacte. Evita supuestos técnicos
                contradictorios con el stack que ya funciona. Cero
                compromiso.
              </>
            }
            en={
              <>
                <strong>
                  Awareness on the Minister's team
                </strong>{" "}
                that the reference implementation exists, before the
                articulado is drafted. Avoids technical assumptions that
                contradict the stack that already works. Zero commitment.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Reunión técnica de 30 minutos</strong> con quien
                el ministerio designe (Subsec TIC, asesor del Ministro,
                equipo Sandbox de Desregulación). Sin honorarios, sin
                agenda comercial. Demo en vivo, código abierto,
                preguntas duras bienvenidas.
              </>
            }
            en={
              <>
                <strong>30-minute technical meeting</strong> with
                whomever the ministry designates (Subsec TIC, Minister's
                advisor, Deregulation Sandbox team). No fees, no
                commercial agenda. Live demo, open code, hard questions
                welcome.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>
                  Apertura de TAD/GDE para alta de aplicación cliente
                  programática.
                </strong>{" "}
                Es la única pieza técnica que depende del Estado y que
                no puedo resolver yo solo. Si el ministerio incluye
                esto en el alcance de la reforma, el ciclo de
                incorporación programática de sociedades-IA se cierra.
              </>
            }
            en={
              <>
                <strong>
                  Open TAD/GDE for programmatic client-app registration.
                </strong>{" "}
                This is the only technical piece that depends on the
                state and that I can't solve alone. If the ministry
                includes this in the reform scope, the programmatic
                AI-corp incorporation cycle closes.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>
                  Eventual referencia en el articulado a las specs
                  existentes.
                </strong>{" "}
                Si después de revisión por especialistas (paso 7) algún
                RFC se considera incorporable, el ministerio puede
                citarlo con commit hash inmutable o DOI Zenodo. Sin
                compromiso de exclusividad, la cita es a un documento
                público CC-BY-4.0.
              </>
            }
            en={
              <>
                <strong>
                  Eventual reference in the articulado to existing specs.
                </strong>{" "}
                If after review by specialists (step 7) some RFC is
                considered incorporable, the ministry can cite it via
                immutable commit hash or Zenodo DOI. No exclusivity
                commitment, the cite points to a public CC-BY-4.0
                document.
              </>
            }
          />
        </li>
      </ol>

      <DocH2>
        <L
          lang={lang}
          es="7 · Por qué necesito que circule esto antes que la redacción de la ley"
          en="7 · Why I need this to circulate before the bill is drafted"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es="Una ley redactada sin input técnico tiende a fijar definiciones que después complican la implementación: estándares criptográficos obsoletos, asunciones sobre identidad digital que chocan con OIDC/PKCE, requisitos de retención que ignoran cómo funciona realmente un audit log append-only. Los 6 RFCs cubren esas decisiones desde el lado del código. Si llegamos antes que el draft del articulado, evitamos errores costosos de revertir después; si llegamos después, los errores se cristalizan."
          en="A bill drafted without technical input tends to fix definitions that later complicate implementation: obsolete cryptographic standards, digital-identity assumptions that clash with OIDC/PKCE, retention requirements that ignore how an append-only audit log actually works. The 6 RFCs cover those decisions from the code side. If we get there before the articulado draft, we avoid costly reversals; if we arrive after, the errors crystallize."
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es="Esto no es lobby. Es un dev solo escribiéndole al asesor que recibió este link, diciendo: hay material útil acá, está abierto, no cuesta nada usarlo o ignorarlo, conviene mirar antes de decidir."
          en="This isn't lobbying. It's one developer writing to the advisor who received this link, saying: there's useful material here, it's open, it costs nothing to use or ignore, it's worth a look before deciding."
        />
      </DocP>

      <DocH2>
        <L lang={lang} es="8 · Contacto" en="8 · Contact" />
      </DocH2>
      <DocP>
        <strong>Nazareno Clemente</strong>
        <br />
        Email:{" "}
        <a href="mailto:naza@naza.ar" style={linkSty}>
          naza@naza.ar
        </a>:{" "}
       
        <L
          lang={lang}
          es="respuesta en <48hs."
          en="reply within 48h."
        />
        <br />
        Monte Grande, Buenos Aires.
        <br />
        GitHub:{" "}
        <a href="https://github.com/naza00000" style={linkSty}>
          @naza00000
        </a>{" "}
        · Twitter:{" "}
        <a href="https://twitter.com/nazaclemente" style={linkSty}>
          @nazaclemente
        </a>
        .
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>Para asistentes / secretarías:</strong> agendar 30
              minutos por videollamada (Google Meet preferido, también
              Zoom o Teams). Sin necesidad de NDA, todo el material es
              público bajo MIT + CC-BY-4.0.
            </>
          }
          en={
            <>
              <strong>For assistants / secretariats:</strong> schedule
              30 minutes by video call (Google Meet preferred, Zoom and
              Teams also fine). No NDA needed, all material is public
              under MIT + CC-BY-4.0.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="9 · Material de respaldo"
          en="9 · Supporting material"
        />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <Link href={implPath} style={linkSty}>
            {lang === "es" ? "/implementacion" : "/en/implementation"}
          </Link>:{" "}

          <L
            lang={lang}
            es="documento canónico de referencia para el equipo redactor, PDF firmado Ed25519, verificable offline."
            en="canonical reference document for the bill drafting team, Ed25519-signed PDF, verifiable offline."
          />
        </li>
        <li style={liSty}>
          <Link href={minPath} style={linkSty}>
            {lang === "es" ? "/al-ministro" : "/to-the-minister"}
          </Link>:{" "}

          <L
            lang={lang}
            es="carta abierta personal, CC0, 9-may-2026."
            en="personal open letter, CC0, 2026-05-09."
          />
        </li>
        <li style={liSty}>
          <Link href={legPath} style={linkSty}>
            {lang === "es" ? "/legislación" : "/legislation"}
          </Link>:{" "}
         
          <L
            lang={lang}
            es="síntesis técnica con texto sugerido cite-by-reference."
            en="technical synthesis with suggested cite-by-reference text."
          />
        </li>
        <li style={liSty}>
          <Link href={audPath} style={linkSty}>
            /auditor
          </Link>:{" "}
         
          <L
            lang={lang}
            es="1-pager imprimible para reguladores."
            en="printable 1-pager for regulators."
          />
        </li>
        <li style={liSty}>
          <Link href={jurPath} style={linkSty}>
            {lang === "es" ? "/jurisdicciones" : "/jurisdictions"}
          </Link>:{" "}
         
          <L
            lang={lang}
            es="comparativa con Wyoming / Marshall / Estonia / Singapur / Suiza / Liechtenstein."
            en="comparison with Wyoming / Marshall / Estonia / Singapore / Switzerland / Liechtenstein."
          />
        </li>
        <li style={liSty}>
          <Link href="/rfcs/001" style={linkSty}>
            /rfcs/001
          </Link>{" "}
          a{" "}
          <Link href="/rfcs/006" style={linkSty}>
            /rfcs/006
          </Link>:{" "}

          <L
            lang={lang}
            es="las 6 specs técnicas."
            en="the 6 technical specs."
          />
        </li>
        <li style={liSty}>
          <Link href="/play" style={linkSty}>
            /play
          </Link>:{" "}
         
          <L
            lang={lang}
            es="demo interactivo, 30 segundos, sin setup."
            en="interactive demo, 30 seconds, no setup."
          />
        </li>
        <li style={liSty}>
          <Link href={regPath} style={linkSty}>
            {lang === "es" ? "/registro" : "/registry"}
          </Link>:{" "}
         
          <L
            lang={lang}
            es="registro público con disclosure honesto."
            en="public registry with honest disclosure."
          />
        </li>
        <li style={liSty}>
          <Link href="/security" style={linkSty}>
            /security
          </Link>:{" "}
         
          <L
            lang={lang}
            es="threat model STRIDE + OWASP LLM Top 10."
            en="STRIDE + OWASP LLM Top 10 threat model."
          />
        </li>
        <li style={liSty}>
          <Link href={cloudPath} style={linkSty}>
            /cloud
          </Link>:{" "}
         
          <L
            lang={lang}
            es="tier comercial (separado del código abierto)."
            en="commercial tier (separate from the open source)."
          />
        </li>
      </ul>
    </DocShell>
  );
}
