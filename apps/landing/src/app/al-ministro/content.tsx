import Link from "next/link";
import { DocCode, DocH2, DocP, DocShell } from "../doc-shell";

/**
 * Shared bilingual content for /al-ministro (ES, the canonical CC0 letter)
 * and /en/to-the-minister (EN translation, also CC0).
 */

type Lang = "es" | "en";

function L({
  es,
  en,
  lang,
}: {
  es: React.ReactNode;
  en: React.ReactNode;
  lang: Lang;
}) {
  return <>{lang === "es" ? es : en}</>;
}

export function AlMinistroContent({ lang }: { lang: Lang }) {
  const linkSty = { color: "var(--accent)", textDecoration: "underline" };

  return (
    <DocShell
      eyebrow={lang === "es" ? "carta abierta" : "open letter"}
      title={
        lang === "es"
          ? "Al Ministro Sturzenegger."
          : "To Minister Sturzenegger."
      }
      subtitle={
        lang === "es"
          ? "Sobre la implementación técnica del régimen de sociedades automatizadas, y la pieza faltante para que se pueda ejecutar el plan el mismo día que la ley se apruebe."
          : "On the technical implementation of the automated-company regime, and the missing piece for the plan to be executed the same day the law is passed."
      }
    >
      <DocP>
        <strong>
          <L
            lang={lang}
            es="Sr. Ministro de Desregulación y Transformación del Estado, Federico Sturzenegger:"
            en="Mr. Federico Sturzenegger, Minister of Deregulation and State Transformation:"
          />
        </strong>
      </DocP>

      <DocP>
        <L
          lang={lang}
          es={
            <>
              El 28 de abril en Expo EFI anunció el régimen, y el 1 de
              junio de 2026 el Poder Ejecutivo envió al Senado el
              anteproyecto que reemplaza la Ley 19.550. Crea la{" "}
              <em>Sociedad Automatizada</em> (art. 14): una empresa
              operada por agentes de IA, sin trabajadores en relación de
              dependencia para su operación ordinaria, que responde con su
              patrimonio y conserva un administrador que configura y
              supervisa el sistema (art. 102). Y la{" "}
              <em>Sociedad Descentralizada Autónoma Operativa</em> (DAO,
              art. 258), con representante legal humano obligatorio (art.
              260). Su cifra fue clara,{" "}
              &ldquo;si en 10 años el 90% del PBI mundial lo producen
              agentes de IA, queremos que ese régimen jurídico esté en
              Argentina&rdquo;.
            </>
          }
          en={
            <>
              On April 28 at Expo EFI you announced the regime, and on
              June 1, 2026 the Executive sent the Senate the draft bill
              that replaces Law 19.550. It creates the{" "}
              <em>Sociedad Automatizada</em> (art. 14): a company run by
              AI agents, with no employees on payroll for its ordinary
              operation, that answers with its own assets and keeps an
              administrator who configures and supervises the system (art.
              102). And the{" "}
              <em>Sociedad Descentralizada Autónoma Operativa</em> (DAO,
              art. 258), with a mandatory human legal representative
              (art. 260). Your quote was clear, &ldquo;if in 10 years 90%
              of global GDP is produced by AI agents, we want that legal
              regime to be in Argentina&rdquo;.
            </>
          }
        />
      </DocP>

      <DocP>
        <L
          lang={lang}
          es="Le escribo para contarle que desarrollé la capa técnica que ese régimen va a necesitar. Cuando leí el anuncio, empecé a construirla de inmediato. Esto es lo que hay hoy, público, en npm y GitHub, bajo licencia MIT:"
          en="I'm writing to tell you I've built the technical layer that regime will need. When I read your announcement, I started right away. This is what exists today, publicly, on npm and GitHub, under MIT license:"
        />
      </DocP>

      <ul
        style={{
          margin: "16px 0 24px 24px",
          color: "var(--text-body)",
          fontSize: 16,
          lineHeight: 1.7,
        }}
      >
        <li>
          <L
            lang={lang}
            es={
              <>
                <strong>39 paquetes</strong> en el scope{" "}
                <DocCode>@ar-agents/*</DocCode> en npm.
              </>
            }
            en={
              <>
                <strong>39 packages</strong> under the{" "}
                <DocCode>@ar-agents/*</DocCode> scope on npm.
              </>
            }
          />
        </li>
        <li>
          <L
            lang={lang}
            es={
              <>
                <strong>245 herramientas</strong> con definiciones de
                tipo verificadas para Vercel AI SDK 6, el toolkit
                estándar de la industria para agentes.
              </>
            }
            en={
              <>
                <strong>245 tools</strong> with verified type
                definitions for Vercel AI SDK 6, the industry-standard
                toolkit for agents.
              </>
            }
          />
        </li>
        <li>
          <L
            lang={lang}
            es={
              <>
                <strong>16 de las 17 piezas operativas</strong> que una
                sociedad automatizada argentina va a necesitar para
                funcionar:
                identidad (CUIT, ARCA, RENAPER, Mi Argentina), firma
                digital (Ley 25.506, ONTI), dinero (Mercado Pago +
                factura electrónica AFIP + BCRA Central de Deudores +
                Principales Variables), operación al cliente (WhatsApp
                Business, Andreani, OCA, Correo), monitoreo del Estado
                (Boletín Oficial, datos.jus.gob.ar para IGJ).
              </>
            }
            en={
              <>
                <strong>16 of the 17 operational pieces</strong> an
                Argentine automated company will need to operate: identity
                (CUIT, ARCA, RENAPER, Mi Argentina), digital signature
                (Law 25.506, ONTI), money (Mercado Pago + AFIP
                electronic invoicing + BCRA Central de Deudores + Key
                Variables), customer ops (WhatsApp Business, Andreani,
                OCA, Correo), state monitoring (Official Gazette,
                datos.jus.gob.ar for IGJ).
              </>
            }
          />
        </li>
        <li>
          <L
            lang={lang}
            es={
              <>
                <strong>Certificados de origen SLSA v1</strong>{" "}
                (provenance attestations: comprueban que el código
                publicado en npm es el mismo que está en GitHub, sin
                alteraciones) en cada release. <strong>MIT</strong>.{" "}
                <strong>Sin costos</strong> upfront.{" "}
                <strong>Sin dependencias propietarias</strong> bajo el
                capot.
              </>
            }
            en={
              <>
                <strong>SLSA v1 provenance attestations</strong> (proof
                that the code published on npm is the same as on
                GitHub, unaltered) on every release. <strong>MIT</strong>
                . <strong>No upfront cost</strong>.{" "}
                <strong>No proprietary dependencies</strong> under the
                hood.
              </>
            }
          />
        </li>
      </ul>

      <DocP>
        <L
          lang={lang}
          es={
            <>
              Falta una pieza:{" "}
              <DocCode>@ar-agents/gde-tad</DocCode> completo, integrado
              con la inscripción real en IGJ. Depende de que el Estado
              abra una API documentada para TAD. Hoy hay un adapter
              funcional para el pre-flight de inscripciones y para el
              inbox del Domicilio Electrónico Constituido, pero el acta de
              constitución no se puede presentar programáticamente. Si la
              nueva Ley General de Sociedades pasa por el Congreso con un
              mandato técnico de exposición programática de TAD, el ciclo
              se cierra.
            </>
          }
          en={
            <>
              One piece is missing:{" "}
              <DocCode>@ar-agents/gde-tad</DocCode> complete, integrated
              with real IGJ registration. It depends on the state opening
              a documented API for TAD. Today there is a functional
              adapter for incorporation pre-flight and for the
              Electronic Domicile inbox, but the constitutive deed
              cannot be filed programmatically. If the new General
              Companies Law passes Congress with a technical
              mandate to expose TAD programmatically, the cycle closes.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="Por qué le escribo esto"
          en="Why I'm writing this"
        />
      </DocH2>

      <DocP>
        <L
          lang={lang}
          es="Le escribo porque estoy alineado con la propuesta de tratar a Argentina como una jurisdicción experimental para agentes IA. Para que el plan funcione, la implementación de referencia tiene que existir y ser verificable. Una empresa de cualquier país que evalúe incorporarse en Argentina va a buscar dos cosas: el texto legal y el código que conecta una empresa-agente con el Estado. El texto legal depende del gobierno. El código puede escribirlo cualquier ciudadano capacitado. Eso es lo que hice."
          en="I'm writing because I'm aligned with the proposal of treating Argentina as an experimental jurisdiction for AI agents. For the plan to work, the reference implementation has to exist and be verifiable. A company from any country weighing whether to incorporate in Argentina will look for two things: the legal text and the code that connects an agent-company to the state. The legal text depends on the government. The code can be written by any qualified citizen. That is what I did."
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="Lo que le puede servir"
          en="What might be useful to you"
        />
      </DocH2>

      <ul
        style={{
          margin: "16px 0 24px 24px",
          color: "var(--text-body)",
          fontSize: 16,
          lineHeight: 1.7,
        }}
      >
        <li>
          <Link href="/video" style={linkSty}>
            <DocCode>/video</DocCode>
          </Link>:{" "}

          <L
            lang={lang}
            es="2:30 minutos de un agente usando 6 paquetes ar-agents para constituir y operar una sociedad automatizada argentina ficticia de principio a fin. La forma más rápida de ver de qué se trata sin leer código."
            en="2:30 minutes of an agent using 6 ar-agents packages to incorporate and operate a fictional Argentine automated company from start to finish. The fastest way to see what this is about without reading code."
          />
        </li>
        <li>
          <Link
            href={lang === "es" ? "/sociedades-ia" : "/en/ai-corporations"}
            style={linkSty}
          >
            <DocCode>
              {lang === "es" ? "/sociedades-ia" : "/en/ai-corporations"}
            </DocCode>
          </Link>:{" "}

          <L
            lang={lang}
            es={
              <>
                el mapa de las 17 piezas operativas y una transcripción
                del agente real ejecutando el ciclo &ldquo;constituir +
                operar&rdquo; en ~12 segundos. Reutilizable para
                presentaciones.
              </>
            }
            en={
              <>
                the map of the 17 operational pieces and a real-agent
                transcript executing the &ldquo;incorporate + operate&rdquo;
                cycle in ~12 seconds. Reusable for presentations.
              </>
            }
          />
        </li>
        <li>
          <Link href="/rfcs/001" style={linkSty}>
            <DocCode>/rfcs/001</DocCode>
          </Link>:{" "}

          <L
            lang={lang}
            es={
              <>
                RFC sobre identidad, firma y responsabilidad de agentes
                en Argentina (CC-BY-4.0, DOI{" "}
                <a
                  href="https://doi.org/10.5281/zenodo.20159396"
                  style={linkSty}
                >
                  10.5281/zenodo.20159396
                </a>
                ). Las preguntas técnicas que el proyecto va a tener que
                responder, con propuestas concretas. Listo para que un
                asesor las copie a un documento del Ministerio si las
                considera útiles.
              </>
            }
            en={
              <>
                RFC on identity, signing, and liability of agents in
                Argentina (CC-BY-4.0, DOI{" "}
                <a
                  href="https://doi.org/10.5281/zenodo.20159396"
                  style={linkSty}
                >
                  10.5281/zenodo.20159396
                </a>
                ). The technical questions the proposal will have to
                answer, with concrete proposals. Ready for an advisor to
                copy into a Ministry document if useful.
              </>
            }
          />
        </li>
        <li>
          <Link
            href={lang === "es" ? "/implementacion" : "/en/implementation"}
            style={linkSty}
          >
            <DocCode>
              {lang === "es" ? "/implementacion" : "/en/implementation"}
            </DocCode>
          </Link>:{" "}

          <L
            lang={lang}
            es="el documento técnico para el equipo redactor. Arquitectura sobre estándares abiertos preexistentes, cinco cláusulas operables sugeridas para el texto, y respuesta a las objeciones jurídicas del debate público. MIT, citable, para circular en las áreas técnicas del Ministerio."
            en="the technical document for the bill drafting team. Architecture on preexisting open standards, five suggested operable clauses for the text, and answers to the legal objections from the public debate. MIT, citable, for circulation in the Ministry's technical areas."
          />
        </li>
      </ul>

      <DocH2>
        <L lang={lang} es="Mi propuesta" en="My proposal" />
      </DocH2>

      <DocP>
        <L
          lang={lang}
          es="Un dato para el debate legislativo: la objeción más previsible al proyecto será que construir la infraestructura técnica para sociedades automatizadas es caro y lento. La implementación de referencia que adjunto demuestra lo contrario. Ya existe, es funcional, está auditada y disponible bajo licencia MIT. El régimen no parte de cero, parte de un stack que ya opera."
          en="A point for the legislative debate: the most predictable objection to the bill will be that building the technical infrastructure for automated companies is expensive and slow. The reference implementation enclosed shows the opposite. It already exists, is functional, audited, and available under MIT license. The regime does not start from zero; it starts from a stack that already operates."
        />
      </DocP>

      <DocP>
        <L
          lang={lang}
          es="Lo que sería útil:"
          en="What would be useful:"
        />
      </DocP>

      <ul
        style={{
          margin: "16px 0 24px 24px",
          color: "var(--text-body)",
          fontSize: 16,
          lineHeight: 1.7,
        }}
      >
        <li style={{ marginBottom: 8 }}>
          <L
            lang={lang}
            es="Que el ministerio sepa que la implementación de referencia existe, mientras el anteproyecto se debate en el Senado. Así el texto final no arrastra supuestos técnicos que contradigan un stack que ya funciona, y se acelera la reglamentación que los arts. 263-264 dejan pendiente."
            en="That the ministry knows the reference implementation exists while the draft bill is debated in the Senate. That way the final text doesn't drag in technical assumptions that contradict a stack that already works, and the regulation that arts. 263-264 leave pending moves faster."
          />
        </li>
        <li style={{ marginBottom: 8 }}>
          <L
            lang={lang}
            es="Que TAD (Trámites a Distancia) exponga una API documentada para inscripciones. Sin eso, la última pieza no cierra. Puedo ayudar con esto también."
            en="That TAD (Trámites a Distancia) expose a documented API for registrations. Without it, the last piece doesn't close. I can help with this too."
          />
        </li>
        <li>
          <L
            lang={lang}
            es="Si algún equipo técnico (Subsecretaría TIC, Sandbox, u otro) considera útil leer el RFC-001 y comentar, agradezco comentarios públicos en GitHub."
            en="If any technical team (Subsec TIC, the Sandbox team, or another) finds it useful to read RFC-001 and comment, public comments on GitHub are welcome."
          />
        </li>
      </ul>

      <p
        style={{
          marginTop: 32,
          marginBottom: 6,
          color: "var(--text-body)",
          fontSize: 16,
          lineHeight: 1.7,
        }}
      >
        <L
          lang={lang}
          es="Quedo a disposición."
          en="I remain at your disposal."
        />
      </p>

      <p
        style={{
          marginTop: 24,
          marginBottom: 6,
          color: "var(--text-body)",
          fontSize: 16,
          lineHeight: 1.7,
        }}
      >
        <L lang={lang} es="Atentamente," en="Sincerely," />
      </p>

      <p
        style={{
          marginBottom: 2,
          color: "var(--text)",
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.5,
        }}
      >
        Nazareno Clemente
      </p>
      <p
        style={{
          marginBottom: 2,
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <L
          lang={lang}
          es="Ingeniero de Software Argentino."
          en="Argentine Software Engineer."
        />
      </p>
      <p
        style={{
          marginBottom: 0,
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <a href="mailto:naza@naza.ar" style={linkSty}>
          naza@naza.ar
        </a>
      </p>
    </DocShell>
  );
}
