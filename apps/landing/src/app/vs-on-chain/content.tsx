import Link from "next/link";
import { DocH2, DocP, DocShell } from "../doc-shell";
import type { Lang } from "../i18n";

/**
 * Shared bilingual content for `/vs-on-chain` (ES, default) and
 * `/en/vs-on-chain` (EN). Same comparative tables in both languages,
 * only the surrounding copy translates.
 */

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

interface DiffBi {
  axis: { es: string; en: string };
  arAgents: { es: string; en: string };
  onChain: { es: string; en: string };
  implication: { es: string; en: string };
}

const DIFFS: ReadonlyArray<DiffBi> = [
  {
    axis: { es: "Sustento legal", en: "Legal grounding" },
    arAgents: {
      es: "Sociedad-IA argentina con CUIT registrado en AFIP/ARCA. Persona jurídica reconocida bajo Código Civil y Comercial + futura Ley de Sociedades-IA. Opera en derecho positivo argentino.",
      en: "Argentine AI-corp with CUIT registered at AFIP/ARCA. Legal person recognised under the Civil and Commercial Code + the upcoming AI-corp Law. Operates under Argentine positive law.",
    },
    onChain: {
      es: "Wallet en Base mainnet + token de governance. Sin jurisdicción declarada. Sin CUIT. Sin reconocimiento como persona jurídica en ningún Estado. Opera en código.",
      en: "Wallet on Base mainnet + governance token. No declared jurisdiction. No CUIT. No recognition as a legal person in any State. Operates on code.",
    },
    implication: {
      es: "Para AFIP, juzgados, AAIP: la primera existe; la segunda es un usuario anónimo con tokens.",
      en: "For AFIP, courts, AAIP: the former exists; the latter is an anonymous user with tokens.",
    },
  },
  {
    axis: { es: "Identidad del agente", en: "Agent identity" },
    arAgents: {
      es: "CUIT 20-XX-X + Clave Fiscal Nivel 3-4 + (proxima) Mi Argentina OIDC. Atribución institucional.",
      en: "CUIT 20-XX-X + Clave Fiscal Level 3-4 + (upcoming) Mi Argentina OIDC. Institutional attribution.",
    },
    onChain: {
      es: "Ethereum address (0x...). Pseudónimo. Sin link verificable con persona física o jurídica AR.",
      en: "Ethereum address (0x...). Pseudonymous. No verifiable link to an AR natural or legal person.",
    },
    implication: {
      es: "Si un agente argentino debe pagarle a otro agente argentino con factura electrónica, la primera puede; la segunda no.",
      en: "If an Argentine agent has to pay another Argentine agent via electronic invoice, the former can; the latter cannot.",
    },
  },
  {
    axis: {
      es: "Firma con valor probatorio",
      en: "Signature with evidentiary value",
    },
    arAgents: {
      es: "Firma digital X.509 emitida por ARCA bajo Ley 25.506. Verificable bajo CPCCN Art. 286+287. Sirve en tribunales argentinos.",
      en: "X.509 digital signature issued by ARCA under Law 25.506. Verifiable under CPCCN Art. 286+287. Admissible in Argentine courts.",
    },
    onChain: {
      es: "Firma ECDSA secp256k1. Verificable matemáticamente. NO equivale a firma digital con valor probatorio bajo ley argentina.",
      en: "ECDSA secp256k1 signature. Mathematically verifiable. NOT equivalent to a digital signature with evidentiary value under Argentine law.",
    },
    implication: {
      es: "Un juez argentino acepta la primera como prueba de autoría; la segunda requiere pericia + interpretación + jurisprudencia que aún no existe.",
      en: "An Argentine judge accepts the former as proof of authorship; the latter requires expert testimony + interpretation + case law that does not yet exist.",
    },
  },
  {
    axis: { es: "Audit log", en: "Audit log" },
    arAgents: {
      es: "Append-only HMAC-SHA256 + Ed25519 dual-sign (RFC-004 + RFC-005). Diseñado para perito judicial argentino. Retención 180d-5y normativa.",
      en: "Append-only HMAC-SHA256 + Ed25519 dual-sign (RFC-004 + RFC-005). Designed for Argentine judicial experts. Regulatory retention of 180d-5y.",
    },
    onChain: {
      es: "Transactions on-chain. Inmutables matemáticamente, públicas. Pero no estructuradas para inspección regulatoria, un regulador AAIP no tiene API estándar para preguntar 'qué hizo el agente X entre fechas A y B'.",
      en: "Transactions on-chain. Mathematically immutable, public. But not structured for regulatory inspection, an AAIP regulator has no standard API to ask 'what did agent X do between dates A and B'.",
    },
    implication: {
      es: "La primera es 'audit-ready'. La segunda es 'audit-possible si tenés capacidad on-chain forense'.",
      en: "The former is 'audit-ready'. The latter is 'audit-possible if you have on-chain forensics capacity'.",
    },
  },
  {
    axis: {
      es: "Cumplimiento Ley 25.326 (LPDP)",
      en: "Compliance with Law 25.326 (LPDP)",
    },
    arAgents: {
      es: "AAIP puede emitir orden de inspección. Operador responde dentro del marco regulatorio AR. Si la sociedad-IA procesa datos personales, hay procedimiento.",
      en: "AAIP can issue an inspection order. The operator responds within the AR regulatory framework. If the AI-corp processes personal data, there is procedure.",
    },
    onChain: {
      es: "Wallets sin operador conocido + datos públicos on-chain por diseño. AAIP no tiene jurisdicción sobre Base mainnet.",
      en: "Wallets with no known operator + public on-chain data by design. AAIP has no jurisdiction over Base mainnet.",
    },
    implication: {
      es: "El régimen Sturzenegger asume que las sociedades-IA pueden ser inspeccionadas. Las wallets on-chain hacen ese supuesto técnicamente imposible.",
      en: "The Sturzenegger regime assumes AI-corps can be inspected. On-chain wallets make that assumption technically impossible.",
    },
  },
  {
    axis: { es: "Cobranza fiscal", en: "Fiscal collection" },
    arAgents: {
      es: "Factura electrónica WSFE. Monotributo o responsable inscripto. AFIP captura impuestos directamente del flujo.",
      en: "WSFE electronic invoice. Monotributo or responsable inscripto. AFIP captures taxes directly from the flow.",
    },
    onChain: {
      es: "Tokens transferidos peer-to-peer. Sin retención automática. Cobranza fiscal requiere que el holder declare voluntariamente (raro).",
      en: "Tokens transferred peer-to-peer. No automatic withholding. Fiscal collection requires the holder to declare voluntarily (rare).",
    },
    implication: {
      es: "El argumento económico del régimen (USD 150M+ de captura fiscal anual) depende del primer modelo. El segundo es tax-evasive by design.",
      en: "The regime's economic argument (USD 150M+ in annual fiscal capture) depends on the former model. The latter is tax-evasive by design.",
    },
  },
  {
    axis: { es: "Continuidad", en: "Continuity" },
    arAgents: {
      es: "Sociedad legal con asiento patrimonial. Si el operador desaparece, hay procedimiento de liquidación (Ley 19.550). Acreedores y terceros tienen recurso.",
      en: "Legal company with a patrimonial seat. If the operator vanishes, there is a winding-up procedure (Law 19,550). Creditors and third parties have recourse.",
    },
    onChain: {
      es: "Si la clave se pierde, la entidad se pierde. Si el smart contract tiene bug, no hay recurso. Si el token colapsa, los stakeholders no tienen mecanismo de protección.",
      en: "If the key is lost, the entity is lost. If the smart contract has a bug, there is no recourse. If the token collapses, stakeholders have no protection mechanism.",
    },
    implication: {
      es: "Para clientes que contraten servicios de una sociedad-IA, la primera tiene defensa al consumidor; la segunda tiene 'tx not reverted'.",
      en: "For clients contracting services from an AI-corp, the former has consumer protection; the latter has 'tx not reverted'.",
    },
  },
  {
    axis: { es: "Captura de valor", en: "Value capture" },
    arAgents: {
      es: "Open-source (MIT + CC-BY-4.0). El upside del mantenedor está en servicios profesionales + Cloud comercial tier (ver /cloud). Sin token.",
      en: "Open-source (MIT + CC-BY-4.0). Maintainer upside lives in professional services + Cloud commercial tier (see /cloud). No token.",
    },
    onChain: {
      es: "Token de governance con upside de mercado. Modelo speculative, los holders capturan upside via apreciación del token, no via servicios.",
      en: "Governance token with market upside. Speculative model, holders capture upside via token appreciation, not via services.",
    },
    implication: {
      es: "Modelos de monetización distintos. ar-agents = revenue por servicios. On-chain = revenue por especulación + DeFi yield.",
      en: "Different monetisation models. ar-agents = revenue via services. On-chain = revenue via speculation + DeFi yield.",
    },
  },
];

