import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";

type Lang = "es" | "en";

function L({ es, en, lang }: { es: React.ReactNode; en: React.ReactNode; lang: Lang }) {
  return <>{lang === "es" ? es : en}</>;
}

const PACKAGES_BLOCK = `@ar-agents/mercadopago         89 tools, pagos, suscripciones, marketplace
@ar-agents/mercadolibre        14 tools, items, órdenes, claims, shipments, ML marketplace
@ar-agents/identity             CUIT/CUIL + AFIP/ARCA padrón
@ar-agents/identity-attest      RENAPER-bypass via WhatsApp/email/Auth0
@ar-agents/whatsapp             WhatsApp Business Cloud + AR phone normalizer
@ar-agents/banking              CBU/CVU + BCRA Central de Deudores + Variables
@ar-agents/facturacion          AFIP/ARCA factura electrónica WSFE
@ar-agents/shipping             Andreani / OCA / Correo Argentino
@ar-agents/mi-argentina         OIDC del gobierno argentino, login con CUIL
@ar-agents/boletin-oficial      Firehose estructurado del BO con suscripciones
@ar-agents/igj                  IGJ datos abiertos, sociedades, autoridades, balances
@ar-agents/firma-digital        Verificación Ley 25.506 / ONTI, certs y CMS
@ar-agents/gde-tad              GDE/TAD, Domicilio Electrónico + IGJ pre-flight
@ar-agents/ap2                  Agent Payments Protocol, mandatos SD-JWT VC
@ar-agents/agentic-commerce-bridge   ACP bridge ChatGPT/Claude/Gemini → ML + MP
@ar-agents/incorporate          Client TS para auto-incorporación programática
@ar-agents/mcp                  MCP server unificado para todos los anteriores`;

