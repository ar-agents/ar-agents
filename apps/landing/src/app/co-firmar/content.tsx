import Link from "next/link";
import { DocH2, DocP, DocShell } from "../doc-shell";

type Lang = "es" | "en";

function L({ es, en, lang }: { es: React.ReactNode; en: React.ReactNode; lang: Lang }) {
  return <>{lang === "es" ? es : en}</>;
}

interface Rfc {
  id: string;
  title: { es: string; en: string };
  needs: { es: string; en: string };
  profile: { es: string; en: string };
}

const RFCS: ReadonlyArray<Rfc> = [
  {
    id: "001",
    title: {
      es: "Identidad y firma de agentes en Argentina",
      en: "Identity and signing of agents in Argentina",
    },
    needs: {
      es: "Revisión jurídica del marco de responsabilidad civil tripartito (operador / sociedad-IA / proveedor de modelo). Análisis comparado con derecho societario y de daños argentino.",
      en: "Legal review of the three-layer civil-liability framework (operator / AI corporation / model provider). Comparative analysis with Argentine corporate and tort law.",
    },
    profile: {
      es: "Abogado/a corporativo matriculado · especialista en derecho de daños o societario · académico UBA/UTDT/UCEMA/UCA Derecho.",
      en: "Licensed corporate attorney · tort or corporate law specialist · UBA/UTDT/UCEMA/UCA Law scholar.",
    },
  },
  {
    id: "002",
    title: {
      es: "Descubrimiento de agentes por defecto",
      en: "Agent discovery by default",
    },
    needs: {
      es: "Compatibilidad con esquemas de identidad digital AR (Mi Argentina OIDC, Clave Fiscal) y revisión de privacidad bajo Ley 25.326.",
      en: "Compatibility with AR digital-identity schemes (Mi Argentina OIDC, Clave Fiscal) and privacy review under Law 25.326.",
    },
    profile: {
      es: "Especialista AAIP · académico en derecho digital · técnico de ARCA/ONTI con interés académico.",
      en: "AAIP specialist · digital-law scholar · ARCA/ONTI technical staff with academic interest.",
    },
  },
  {
    id: "003",
    title: {
      es: "Reciprocidad cross-jurisdiccional",
      en: "Cross-jurisdictional reciprocity",
    },
    needs: {
      es: "Análisis de derecho internacional privado argentino para reconocimiento de entidades algorítmicas extranjeras (DAO LLC, MIDAO, OÜ).",
      en: "Analysis of Argentine private international law for recognition of foreign algorithmic entities (DAO LLC, MIDAO, OÜ).",
    },
    profile: {
      es: "Académico de derecho internacional privado · especialista en arbitraje internacional · profesor de Maestría en Derecho de los Negocios Internacionales.",
      en: "Private international law scholar · international arbitration specialist · International Business Law professor.",
    },
  },
  {
    id: "004",
    title: {
      es: "Especificación normativa del log operativo",
      en: "Normative specification of the operational log",
    },
    needs: {
      es: "Revisión del valor probatorio (Art. 286+287 CPCCN) + retención (180 días - 5 años) + interfaz con AAIP. Es el documento clave para enforcement.",
      en: "Review of probative value (Art. 286+287 CPCCN) + retention (180 days - 5 years) + AAIP interface. The key document for enforcement.",
    },
    profile: {
      es: "Especialista en derecho procesal (medios de prueba electrónicos) · auditor forense · académico de derecho de la prueba.",
      en: "Procedural-law specialist (electronic evidence) · forensic auditor · evidence-law scholar.",
    },
  },
  {
    id: "005",
    title: {
      es: "Migración asimétrica Ed25519",
      en: "Asymmetric Ed25519 migration",
    },
    needs: {
      es: "Compatibilidad con Firma Digital Ley 25.506 y certificados de ARCA/ONTI. Análisis de interoperabilidad ASiC-E.",
      en: "Compatibility with Digital Signature Law 25.506 and ARCA/ONTI certificates. ASiC-E interoperability analysis.",
    },
    profile: {
      es: "Académico/a de criptografía aplicada · especialista en Firma Digital Ley 25.506 · técnico con publicaciones sobre PKI argentina.",
      en: "Applied cryptography scholar · Digital Signature Law 25.506 specialist · technician with publications on Argentine PKI.",
    },
  },
];