interface UseCaseBi {
  label: { es: string; en: string };
  ar: { es: string; en: string };
  chain: { es: string; en: string };
}

const USE_CASES: ReadonlyArray<UseCaseBi> = [
  {
    label: {
      es: "Facturar a clientes argentinos en pesos",
      en: "Invoice Argentine clients in pesos",
    },
    ar: {
      es: "✓ Sí (AFIP WSFE + Mercado Pago)",
      en: "✓ Yes (AFIP WSFE + Mercado Pago)",
    },
    chain: {
      es: "✗ No directamente",
      en: "✗ Not directly",
    },
  },
  {
    label: {
      es: "Recibir transferencias internacionales en cripto",
      en: "Receive international transfers in crypto",
    },
    ar: {
      es: "△ Vía Bitcoin/MP Crypto, fricción",
      en: "△ Via Bitcoin/MP Crypto, friction",
    },
    chain: {
      es: "✓ Nativo",
      en: "✓ Native",
    },
  },
  {
    label: {
      es: "Cumplir Ley 25.326 (AAIP) para datos personales AR",
      en: "Comply with Law 25,326 (AAIP) for AR personal data",
    },
    ar: {
      es: "✓ Operador identificable",
      en: "✓ Identifiable operator",
    },
    chain: {
      es: "✗ No por diseño",
      en: "✗ No, by design",
    },
  },
  {
    label: {
      es: "Contratar empleados o subcontratistas formales en AR",
      en: "Hire formal employees or contractors in AR",
    },
    ar: {
      es: "✓ Sí (cuando régimen lo permita)",
      en: "✓ Yes (once the regime allows it)",
    },
    chain: {
      es: "✗ No, sin personalidad jurídica",
      en: "✗ No, no legal personality",
    },
  },
  {
    label: {
      es: "Participar de licitaciones públicas",
      en: "Participate in public tenders",
    },
    ar: {
      es: "✓ Sí (con CUIT en formato proveedor del Estado)",
      en: "✓ Yes (with CUIT in State-supplier format)",
    },
    chain: {
      es: "✗ No",
      en: "✗ No",
    },
  },
  {
    label: {
      es: "Captura especulativa por holders del token",
      en: "Speculative capture by token holders",
    },
    ar: {
      es: "✗ Sin token",
      en: "✗ No token",
    },
    chain: {
      es: "✓ Sí",
      en: "✓ Yes",
    },
  },
  {
    label: {
      es: "Operar sin revelar persona física detrás",
      en: "Operate without revealing the natural person behind",
    },
    ar: {
      es: "✗ Operador con CUIT visible",
      en: "✗ Operator with visible CUIT",
    },
    chain: {
      es: "✓ Pseudónimo on-chain",
      en: "✓ On-chain pseudonymous",
    },
  },
  {
    label: {
      es: "Sobrevivir un cambio de gobierno argentino",
      en: "Survive an Argentine change of government",
    },
    ar: {
      es: "△ Depende de continuidad regulatoria",
      en: "△ Depends on regulatory continuity",
    },
    chain: {
      es: "✓ Indiferente a la política AR",
      en: "✓ Indifferent to AR politics",
    },
  },
];