export function ManifiestoContent({ lang }: { lang: Lang }) {
  return (
    <DocShell
      eyebrow={lang === "es" ? "manifiesto" : "manifesto"}
      title={
        lang === "es"
          ? "La infraestructura abierta para la jurisdicción de agentes argentina."
          : "Open infrastructure for the Argentine agent jurisdiction."
      }
      subtitle={
        lang === "es"
          ? "Si Argentina va a alojar 500 millones de agentes IA pagando impuestos acá, alguien tiene que escribir el código que los conecta al Estado. Que sea abierto. Que sea acá."
          : "If Argentina is going to host 500 million AI agents paying taxes here, someone has to write the code that connects them to the state. Let it be open. Let it be here."
      }
    >
      <DocH2>
        <L lang={lang} es="El momento" en="The moment" />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              En abril de 2026 el Ministro de Desregulación{" "}
              <strong>Federico Sturzenegger</strong> anunció su plan para
              que Argentina sea el primer país con un régimen jurídico
              para{" "}
              <DocCode>sociedades de inteligencia artificial</DocCode>{" "}
              (el anteproyecto las llama, en su figura legal,{" "}
              <strong>Sociedad Automatizada</strong>, art. 14):
              empresas operadas por agentes de IA, sin empleados en relación
              de dependencia, con supervisión humana mínima. El código opera
              y paga impuestos. Su proyección:{" "}
              <em>
                50 millones de habitantes y 500 millones de agentes IA
                incorporados acá
              </em>
              .
            </>
          }
          en={
            <>
              In April 2026, Argentina's Minister of Deregulation{" "}
              <strong>Federico Sturzenegger</strong> announced his plan
              to make Argentina the first country with a legal regime for{" "}
              <DocCode>AI corporations</DocCode> (the draft bill names the
              legal figure a <strong>Sociedad Automatizada</strong>, art.
              14): companies operated by AI agents, with no employees on
              staff, under minimal human supervision. The code operates and
              pays taxes. His projection:{" "}
              <em>
                50 million inhabitants and 500 million AI agents
                incorporated here
              </em>
              .
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              En la misma semana, <strong>Peter Thiel</strong> compró
              una mansión en Barrio Parque y empezó conversaciones con
              el gobierno sobre Palantir como contratista de
              inteligencia. La narrativa de &ldquo;Argentina =
              jurisdicción de IA&rdquo; está siendo escrita en tiempo
              real, desde arriba.
            </>
          }
          en={
            <>
              The same week, <strong>Peter Thiel</strong> bought a
              mansion in Buenos Aires and started conversations with the
              government about Palantir as an intelligence contractor.
              The narrative of &ldquo;Argentina = AI jurisdiction&rdquo;
              is being written in real time, from the top.
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              Lo que falta es la capa técnica. Las{" "}
              <DocCode>sociedades automatizadas</DocCode> de Sturzenegger
              todavía no tienen código que las haga existir: no hay
              librerías
              para que un agente registre un CUIT, factura
              electrónicamente, paga monotributo, abre una cuenta MP,
              manda un WhatsApp. Cualquiera que las construya primero
              define el estándar.
            </>
          }
          en={
            <>
              What's missing is the technical layer. Sturzenegger's{" "}
              <DocCode>automated companies</DocCode> don't yet have code
              that makes them exist: there are no libraries for an agent to
              register a CUIT, issue electronic invoices, pay
              monotributo, open a MercadoPago account, send a WhatsApp.
              Whoever builds them first defines the standard.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L lang={lang} es="La tesis" en="The thesis" />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>ar-agents</strong> apuesta a que esa
              infraestructura sea <strong>abierta</strong>,{" "}
              <strong>civil</strong>,{" "}
              <strong>de calidad productiva</strong> y{" "}
              <strong>
                nativa de los frameworks que ya están ganando
              </strong>{" "}
              (Vercel AI SDK 6, Model Context Protocol, agents.md). No
              SaaS, no contratos con el Estado, no consultoría: las
              primitivas técnicas debajo de todo lo que se construya en
              este ciclo.
            </>
          }
          en={
            <>
              <strong>ar-agents</strong> bets that this
              infrastructure should be <strong>open</strong>,{" "}
              <strong>civilian</strong>,{" "}
              <strong>production-grade</strong>, and{" "}
              <strong>
                native to the frameworks already winning
              </strong>{" "}
              (Vercel AI SDK 6, Model Context Protocol, agents.md). No
              SaaS, no state contracts, no consulting: the technical
              primitives underneath everything built this cycle.
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              Lo que ya está publicado en{" "}
              <a
                href="https://www.npmjs.com/org/ar-agents"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                npmjs.com/org/ar-agents
              </a>
              :
            </>
          }
          en={
            <>
              What's already published on{" "}
              <a
                href="https://www.npmjs.com/org/ar-agents"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                npmjs.com/org/ar-agents
              </a>
              :
            </>
          }
        />
      </DocP>
      <DocBlock>{PACKAGES_BLOCK}</DocBlock>

      <DocH2>
        <L lang={lang} es="Las decisiones de diseño" en="Design decisions" />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>Web Crypto, no Node.</strong> Todo corre en Edge
              Runtime, Cloudflare Workers, Deno. Si tu agente vive en
              serverless, ar-agents funciona ahí.
            </>
          }
          en={
            <>
              <strong>Web Crypto, not Node.</strong> Everything runs on
              Edge Runtime, Cloudflare Workers, Deno. If your agent
              lives in serverless, ar-agents works there.
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>Adapter pattern por default.</strong> Cada package
              ships con un <DocCode>UnconfiguredAdapter</DocCode> que no
              crashea, devuelve instrucciones de setup. Las tools
              siempre son seguras de llamar.
            </>
          }
          en={
            <>
              <strong>Adapter pattern by default.</strong> Every package
              ships with an <DocCode>UnconfiguredAdapter</DocCode> that
              doesn't crash, it returns setup instructions. Tools are
              always safe to call.
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>AGENTS.md por package.</strong> Por{" "}
              <a
                href="https://agents.md/"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                la convención agents.md
              </a>
             , cada paquete trae instrucciones para que el LLM lea en
              runtime: cuándo usar, cuándo no, qué retorna, side
              effects, latencias.
            </>
          }
          en={
            <>
              <strong>AGENTS.md per package.</strong> Following{" "}
              <a
                href="https://agents.md/"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                the agents.md convention
              </a>
             , each package ships instructions the LLM reads at
              runtime: when to use, when not, return shape, side
              effects, latencies.
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>Idempotencia determinística.</strong> Las tools
              que mutan derivan su clave de un hash de los inputs. Un
              LLM que reintenta no cobra dos veces.
            </>
          }
          en={
            <>
              <strong>Deterministic idempotency.</strong> Mutating tools
              derive their key from a hash of the inputs. A retrying
              LLM doesn't double-charge.
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>HITL programático.</strong> Operaciones
              irreversibles (refund, cancel, delete) requieren
              confirmación explícita ANTES de ejecutarse. No es una
              instrucción al modelo, es un gate de código.
            </>
          }
          en={
            <>
              <strong>Programmatic HITL.</strong> Irreversible
              operations (refund, cancel, delete) require explicit
              confirmation BEFORE execution. It's not a model
              instruction, it's a code gate.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="Lo que no hace ar-agents"
          en="What ar-agents does NOT do"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es="No vende a la SIDE. No participa de contratos con servicios de inteligencia ni seguridad estatal. La infraestructura es explícitamente civil, comercial, abierta (developer-OSS). Si necesitás Palantir Gotham, hay otros lugares."
          en="Does not sell to intelligence services. Does not participate in contracts with state intelligence or security agencies. The infrastructure is explicitly civilian, commercial, open (developer-OSS). If you need Palantir Gotham, there are other places."
        />
      </DocP>

      <DocH2>
        <L lang={lang} es="Cómo aportar" en="How to contribute" />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              El repo es{" "}
              <a
                href="https://github.com/ar-agents/ar-agents"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                github.com/ar-agents/ar-agents
              </a>
              . Issues abiertos, PRs bienvenidos, conventional commits,
              MIT license, npm provenance. Si construís un package que
              falta, abrí un issue antes de empezar, coordino el scope
              para que no dupliquemos esfuerzo.
            </>
          }
          en={
            <>
              The repo is{" "}
              <a
                href="https://github.com/ar-agents/ar-agents"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                github.com/ar-agents/ar-agents
              </a>
              . Issues open, PRs welcome, conventional commits, MIT
              license, npm provenance. If you build a missing package,
              open an issue before starting, I'll coordinate scope to
              avoid duplicate effort.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="Carta abierta al Ministro"
          en="Open letter to the Minister"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              El 9 de mayo de 2026 publiqué una carta abierta al
              Ministro Sturzenegger en{" "}
              <a
                href={
                  lang === "es" ? "/al-ministro" : "/en/to-the-minister"
                }
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                /al-ministro
              </a>
              . Explica qué le puede servir del stack, qué no estoy
              pidiendo (contratos, subsidios, reuniones), y la propuesta
              de working group AAIF para volver el perfil técnico de las
              sociedades automatizadas un estándar internacional neutral.
              CC0: copiá, traducí, citá.
            </>
          }
          en={
            <>
              On May 9, 2026 I published an open letter to Minister
              Sturzenegger at{" "}
              <a
                href={
                  lang === "es" ? "/al-ministro" : "/en/to-the-minister"
                }
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                /to-the-minister
              </a>
              . It explains what may be useful to him from the stack,
              what I'm not asking for (contracts, subsidies, meetings),
              and the AAIF working group proposal to make the technical
              profile of automated companies a neutral international
              standard. CC0, copy, translate, cite.
            </>
          }
        />
      </DocP>

      <p style={{ marginTop: 32, color: "var(--text-muted)" }}>
        <L
          lang={lang}
          es="Nazareno Clemente, mayo de 2026"
          en="Nazareno Clemente, May 2026"
        />
      </p>
    </DocShell>
  );
}