const ulSty: React.CSSProperties = { paddingLeft: 24, marginBottom: 16 };
const liSty: React.CSSProperties = { marginBottom: 8, lineHeight: 1.55 };
const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

export function CoFirmarContent({ lang }: { lang: Lang }) {
  const manPath = lang === "es" ? "/manifiesto" : "/en/manifesto";
  const legPath = lang === "es" ? "/legislacion" : "/en/legislation";
  const cloudPath = lang === "es" ? "/cloud" : "/en/cloud";

  return (
    <DocShell
      eyebrow={
        lang === "es"
          ? "co-firmar · invitación abierta a académicos y juristas"
          : "co-sign · open invitation to scholars and jurists"
      }
      title={
        lang === "es"
          ? "Sumá tu autoría a un RFC."
          : "Add your authorship to an RFC."
      }
      subtitle={
        lang === "es"
          ? "Los RFCs de ar-agents son drafts open-source bajo CC-BY-4.0. Si sos académico, jurista, especialista AAIP o experto en derecho corporativo argentino con interés en el régimen de sociedades-IA, podés sumar tu autoría a uno o más documentos. Es invitación abierta, sin compromiso comercial, y tu nombre queda en cita formal."
          : "ar-agents RFCs are open-source drafts under CC-BY-4.0. If you're an academic, jurist, AAIP specialist, or Argentine corporate-law expert with interest in the sociedades-IA regime, you can add your authorship to one or more documents. Open invitation, no commercial commitment, and your name lands in the formal citation."
      }
    >
      <DocP>
        <L
          lang={lang}
          es="El régimen de sociedades-IA (nombre legal: Sociedad Automatizada, art. 14), anunciado por Sturzenegger el 28 de abril de 2026 y con anteproyecto de Ley General de Sociedades en el Senado desde el 1 de junio de 2026, requiere infraestructura técnica + sustento jurídico. La técnica está escrita; el sustento jurídico requiere revisores con matrícula profesional y/o peso académico que el autor original (Nazareno Clemente, dev independiente) no tiene."
          en="The sociedades-IA regime (legal name: Sociedad Automatizada, art. 14), announced by Sturzenegger on April 28, 2026 and with a General Companies Law draft bill in the Senate since June 1, 2026, requires technical infrastructure + legal grounding. The technical side is written; the legal grounding requires reviewers with a professional license and/or academic weight the original author (Nazareno Clemente, independent dev) doesn't have."
        />
      </DocP>

      <DocP>
        <L
          lang={lang}
          es={
            <>
              Esta página es la invitación abierta. Si tu CV se cruza con
              alguno de los RFCs abajo, te interesa sumar tu autoría a
              una publicación CC-BY-4.0 con potencial de ser citada en
              legislación argentina, y querés contribuir sin asumir
              compromisos comerciales:{" "}
              <strong>
                <a
                  href="mailto:naza@naza.ar?subject=Co-firma%20RFC"
                  style={linkSty}
                >
                  mandame un email
                </a>
              </strong>{" "}
              con el RFC que te interesa.
            </>
          }
          en={
            <>
              This page is the open invitation. If your CV intersects
              with any of the RFCs below, you're interested in adding
              your authorship to a CC-BY-4.0 publication with potential
              to be cited in Argentine legislation, and you want to
              contribute without commercial commitments:{" "}
              <strong>
                <a
                  href="mailto:naza@naza.ar?subject=Co-sign%20RFC"
                  style={linkSty}
                >
                  send me an email
                </a>
              </strong>{" "}
              with the RFC you're interested in.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="Lo que la co-firma implica (y lo que no)"
          en="What co-signing implies (and what it does not)"
        />
      </DocH2>
      <DocP>
        <strong>
          <L lang={lang} es="Lo que sí:" en="What it does:" />
        </strong>
      </DocP>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                Tu nombre + afiliación institucional aparece en la
                cabecera del RFC + en cada cita formal generada (BibTeX,
                APA, Chicago,{" "}
                <Link href="/cite" style={linkSty}>
                  /cite
                </Link>
                ).
              </>
            }
            en={
              <>
                Your name + institutional affiliation appears in the
                RFC header + in every formal citation generated
                (BibTeX, APA, Chicago,{" "}
                <Link href="/cite" style={linkSty}>
                  /cite
                </Link>
                ).
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="Tu input editorial sobre el texto: secciones, propuestas, desambiguaciones, contraargumentos. El RFC pasa a ser co-authored."
            en="Your editorial input on the text: sections, proposals, disambiguation, counterarguments. The RFC becomes co-authored."
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="Crédito permanente bajo CC-BY-4.0. Cualquiera que adopte el RFC mantiene la atribución; eso vale como mérito académico."
            en="Permanent credit under CC-BY-4.0. Anyone adopting the RFC maintains attribution; that counts as academic merit."
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                Acceso a las discusiones públicas en{" "}
                <a
                  href="https://github.com/ar-agents/ar-agents/discussions"
                  style={linkSty}
                >
                  github.com/ar-agents/ar-agents/discussions
                </a>{" "}
                para hacer pull requests al texto.
              </>
            }
            en={
              <>
                Access to public discussions at{" "}
                <a
                  href="https://github.com/ar-agents/ar-agents/discussions"
                  style={linkSty}
                >
                  github.com/ar-agents/ar-agents/discussions
                </a>{" "}
                to open pull requests on the text.
              </>
            }
          />
        </li>
      </ul>
      <DocP>
        <strong>
          <L lang={lang} es="Lo que NO:" en="What it does NOT:" />
        </strong>
      </DocP>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es="No hay compensación económica. Es voluntario, académico."
            en="No financial compensation. Voluntary, academic."
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="No hay equity, ni contrato laboral, ni cláusula de exclusividad. Podés co-firmar otros RFCs en otros lugares, publicar libros sobre el tema, asesorar a quien quieras."
            en="No equity, no employment contract, no exclusivity clause. You can co-sign other RFCs elsewhere, publish books on the topic, advise whomever you wish."
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                No es endorsement del proyecto comercial ar-agents Cloud
                (eso vive en{" "}
                <Link href={cloudPath} style={linkSty}>
                  /cloud
                </Link>
                ). La co-firma es solo del documento técnico-jurídico.
              </>
            }
            en={
              <>
                Not an endorsement of the commercial ar-agents Cloud
                (which lives at{" "}
                <Link href={cloudPath} style={linkSty}>
                  /cloud
                </Link>
                ). Co-signing covers only the technical-legal document.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="No te obliga a defender el RFC en sede legislativa ni mediática. Si te invitan a participar, es opcional."
            en="It does not require you to defend the RFC before the legislature or media. If you're invited to participate, it's optional."
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="RFCs disponibles para co-firma"
          en="RFCs available for co-signing"
        />
      </DocH2>
      {RFCS.map((rfc) => (
        <div
          key={rfc.id}
          style={{
            margin: "16px 0",
            padding: 16,
            background: "var(--bg-tint)",
            borderLeft: "3px solid var(--accent)",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <h3 style={{ fontSize: 16, margin: 0, fontWeight: 600, color: "var(--text)" }}>
              RFC-{rfc.id} · {rfc.title[lang]}
            </h3>
            <Link
              href={`/rfcs/${rfc.id}`}
              style={{
                ...linkSty,
                fontSize: 13,
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              }}
            >
              <L lang={lang} es="leer →" en="read →" />
            </Link>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--text-body)", margin: "0 0 8px" }}>
            <strong style={{ color: "var(--text)" }}>
              <L lang={lang} es="Lo que necesita:" en="What it needs:" />
            </strong>{" "}
            {rfc.needs[lang]}
          </p>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--text-body)", margin: 0 }}>
            <strong style={{ color: "var(--text)" }}>
              <L
                lang={lang}
                es="Perfil ideal de co-firmante:"
                en="Ideal co-signer profile:"
              />
            </strong>{" "}
            {rfc.profile[lang]}
          </p>
        </div>
      ))}

      <DocH2>
        <L lang={lang} es="¿Por qué co-firmar?" en="Why co-sign?" />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Visibilidad académica.</strong> Si la ley se
                sanciona citando estos RFCs (objetivo declarado en{" "}
                <Link href={legPath} style={linkSty}>
                  /legislación
                </Link>
                ), tu nombre queda en la cita formal usada por
                legisladores, jueces, periodistas.
              </>
            }
            en={
              <>
                <strong>Academic visibility.</strong> If the law is
                enacted citing these RFCs (declared goal in{" "}
                <Link href={legPath} style={linkSty}>
                  /legislation
                </Link>
                ), your name lands in the formal citation used by
                legislators, judges, journalists.
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
                  Primer co-firmante en una jurisdicción nueva.
                </strong>{" "}
                Wyoming DAO LLC tiene autores académicos identificados
                (Caroline Lynch + Aaron Wright). Estonia e-Residency
                idem (Kaspar Korjus). Argentina podría tenerte a vos.
              </>
            }
            en={
              <>
                <strong>First co-signer in a new jurisdiction.</strong>{" "}
                Wyoming DAO LLC has identified academic authors
                (Caroline Lynch + Aaron Wright). Estonia e-Residency
                same (Kaspar Korjus). Argentina could have you.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>CV-eligible.</strong> CC-BY-4.0 con autoría
                compartida cuenta como publicación académica para
                CONICET, UBA, sistemas de promoción universitaria.
              </>
            }
            en={
              <>
                <strong>CV-eligible.</strong> CC-BY-4.0 with shared
                authorship counts as academic publication for CONICET,
                UBA, and university promotion systems.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Defendibilidad ética.</strong> El proyecto
                declaró desde el manifiesto que <em>no vende a la SIDE</em>
               , no participa de contratos con servicios de
                inteligencia ni seguridad estatal. La infraestructura es
                civil-comercial-OSS, revisable en{" "}
                <Link href={manPath} style={linkSty}>
                  /manifiesto
                </Link>
                .
              </>
            }
            en={
              <>
                <strong>Ethical defensibility.</strong> The project
                declared in its manifesto that it{" "}
                <em>does not sell to intelligence services</em>, does
                not participate in state intelligence or security
                contracts. The infrastructure is civil-commercial-OSS,
                reviewable at{" "}
                <Link href={manPath} style={linkSty}>
                  /manifesto
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
          es="El proceso, en 4 pasos"
          en="The process, in 4 steps"
        />
      </DocH2>
      <ol style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                Mandame un email a{" "}
                <a
                  href="mailto:naza@naza.ar?subject=Co-firma%20RFC"
                  style={linkSty}
                >
                  naza@naza.ar
                </a>{" "}
                con el número de RFC + tu CV breve (1-2 párrafos) + qué
                modificaciones / agregados harías.
              </>
            }
            en={
              <>
                Email{" "}
                <a
                  href="mailto:naza@naza.ar?subject=Co-sign%20RFC"
                  style={linkSty}
                >
                  naza@naza.ar
                </a>{" "}
                with the RFC number + your brief CV (1-2 paragraphs) +
                what modifications / additions you'd make.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="Conversamos 30 minutos sobre el alcance + revisamos el texto. Sin compromiso aún."
            en="We chat 30 minutes about scope + review the text. No commitment yet."
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="Si decidís sumarte: hacés un pull request al repo con tu autoría agregada + las modificaciones acordadas. PR queda en historia pública para trazabilidad."
            en="If you decide to join: you open a pull request to the repo with your authorship added + the agreed modifications. PR stays in public history for traceability."
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                Se merge la PR. Tu nombre aparece desde el commit
                siguiente en la cabecera del RFC + en cada citación
                generada en{" "}
                <Link href="/cite" style={linkSty}>
                  /cite
                </Link>
                .
              </>
            }
            en={
              <>
                The PR is merged. Your name appears from the next
                commit in the RFC header + in every citation generated
                at{" "}
                <Link href="/cite" style={linkSty}>
                  /cite
                </Link>
                .
              </>
            }
          />
        </li>
      </ol>

      <DocH2>
        <L lang={lang} es="Contacto" en="Contact" />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>Nazareno Clemente</strong> ·
              Monte Grande, Buenos Aires · monotributista categoría A.
              Mail directo:{" "}
              <a href="mailto:naza@naza.ar" style={linkSty}>
                naza@naza.ar
              </a>
              . Respuesta ≤48hs.
            </>
          }
          en={
            <>
              <strong>Nazareno Clemente</strong> ·
              Monte Grande, Buenos Aires · monotributista category A.
              Direct email:{" "}
              <a href="mailto:naza@naza.ar" style={linkSty}>
                naza@naza.ar
              </a>
              . Reply within 48h.
            </>
          }
        />
      </DocP>
    </DocShell>
  );
}