const T = (lang: Lang) => ({
  eyebrow:
    lang === "es"
      ? "vs · on-chain agents (sairi/wagmi/democracy earth) · 2026-05"
      : "vs · on-chain agents (sairi/wagmi/democracy earth) · 2026-05",
  title:
    lang === "es"
      ? "No competimos con experimentos on-chain. Somos otra pista."
      : "We do not compete with on-chain experiments. We are a different track.",
  subtitle:
    lang === "es"
      ? "Santi Siri propone $SAIRI en Base mainnet + WAGMI.law como traductor natural-language → smart contract. Es una pista interesante. ar-agents es otra: civil-comercial-OSS para que una sociedad-IA argentina opere bajo derecho positivo. Las dos pueden coexistir. Esta página explica el por qué."
      : "Santi Siri proposes $SAIRI on Base mainnet + WAGMI.law as a natural-language → smart-contract translator. It is an interesting track. ar-agents is a different one: civil-commercial-OSS for an Argentine AI-corp to operate under positive law. The two can coexist. This page explains why.",
});

export function VsOnChainContent({ lang }: { lang: Lang }) {
  const t = T(lang);
  const onChainRfc003 = lang === "es" ? "/rfcs/003" : "/rfcs/003";

  return (
    <DocShell eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle}>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              Si llegaste acá buscando "es lo mismo que SAIRI" o "por qué no
              usás cripto", la respuesta corta es: no es lo mismo, no es
              mejor ni peor, son{" "}
              <strong>capas distintas del mismo problema</strong>. Cualquiera
              de las dos puede tener sentido según el caso de uso. Esta
              página separa los ejes.
            </>
          }
          en={
            <>
              If you landed here looking for "is this the same as SAIRI" or
              "why don't you use crypto", the short answer is: not the same,
              not better or worse, they are{" "}
              <strong>different layers of the same problem</strong>. Either
              can make sense depending on the use case. This page separates
              the axes.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L lang={lang} es="Quién es quién" en="Who is who" />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>$SAIRI / Santiago Siri:</strong> agente de IA
                tokenizado corriendo en Base (Coinbase L2). Wallet + modelo
                + token de governance. Connected projects: Democracy Earth,
                Proof of Humanity, WAGMI.law (intent → smart contract),
                faighters.com. Narrative: "Argentina = jurisdicción para AI
                corps tokenizadas".
              </>
            }
            en={
              <>
                <strong>$SAIRI / Santiago Siri:</strong> tokenised AI agent
                running on Base (Coinbase L2). Wallet + model + governance
                token. Connected projects: Democracy Earth, Proof of
                Humanity, WAGMI.law (intent → smart contract),
                faighters.com. Narrative: "Argentina = jurisdiction for
                tokenised AI corps".
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>ar-agents / Nazareno Clemente:</strong>{" "}
                infraestructura civil-comercial-OSS para que una
                sociedad-IA argentina opere bajo derecho positivo. 17
                paquetes npm + 5 RFCs + audit log forense. Sin token. Sin
                yield farming. Sin DeFi.
              </>
            }
            en={
              <>
                <strong>ar-agents / Nazareno Clemente:</strong>{" "}
                civil-commercial-OSS infrastructure for an Argentine
                AI-corp to operate under positive law. 17 npm packages + 5
                RFCs + forensic audit log. No token. No yield farming. No
                DeFi.
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="Ocho ejes de diferencia"
          en="Eight axes of difference"
        />
      </DocH2>
      <div style={{ overflowX: "auto", margin: "16px 0 24px" }}>
        <table style={tableSty}>
          <thead>
            <tr>
              <th style={thSty}>
                <L lang={lang} es="Eje" en="Axis" />
              </th>
              <th style={thStyAr}>ar-agents</th>
              <th style={thSty}>
                <L
                  lang={lang}
                  es="On-chain ($SAIRI / DAO LLC / etc.)"
                  en="On-chain ($SAIRI / DAO LLC / etc.)"
                />
              </th>
              <th style={thSty}>
                <L lang={lang} es="Implicancia" en="Implication" />
              </th>
            </tr>
          </thead>
          <tbody>
            {DIFFS.map((d) => (
              <tr
                key={d.axis.es}
                style={{ borderTop: "1px solid var(--border-color)" }}
              >
                <td style={tdLabelSty}>{d.axis[lang]}</td>
                <td style={tdArSty}>{d.arAgents[lang]}</td>
                <td style={tdSty}>{d.onChain[lang]}</td>
                <td style={tdImplSty}>{d.implication[lang]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocH2>
        <L
          lang={lang}
          es="Por qué no competimos"
          en="Why we do not compete"
        />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Audiencias distintas.</strong> ar-agents apunta a
                founders argentinos que quieren incorporar una sociedad-IA
                para <em>operar legalmente</em> en AR, facturar, contratar
                servicios, abrir cuenta bancaria, cumplir LPDP. $SAIRI
                apunta a crypto-natives + traders que quieren upside de un
                AI agent tokenizado.
              </>
            }
            en={
              <>
                <strong>Different audiences.</strong> ar-agents targets
                Argentine founders who want to incorporate an AI-corp to{" "}
                <em>operate legally</em> in AR, invoice, contract
                services, open a bank account, comply with the data
                protection law. $SAIRI targets crypto-natives + traders
                seeking upside from a tokenised AI agent.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Modelos de revenue distintos.</strong> ar-agents
                monetiza vía servicios (Cloud tier + Bespoke). $SAIRI
                monetiza vía apreciación del token + DeFi composability.
                No chocan.
              </>
            }
            en={
              <>
                <strong>Different revenue models.</strong> ar-agents
                monetises via services (Cloud tier + Bespoke). $SAIRI
                monetises via token appreciation + DeFi composability. No
                collision.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Tiempos distintos.</strong> El régimen Sturzenegger
                es debate legislativo prospectivo (2026-2027). $SAIRI ya
                existe on-chain hoy. Quien necesita un AI agent
                económicamente activo <em>ya</em>, va a on-chain. Quien
                quiere una entidad legal argentina con CUIT facturando a
                clientes locales, espera (o construye) la sociedad-IA.
              </>
            }
            en={
              <>
                <strong>Different timelines.</strong> The Sturzenegger
                regime is a prospective legislative debate (2026-2027).
                $SAIRI exists on-chain today. Whoever needs an
                economically active AI agent <em>now</em> goes on-chain.
                Whoever wants an Argentine legal entity with a CUIT
                invoicing local clients waits for (or builds) the AI-corp.
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
                  RFC-003 propone reciprocidad explícita.
                </strong>{" "}
                Una sociedad-IA argentina con CUIT puede transaccionar con
                $SAIRI (o cualquier DAO LLC Wyoming, MIDAO Marshall
                Islands) usando el envelope JSON portable de RFC-003. Los
                dos lados reconcilian audit logs. No es competencia, es
                interoperabilidad.{" "}
                <Link href={onChainRfc003} style={linkSty}>
                  /rfcs/003
                </Link>
              </>
            }
            en={
              <>
                <strong>
                  RFC-003 proposes explicit reciprocity.
                </strong>{" "}
                An Argentine AI-corp with a CUIT can transact with $SAIRI
                (or any Wyoming DAO LLC, Marshall Islands MIDAO) using
                RFC-003's portable JSON envelope. Both sides reconcile
                audit logs. Not competition, interoperability.{" "}
                <Link href={onChainRfc003} style={linkSty}>
                  /rfcs/003
                </Link>
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="Cuándo conviene cada pista"
          en="When to choose each track"
        />
      </DocH2>
      <div style={{ overflowX: "auto", margin: "16px 0" }}>
        <table style={tableSty}>
          <thead>
            <tr>
              <th style={thSty}>
                <L lang={lang} es="Caso de uso" en="Use case" />
              </th>
              <th style={thStyAr}>ar-agents</th>
              <th style={thSty}>
                <L lang={lang} es="On-chain" en="On-chain" />
              </th>
            </tr>
          </thead>
          <tbody>
            {USE_CASES.map((u) => (
              <tr
                key={u.label.es}
                style={{ borderTop: "1px solid var(--border-color)" }}
              >
                <td style={tdLabelSty}>{u.label[lang]}</td>
                <td style={tdArSty}>{u.ar[lang]}</td>
                <td style={tdSty}>{u.chain[lang]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocH2>
        <L
          lang={lang}
          es="El mensaje al asesor del Ministerio"
          en="The message to the Ministry advisor"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              Si el Ministerio está mirando $SAIRI como referencia para
              construir el régimen, vale la pena distinguir:{" "}
              <strong>
                el régimen de sociedades-IA que se diseñe no debería pensar
                en $SAIRI como caso típico
              </strong>
              . $SAIRI es un experimento de AI corp tokenizada sin
              jurisdicción. El caso típico de una sociedad-IA argentina va
              a ser otra cosa: una empresa con CUIT que tiene un agente
              como órgano de gobierno operativo, opera en pesos o USD
              oficial, paga impuestos, factura.
            </>
          }
          en={
            <>
              If the Ministry is looking at $SAIRI as a reference to build
              the regime, it is worth distinguishing:{" "}
              <strong>
                the AI-corp regime being designed should not treat $SAIRI
                as the typical case
              </strong>
              . $SAIRI is an experiment in a tokenised AI corp with no
              jurisdiction. The typical Argentine AI-corp will look
              different: a company with a CUIT that has an agent as its
              operational governance body, operates in pesos or official
              USD, pays taxes, invoices.
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              ar-agents apunta a ese caso típico, no al experimento
              on-chain. Ambos pueden coexistir gracias a RFC-003
              (cross-jurisdictional reciprocity), pero el régimen debería
              diseñarse para el caso típico, para que sea{" "}
              <em>adoptable</em> por founders argentinos que hoy
              constituyen SAS o pasan por Stripe Atlas.
            </>
          }
          en={
            <>
              ar-agents targets that typical case, not the on-chain
              experiment. Both can coexist thanks to RFC-003
              (cross-jurisdictional reciprocity), but the regime should be
              designed for the typical case, so that it is{" "}
              <em>adoptable</em> by Argentine founders who today
              incorporate a SAS or go through Stripe Atlas.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="Lecturas adicionales"
          en="Further reading"
        />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <Link
            href={
              lang === "es" ? "/jurisdicciones" : "/en/jurisdictions"
            }
            style={linkSty}
          >
            {lang === "es" ? "/jurisdicciones" : "/en/jurisdictions"}
          </Link>{" "}
          <L
            lang={lang}
            es=", comparación general con regímenes legales (Wyoming, Estonia, Marshall, Singapore) que sí tienen sustento estatal."
            en=", general comparison with legal regimes (Wyoming, Estonia, Marshall, Singapore) that do have state grounding."
          />
        </li>
        <li style={liSty}>
          <Link href="/rfcs/003" style={linkSty}>
            /rfcs/003
          </Link>{" "}
          <L
            lang={lang}
            es=", el envelope de reciprocidad que permite que ar-agents y experimentos on-chain interoperen."
            en=", the reciprocity envelope that lets ar-agents and on-chain experiments interoperate."
          />
        </li>
        <li style={liSty}>
          <Link
            href={lang === "es" ? "/manifiesto" : "/en/manifesto"}
            style={linkSty}
          >
            {lang === "es" ? "/manifiesto" : "/en/manifesto"}
          </Link>{" "}
          <L
            lang={lang}
            es=", declaración de principios de ar-agents (civil-comercial-OSS, no SIDE, no especulación, no token)."
            en=", ar-agents' statement of principles (civil-commercial-OSS, no SIDE, no speculation, no token)."
          />
        </li>
      </ul>

      <p
        style={{
          marginTop: 28,
          color: "var(--text-muted)",
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        <L
          lang={lang}
          es={
            <>
              <strong>Nota personal:</strong> Santi Siri ha aportado al
              ecosistema argentino de tecnología democrática y AI desde hace
              más de 15 años. Esta página separa proyectos, no opina sobre
              personas. Las dos pistas pueden enriquecer la conversación
              legislativa si se entienden como complementarias.
            </>
          }
          en={
            <>
              <strong>Personal note:</strong> Santi Siri has contributed
              to the Argentine democratic-tech and AI ecosystem for more
              than 15 years. This page separates projects, it does not
              opine on people. Both tracks can enrich the legislative
              conversation if read as complementary.
            </>
          }
        />
      </p>
    </DocShell>
  );
}

const tableSty: React.CSSProperties = {
  width: "100%",
  minWidth: 720,
  borderCollapse: "collapse",
  fontSize: 12.5,
  background: "var(--bg-tint)",
  borderRadius: 8,
  overflow: "hidden",
};

const thSty: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--border-color)",
};

const thStyAr: React.CSSProperties = {
  ...thSty,
  color: "var(--accent)",
};

const tdSty: React.CSSProperties = {
  padding: 12,
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "var(--text-body)",
  verticalAlign: "top",
};

const tdLabelSty: React.CSSProperties = {
  ...tdSty,
  fontWeight: 500,
  color: "var(--text)",
  whiteSpace: "nowrap",
  minWidth: 140,
};

const tdArSty: React.CSSProperties = {
  ...tdSty,
  background: "color-mix(in srgb, var(--accent) 6%, transparent)",
  color: "var(--text)",
};

const tdImplSty: React.CSSProperties = {
  ...tdSty,
  fontStyle: "italic",
};

const ulSty: React.CSSProperties = {
  paddingLeft: 24,
  marginBottom: 16,
};

const liSty: React.CSSProperties = {
  marginBottom: 8,
  lineHeight: 1.55,
};

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};
