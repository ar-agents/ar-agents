import { DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { JsonLd } from "../json-ld";

type Lang = "es" | "en";

interface BilingualRow {
  capa: { es: string; en: string };
  ar: { es: string; en: string };
  wyoming: { es: string; en: string };
  marshall: { es: string; en: string };
  estonia: { es: string; en: string };
  singapore: { es: string; en: string };
}

const ROWS: ReadonlyArray<BilingualRow> = [
  {
    capa: { es: "Identidad", en: "Identity" },
    ar: {
      es: "CUIT + Clave Fiscal Nivel 3-4 (AFIP/ARCA). Padrón consultable. @ar-agents/identity la wrappea.",
      en: "CUIT + Clave Fiscal level 3-4 (AFIP/ARCA). Queryable registry. @ar-agents/identity wraps it.",
    },
    wyoming: {
      es: "Filed entity con statement DAO + URL de smart contract en Articles of Organization (Wyoming Statutes Title 17 §17-31-106).",
      en: "Filed entity with DAO statement + smart-contract URL on Articles of Organization (Wyoming Statutes Title 17 §17-31-106).",
    },
    marshall: {
      es: "DAO LLC con operating agreement que referencia smart contract. Registered agent obligatorio = MIDAO.",
      en: "DAO LLC with operating agreement referencing the smart contract. Registered agent required = MIDAO.",
    },
    estonia: {
      es: "e-Residency: smartcard + Mobile-ID. eIDAS qualified electronic signature. Äriregister API pública.",
      en: "e-Residency: smartcard + Mobile-ID. eIDAS qualified electronic signature. Public Äriregister API.",
    },
    singapore: {
      es: "VCC: Variable Capital Company bajo ACRA. KYC obligatorio + AML. AI Verify para AI systems separado.",
      en: "VCC: Variable Capital Company under ACRA. Mandatory KYC + AML. AI Verify for AI systems is separate.",
    },
  },
  {
    capa: {
      es: "Firma con valor probatorio",
      en: "Signature with probative value",
    },
    ar: {
      es: "Firma Digital Ley 25.506 + certificado X.509 emitido por ARCA. CMS/PKCS#7. @ar-agents/firma-digital verifica.",
      en: "Digital Signature Law 25.506 + X.509 certificate issued by ARCA. CMS/PKCS#7. @ar-agents/firma-digital verifies.",
    },
    wyoming: {
      es: "Smart contract signatures (Ethereum addresses) + multisig. No estándar federal de probative-value.",
      en: "Smart-contract signatures (Ethereum addresses) + multisig. No federal probative-value standard.",
    },
    marshall: {
      es: "Operating agreement firmado por miembros + on-chain transactions. Sin spec normativa explícita.",
      en: "Operating agreement signed by members + on-chain transactions. No explicit normative spec.",
    },
    estonia: {
      es: "ASiC-E / BDOC containers con XAdES signatures (ETSI standards). Probative value en toda la UE.",
      en: "ASiC-E / BDOC containers with XAdES signatures (ETSI standards). Probative value across the EU.",
    },
    singapore: {
      es: "Singapore Standards CA con e-signature framework. ACRA-verified directors.",
      en: "Singapore Standards CA with e-signature framework. ACRA-verified directors.",
    },
  },
  {
    capa: { es: "Registro público", en: "Public registry" },
    ar: {
      es: "IGJ (Inspección General de Justicia), datos abiertos en datos.jus.gob.ar. @ar-agents/igj wrappea CKAN.",
      en: "IGJ (Inspección General de Justicia), open data at datos.jus.gob.ar. @ar-agents/igj wraps CKAN.",
    },
    wyoming: {
      es: "Wyoming Secretary of State business search. Free, web-only, no API documentada.",
      en: "Wyoming Secretary of State business search. Free, web-only, no documented API.",
    },
    marshall: {
      es: "registry.midao.org/public-registry, search box, no API pública.",
      en: "registry.midao.org/public-registry, search box, no public API.",
    },
    estonia: {
      es: "Äriregister vía X-Road (open-source data exchange). API completa, gratis, descargable.",
      en: "Äriregister via X-Road (open-source data exchange). Full API, free, downloadable.",
    },
    singapore: {
      es: "ACRA BizFile+, paid API, comprehensive corporate data.",
      en: "ACRA BizFile+, paid API, comprehensive corporate data.",
    },
  },
  {
    capa: { es: "Audit log normativo", en: "Normative audit log" },
    ar: {
      es: "RFC-004 propone append-only HMAC + Ed25519 dual-sign. Test vectors hex-exactos en /test-vectors.",
      en: "RFC-004 proposes append-only HMAC + Ed25519 dual-sign. Hex-exact test vectors at /test-vectors.",
    },
    wyoming: {
      es: "Smart contract events on-chain, inmutable por defecto. Sin spec normativa de cómo se debe estructurar.",
      en: "On-chain smart-contract events, immutable by default. No normative spec for structure.",
    },
    marshall: {
      es: "Idem Wyoming, confianza en el chain. Sin schema unificado.",
      en: "Same as Wyoming, trust in the chain. No unified schema.",
    },
    estonia: {
      es: "X-Road logs centralizados. Cada transacción firmada, timestamped, replicable.",
      en: "Centralized X-Road logs. Each transaction signed, timestamped, replicable.",
    },
    singapore: {
      es: "AI Verify Toolkit produce structured reports (Python, open-source). No es audit-log nativo de la entidad.",
      en: "AI Verify Toolkit produces structured reports (Python, open-source). Not a native audit log of the entity.",
    },
  },
  {
    capa: { es: "Spec citable", en: "Citable spec" },
    ar: {
      es: "RFC-001..006, drafts open-source, CC-BY-4.0. Hoy NO tienen DOI / archivo institucional. Aviso explícito en cada RFC.",
      en: "RFC-001..006, open-source drafts, CC-BY-4.0. Today NO DOI / institutional archive. Explicit disclaimer on every RFC.",
    },
    wyoming: {
      es: "Wyoming Statutes Title 17 Chapter 31, ley federal del estado. Citable inmediatamente.",
      en: "Wyoming Statutes Title 17 Chapter 31, state law. Immediately citable.",
    },
    marshall: {
      es: "RMI DAO Act 2022 + DAO Regulations 2024. Citable por número de acto.",
      en: "RMI DAO Act 2022 + DAO Regulations 2024. Citable by act number.",
    },
    estonia: {
      es: "eIDAS Regulation (EU 910/2014) + ETSI standards. Multinivel: ley UE + normas técnicas.",
      en: "eIDAS Regulation (EU 910/2014) + ETSI standards. Multi-level: EU law + technical norms.",
    },
    singapore: {
      es: "VCC Act 2018 (estatutorio) + AI Verify open-source framework.",
      en: "VCC Act 2018 (statutory) + AI Verify open-source framework.",
    },
  },
  {
    capa: { es: "Costo de incorporación", en: "Incorporation cost" },
    ar: {
      es: "Sociedad Automatizada definida en el anteproyecto (art. 14), aún no vigente. Hoy SAS estándar: tasas IGJ + escribano (~USD 200-500).",
      en: "Sociedad Automatizada defined in the draft bill (art. 14), not yet in force. Today standard SAS: IGJ fees + notary (~USD 200-500).",
    },
    wyoming: {
      es: "USD 100 + USD 50/year renewal + registered agent (~USD 100-200).",
      en: "USD 100 + USD 50/year renewal + registered agent (~USD 100-200).",
    },
    marshall: {
      es: "USD 6,000-9,500 incorporación + USD 2,000-5,000 anual. Caro.",
      en: "USD 6,000-9,500 incorporation + USD 2,000-5,000 annual. Expensive.",
    },
    estonia: {
      es: "EUR 25 + VAT por company. e-Residency card ~EUR 100-120.",
      en: "EUR 25 + VAT per company. e-Residency card ~EUR 100-120.",
    },
    singapore: {
      es: "SGD 300 incorporation + nominee director obligatorio (~SGD 1,500-3,000/year).",
      en: "SGD 300 incorporation + mandatory nominee director (~SGD 1,500-3,000/year).",
    },
  },
  {
    capa: { es: "Open-source", en: "Open-source" },
    ar: {
      es: "Todo: 36 packages MIT, 6 RFCs CC-BY-4.0, audit lib reference.",
      en: "Everything: 33 MIT packages, 6 CC-BY-4.0 RFCs, reference audit lib.",
    },
    wyoming: {
      es: "Statute is public domain. No reference implementation oficial, terceros como Otonomos.",
      en: "Statute is public domain. No official reference implementation, third parties like Otonomos.",
    },
    marshall: {
      es: "Statute público. MIDAO operación cerrada (PPP).",
      en: "Statute public. MIDAO operates as a closed PPP.",
    },
    estonia: {
      es: "X-Road open-source (Apache 2.0). DigiDoc4 client open-source. Toda la stack es OSS.",
      en: "X-Road open-source (Apache 2.0). DigiDoc4 client open-source. Whole stack is OSS.",
    },
    singapore: {
      es: "AI Verify Toolkit open-source (Apache 2.0). VCC framework propietario.",
      en: "AI Verify Toolkit open-source (Apache 2.0). VCC framework proprietary.",
    },
  },
];

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

export function JurisdiccionesContent({ lang }: { lang: Lang }) {
  return (
    <DocShell
      eyebrow={
        lang === "es"
          ? "jurisdicciones · comparativa · 2026-05"
          : "jurisdictions · comparison · 2026-05"
      }
      title={
        lang === "es"
          ? "Cómo se compara con otras jurisdicciones."
          : "How it compares to other jurisdictions."
      }
      subtitle={
        lang === "es"
          ? "Wyoming DAO LLC, Marshall Islands MIDAO, Estonia e-Residency, Singapore VCC + AI Verify. Cuatro precedentes legales para entidades algorítmicas. Cómo cada uno resuelve identidad, firma, registro y auditoría, y qué primitivas argentinas propone ar-agents como análogo."
          : "Wyoming DAO LLC, Marshall Islands MIDAO, Estonia e-Residency, Singapore VCC + AI Verify. Four legal precedents for algorithmic entities. How each one solves identity, signing, registry, and audit, and what Argentine primitives ar-agents proposes as an analogue."
      }
    >
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline:
            lang === "es"
              ? "Jurisdicciones comparadas para sociedades-IA argentinas"
              : "Jurisdictions compared for Argentine AI corporations",
          inLanguage: lang === "es" ? "es-AR" : "en-US",
          url:
            lang === "es"
              ? "https://ar-agents.ar/jurisdicciones"
              : "https://ar-agents.ar/en/jurisdictions",
          datePublished: "2026-05-13",
          author: { "@type": "Person", name: "Nazareno Clemente" },
        }}
      />

      <DocP>
        <L
          lang={lang}
          es={
            <>
              Argentina anunció el régimen de sociedades-IA el 28 de abril
              de 2026 y el anteproyecto de Ley General de Sociedades (que
              crea la <em>Sociedad Automatizada</em>, art. 14) está en el
              Senado desde el 1 de junio de 2026.{" "}
              <strong>
                Ningún otro país tiene exactamente esto
              </strong>
             , pero cuatro jurisdicciones ya resolvieron pedazos del
              problema. Esta página los enumera para que la conversación
              legislativa argentina no parta de cero.
            </>
          }
          en={
            <>
              Argentina announced the sociedades-IA regime on April 28,
              2026, and the General Companies Law draft bill (which creates
              the <em>Sociedad Automatizada</em>, art. 14) has been in the
              Senate since June 1, 2026.{" "}
              <strong>No other country has exactly this</strong>, but four
              jurisdictions have already solved pieces of the problem. This
              page enumerates them so the Argentine legislative conversation
              doesn't start from zero.
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              Lo que sigue es la única tabla comparativa de este tipo
              públicamente disponible para AR.{" "}
              <strong>Si encontrás un error, abrí un issue</strong> en{" "}
              <a
                href="https://github.com/ar-agents/ar-agents/issues"
                style={linkSty}
              >
                github.com/ar-agents/ar-agents/issues
              </a>
              .
            </>
          }
          en={
            <>
              What follows is the only comparison table of this kind
              publicly available for AR.{" "}
              <strong>If you find an error, open an issue</strong> at{" "}
              <a
                href="https://github.com/ar-agents/ar-agents/issues"
                style={linkSty}
              >
                github.com/ar-agents/ar-agents/issues
              </a>
              .
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="Tabla comparativa"
          en="Comparison table"
        />
      </DocH2>
      <div style={{ overflowX: "auto", margin: "24px 0" }}>
        <table
          style={{
            width: "100%",
            minWidth: 720,
            borderCollapse: "collapse",
            fontSize: 13,
            background: "var(--bg-tint)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <thead style={{ background: "var(--bg-tint)" }}>
            <tr>
              <th style={thSty}>
                <L lang={lang} es="Capa" en="Layer" />
              </th>
              <th style={thStyAr}>
                <L
                  lang={lang}
                  es="Argentina (propuesta)"
                  en="Argentina (proposal)"
                />
              </th>
              <th style={thSty}>Wyoming DAO LLC</th>
              <th style={thSty}>Marshall Islands MIDAO</th>
              <th style={thSty}>Estonia e-Residency</th>
              <th style={thSty}>Singapore VCC + AI Verify</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr
                key={r.capa.es}
                style={{ borderTop: "1px solid var(--border-color)" }}
              >
                <td style={tdRowSty}>{r.capa[lang]}</td>
                <td style={tdArSty}>{r.ar[lang]}</td>
                <td style={tdSty}>{r.wyoming[lang]}</td>
                <td style={tdSty}>{r.marshall[lang]}</td>
                <td style={tdSty}>{r.estonia[lang]}</td>
                <td style={tdSty}>{r.singapore[lang]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocH2>
        <L
          lang={lang}
          es="Qué unlock le da a Argentina cada precedente"
          en="What each precedent unlocks for Argentina"
        />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Wyoming (2021).</strong> Modelo: el statute exige,
                en el documento mismo de constitución, un identificador
                público y machine-resolvable del software que opera la
                entidad. <strong>Aplicación AR:</strong> requerir una URL de{" "}
                <DocCode>manifest.json</DocCode> + content hash en la
                inscripción IGJ. Cita: Wyoming Statutes Title 17 §17-31-106.
              </>
            }
            en={
              <>
                <strong>Wyoming (2021).</strong> Model: on the founding
                document itself, the statute requires a public,
                machine-resolvable identifier of the software operating the
                entity. <strong>AR application:</strong> require a{" "}
                <DocCode>manifest.json</DocCode> URL + content hash on IGJ
                registration. Citation: Wyoming Statutes Title 17
                §17-31-106.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Estonia (2014+).</strong> Modelo: identidad digital
                + firma con valor probatorio + registry público abierto,
                todo interoperable vía X-Road.{" "}
                <strong>Aplicación AR:</strong> AR ya tiene Firma Digital
                (Ley 25.506), padrón CUIT/ARCA e IGJ datos abiertos. Falta
                el equivalente al container ASiC-E y la capa X-Road.
                ar-agents lo empieza a llenar con{" "}
                <DocCode>@ar-agents/firma-digital</DocCode> y{" "}
                <DocCode>@ar-agents/identity</DocCode>.
              </>
            }
            en={
              <>
                <strong>Estonia (2014+).</strong> Model: digital identity +
                probative-value signature + open public registry, all
                interoperable via X-Road.{" "}
                <strong>AR application:</strong> AR already has Digital
                Signature (Law 25.506), CUIT/ARCA registry, and IGJ open
                data. What's missing is the ASiC-E container equivalent and
                the X-Road layer. ar-agents starts to fill this with{" "}
                <DocCode>@ar-agents/firma-digital</DocCode> and{" "}
                <DocCode>@ar-agents/identity</DocCode>.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Marshall Islands (2022).</strong> Modelo: primer
                estatuto nacional explícito de DAO. Demuestra que un
                país chico puede legitimar la figura sin esperar
                consenso global. <strong>Aplicación AR:</strong>{" "}
                Argentina puede ser el primer país sudamericano con
                sociedad-IA, sin necesidad de coordinar con G20 ni
                Mercosur.
              </>
            }
            en={
              <>
                <strong>Marshall Islands (2022).</strong> Model: first
                explicit national DAO statute. Proves a small country
                can legitimize the figure without waiting for global
                consensus. <strong>AR application:</strong> Argentina
                can be the first South American country with
                sociedad-IA, without coordinating with G20 or Mercosur.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Singapore (2018 + 2022).</strong> Modelo: VCC
                para flexibilidad societaria + AI Verify para auditoría
                de sistemas AI con framework open-source.{" "}
                <strong>Aplicación AR:</strong> AI Verify es{" "}
                <strong>directamente copiable</strong>, Python, Apache
                2.0. ar-agents podría shippear un{" "}
                <DocCode>@ar-agents/verify</DocCode> análogo.
              </>
            }
            en={
              <>
                <strong>Singapore (2018 + 2022).</strong> Model: VCC for
                corporate flexibility + AI Verify for AI-system auditing
                with an open-source framework.{" "}
                <strong>AR application:</strong> AI Verify is{" "}
                <strong>directly copyable</strong>, Python, Apache
                2.0. ar-agents could ship an analogous{" "}
                <DocCode>@ar-agents/verify</DocCode>.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Suiza (2021 DLT Act).</strong> Modelo: blanket
                act que amenda 10 leyes existentes en vez de crear un
                régimen nuevo.{" "}
                <strong>Contraste con AR:</strong> el anteproyecto eligió
                la vía opuesta, una Ley General de Sociedades nueva que
                reemplaza la 19.550 (art. 270) e integra la Sociedad
                Automatizada (art. 14) y la Sociedad Descentralizada
                Autónoma Operativa (DAO, arts. 258-265) en un solo cuerpo,
                en vez de parchear el Código Civil y Comercial + la Ley
                25.506.
              </>
            }
            en={
              <>
                <strong>Switzerland (2021 DLT Act).</strong> Model:
                blanket act that amends 10 existing laws instead of
                creating a new regime.{" "}
                <strong>Contrast with AR:</strong> the draft bill took the
                opposite path, a new General Companies Law that replaces
                Law 19.550 (art. 270) and folds the Sociedad Automatizada
                (art. 14) and the Sociedad Descentralizada Autónoma
                Operativa (DAO, arts. 258-265) into a single body, rather
                than patching the Civil and Commercial Code + Law 25.506.
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="Qué Argentina tiene que ningún precedente tiene"
          en="What Argentina has that no precedent has"
        />
      </DocH2>
      <DocP>
        <L lang={lang} es="Un combo único:" en="A unique combination:" />
      </DocP>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Voluntad política explícita</strong> de un
                ministro en función declarando públicamente el régimen
                (28-abr-2026). Wyoming/Estonia tardaron años en
                construir el momentum; AR arranca con él dado.
              </>
            }
            en={
              <>
                <strong>Explicit political will</strong> from a sitting
                minister publicly declaring the regime (2026-04-28).
                Wyoming/Estonia took years to build that momentum; AR
                starts with it given.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Toda la stack ya escrita</strong> en open-source
                bajo MIT mientras el anteproyecto se debate en el Senado.
                Wyoming, Estonia, Marshall, Singapore tuvieron la ley
                primero y la implementación después; AR llega con la
                implementación lista antes de la sanción.
              </>
            }
            en={
              <>
                <strong>The full stack already written</strong> in
                open-source under MIT while the draft bill is debated in
                the Senate. Wyoming, Estonia, Marshall, Singapore had the
                law first and the implementation later; AR arrives with the
                implementation ready before enactment.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Audit log dual-sign HMAC + Ed25519</strong> con
                test vectors hex-exactos como parte de la spec. Ningún
                otro régimen tiene esto a nivel normativo.
              </>
            }
            en={
              <>
                <strong>Dual-sign HMAC + Ed25519 audit log</strong>{" "}
                with hex-exact test vectors as part of the spec. No
                other regime has this at the normative level.
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="Diferenciación honesta vs $SAIRI / WAGMI.law on-chain"
          en="Honest differentiation vs $SAIRI / WAGMI.law on-chain"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              Santiago Siri propone <strong>$SAIRI on Base mainnet</strong>{" "}
              como AI agent tokenizado, y WAGMI.law como traductor
              natural-language → smart contract. Es otra pista que la de
              ar-agents:
            </>
          }
          en={
            <>
              Santiago Siri proposes <strong>$SAIRI on Base mainnet</strong>{" "}
              as a tokenized AI agent, and WAGMI.law as a natural-language →
              smart-contract translator. It's a different track from
              ar-agents:
            </>
          }
        />
      </DocP>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>$SAIRI</strong> es civil-cripto, sin
                jurisdicción declarada, sin CUIT-análogo, sin firma con
                valor probatorio contra el Estado argentino, sin AFIP.
                Vale como narrativa financiera y como experimento
                técnico.{" "}
                <strong>
                  No vale como infraestructura para que una empresa
                  argentina facture, pague impuestos, o sea
                  inspeccionable por AAIP.
                </strong>
              </>
            }
            en={
              <>
                <strong>$SAIRI</strong> is civil-crypto, no declared
                jurisdiction, no CUIT analogue, no probative-value
                signature against the Argentine state, no AFIP. It
                works as financial narrative and as a technical
                experiment.{" "}
                <strong>
                  It does not work as infrastructure for an Argentine
                  company to invoice, pay taxes, or be inspectable by
                  AAIP.
                </strong>
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>ar-agents</strong> es civil-comercial, sin
                token, con CUIT del operador, con firma X.509 contra
                ARCA, con audit log inspeccionable.{" "}
                <strong>No es un competidor de $SAIRI</strong>: son dos
                pistas complementarias. $SAIRI demuestra el experimento;
                ar-agents provee la capa que el Estado puede regular.
              </>
            }
            en={
              <>
                <strong>ar-agents</strong> is civil-commercial, no
                token, operator CUIT, X.509 signature against ARCA,
                inspectable audit log.{" "}
                <strong>Not a $SAIRI competitor</strong>: they're two
                complementary tracks. $SAIRI demonstrates the
                experiment; ar-agents provides the layer the state can
                regulate.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="RFC-003 incluso prevé un envelope para reciprocidad cross-jurisdiccional: una sociedad-IA argentina puede operar con una entidad on-chain (DAO LLC Wyoming, MIDAO, $SAIRI) y ambos lados reconcilian audit logs."
            en="RFC-003 even provides an envelope for cross-jurisdictional reciprocity: an Argentine AI corporation can transact with an on-chain entity (Wyoming DAO LLC, MIDAO, $SAIRI) and both sides reconcile audit logs."
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="Lo que ar-agents NO hace (vs los precedentes)"
          en="What ar-agents does NOT do (vs the precedents)"
        />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>No tiene custodia institucional</strong>.
                Wyoming es un Estado; Estonia es un Estado; MIDAO es
                PPP. ar-agents es un dev independiente. Esto es un
                riesgo de continuidad.
              </>
            }
            en={
              <>
                <strong>No institutional custody</strong>. Wyoming is a
                state; Estonia is a state; MIDAO is a PPP. ar-agents is
                an independent developer. This is a continuity risk.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>No tiene DOI / archivo inmutable</strong> de los
                RFCs. Wyoming Title 17 está en LexisNexis; eIDAS está
                en EUR-Lex. ar-agents está en una URL{" "}
                <DocCode>vercel.app</DocCode> mutable. Próximo paso:
                Zenodo.
              </>
            }
            en={
              <>
                <strong>No DOI / immutable archive</strong> for the
                RFCs. Wyoming Title 17 lives in LexisNexis; eIDAS in
                EUR-Lex. ar-agents lives on a mutable{" "}
                <DocCode>vercel.app</DocCode> URL. Next step: Zenodo.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>No tiene casos productivos</strong>. Wyoming tiene
                ~4,000 DAO LLCs; Estonia, 139,000+ e-residents; ar-agents, 5
                deploys del mismo CUIT. Falta que la ley se sancione y que
                operadores reales la adopten.
              </>
            }
            en={
              <>
                <strong>No productive cases yet</strong>. Wyoming has ~4,000
                DAO LLCs; Estonia, 139,000+ e-residents; ar-agents, 5 deploys
                from the same CUIT. The law still needs to be enacted and
                real operators need to adopt it.
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
                  No reemplaza asesoramiento jurídico profesional
                </strong>
                . Los textos de <DocCode>/legislacion</DocCode> son
                sugerencias técnicas que requieren revisión por abogados
                matriculados antes de cualquier adopción legislativa.
              </>
            }
            en={
              <>
                <strong>Does not replace professional legal advice</strong>
                . The texts at <DocCode>/legislation</DocCode> are
                technical suggestions that require review by licensed
                attorneys before any legislative adoption.
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L lang={lang} es="Referencias" en="References" />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          Wyoming Statutes Title 17 Chapter 31, {" "}
          <a
            href="https://law.justia.com/codes/wyoming/title-17/chapter-31/"
            style={linkSty}
          >
            law.justia.com/codes/wyoming/title-17/chapter-31
          </a>
        </li>
        <li style={liSty}>
          Marshall Islands DAO Act 2022 +{" "}
          <a href="https://midao.org" style={linkSty}>
            midao.org
          </a>
        </li>
        <li style={liSty}>
          Estonia e-Residency, {" "}
          <a href="https://e-resident.gov.ee" style={linkSty}>
            e-resident.gov.ee
          </a>{" "}
          + X-Road{" "}
          <a
            href="https://e-estonia.com/solutions/interoperability-services/x-road/"
            style={linkSty}
          >
            e-estonia.com/.../x-road
          </a>
        </li>
        <li style={liSty}>
          Singapore VCC Act 2018 + AI Verify Foundation, {" "}
          <a href="https://aiverifyfoundation.sg/" style={linkSty}>
            aiverifyfoundation.sg
          </a>
        </li>
        <li style={liSty}>
          EU AI Act Article 50 (enforceable 2-Aug-2026), {" "}
          <a
            href="https://artificialintelligenceact.eu/article/50/"
            style={linkSty}
          >
            artificialintelligenceact.eu/article/50
          </a>
        </li>
      </ul>
    </DocShell>
  );
}

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
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
  verticalAlign: "top",
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
  minWidth: 140,
};

const tdArSty: React.CSSProperties = {
  ...tdSty,
  color: "var(--text)",
  background: "color-mix(in srgb, var(--accent) 6%, transparent)",
};

const tdRowSty: React.CSSProperties = {
  ...tdSty,
  fontWeight: 600,
  color: "var(--text)",
  whiteSpace: "nowrap",
};

const ulSty: React.CSSProperties = {
  paddingLeft: 24,
  marginBottom: 16,
};

const liSty: React.CSSProperties = {
  marginBottom: 12,
  lineHeight: 1.55,
};
