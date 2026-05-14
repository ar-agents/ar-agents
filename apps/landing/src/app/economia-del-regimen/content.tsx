import Link from "next/link";
import { DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import type { Lang } from "../i18n";

/**
 * Shared bilingual content for `/economia-del-regimen` (ES, default)
 * and `/en/regime-economics` (EN). Renders the same numeric tables in
 * both languages, only labels + commentary change. Numbers are
 * jurisdictional facts; they don't translate.
 */

const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

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

interface RowCell {
  es: string;
  en: string;
}

type RowDef = ReadonlyArray<RowCell>;

const T = (lang: Lang) => ({
  eyebrow:
    lang === "es"
      ? "economía · análisis cuantitativo · 2026-05"
      : "economics · quantitative analysis · 2026-05",
  title:
    lang === "es"
      ? "Economía del régimen de sociedades-IA."
      : "Economics of the AI-corporation regime.",
  subtitle:
    lang === "es"
      ? "Lo que la conversación pública sobre el régimen de sociedades-IA no está cuantificando: cuánto cuesta constituir una entidad-agente, cuánto cuesta operarla 24 meses, y dónde Argentina es estructuralmente competitiva. Para asesores económicos, periodistas tech-business, y founders evaluando dónde radicar."
      : "What the public conversation around Argentina's AI-corporation regime is not quantifying: how much it costs to incorporate an agent-entity, how much it costs to operate it for 24 months, and where Argentina is structurally competitive. For economic advisors, tech-business journalists, and founders deciding where to incorporate.",
});

export function EconomiaContent({ lang }: { lang: Lang }) {
  const t = T(lang);

  return (
    <DocShell eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle}>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>Tesis central.</strong> El régimen anunciado por el
              Ministro Sturzenegger puede ser estructuralmente competitivo
              en costo total de operación, pero{" "}
              <em>solo si la capa técnica existe y es soberana</em>. Si los
              founders argentinos terminan usando Stripe + Twilio + AWS para
              sus flujos críticos, el diferencial colapsa y AR se vuelve
              punto de paso hacia Delaware o Wyoming. La existencia de un
              toolkit AR-soberano open-source (ar-agents) es la diferencia
              entre <em>capturar valor</em> y{" "}
              <em>ser una ventanilla de tránsito</em>.
            </>
          }
          en={
            <>
              <strong>Central thesis.</strong> The regime announced by
              Minister Sturzenegger can be structurally competitive on
              total cost of operation, but{" "}
              <em>only if the technical layer exists and is sovereign</em>.
              If Argentine founders end up using Stripe + Twilio + AWS for
              their critical flows, the differential collapses and AR
              becomes a way-station to Delaware or Wyoming. The existence
              of an AR-sovereign open-source toolkit (ar-agents) is the
              difference between <em>capturing value</em> and{" "}
              <em>being a transit window</em>.
            </>
          }
        />
      </DocP>

      <div
        style={{
          padding: 14,
          background: "var(--bg-tint)",
          borderLeft: "3px solid var(--accent)",
          borderRadius: 4,
          margin: "16px 0 28px",
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        <L
          lang={lang}
          es={
            <>
              <strong>Honestidad metodológica.</strong> Las cifras
              siguientes son aproximaciones a tasa oficial USD MEP al{" "}
              <DocCode>2026-05-13</DocCode>. Cubren <em>costos directos</em>{" "}
              (tasas regulatorias, registered agent, certificados,
              contabilidad básica); <em>excluyen</em> banking setup, costos
              de litigio potencial, gastos personales del operador. Fuentes
              primarias citadas al final.
            </>
          }
          en={
            <>
              <strong>Methodological honesty.</strong> The figures below
              are approximations at the official USD MEP rate of{" "}
              <DocCode>2026-05-13</DocCode>. They cover{" "}
              <em>direct costs</em> (regulatory fees, registered agent,
              certificates, basic accounting); they <em>exclude</em>{" "}
              banking setup, potential litigation costs, and the operator's
              personal expenses. Primary sources cited at the end.
            </>
          }
        />
      </div>

      <DocH2>
        <L
          lang={lang}
          es="1 · Costo de constitución (one-shot)"
          en="1 · Incorporation cost (one-shot)"
        />
      </DocH2>
      <div style={{ overflowX: "auto", margin: "16px 0" }}>
        <table style={tableSty}>
          <thead>
            <tr>
              <th style={thSty}>
                <L lang={lang} es="Jurisdicción" en="Jurisdiction" />
              </th>
              <th style={thStyR}>
                <L lang={lang} es="Costo formal" en="Formal cost" />
              </th>
              <th style={thStyR}>
                <L lang={lang} es="Total + setup" en="Total + setup" />
              </th>
              <th style={thSty}>
                <L lang={lang} es="Tiempo" en="Time" />
              </th>
              <th style={thSty}>
                <L lang={lang} es="Presencia local" en="Local presence" />
              </th>
            </tr>
          </thead>
          <tbody>
            {INCORP_ROWS.map((row, i) => (
              <Row key={i} cells={row.cells} highlight={row.highlight} lang={lang} />
            ))}
          </tbody>
        </table>
      </div>

      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>Conclusión preliminar:</strong> Argentina (sociedad-IA)
              y Wyoming/Estonia son estructuralmente comparables en costo de
              constitución. Marshall Islands sale del menú por costo.
              Delaware es el default global por reputación, no por costo.
            </>
          }
          en={
            <>
              <strong>Preliminary conclusion:</strong> Argentina (AI-corp)
              and Wyoming/Estonia are structurally comparable on
              incorporation cost. Marshall Islands is off the menu on cost.
              Delaware is the global default by reputation, not by cost.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="2 · Costo operativo a 24 meses (TCO)"
          en="2 · 24-month operating cost (TCO)"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es="Una sociedad-IA opera 24 meses. Cargas anuales típicas: fee de renovación, contabilidad básica, tasas + impuestos mínimos sin ingresos (presunción), infraestructura técnica."
          en="An AI-corp operates for 24 months. Typical annual loads: renewal fee, basic accounting, minimum fees + taxes assuming no revenue, technical infrastructure."
        />
      </DocP>
      <div style={{ overflowX: "auto", margin: "16px 0" }}>
        <table style={tableSty}>
          <thead>
            <tr>
              <th style={thSty}>
                <L lang={lang} es="Jurisdicción" en="Jurisdiction" />
              </th>
              <th style={thStyR}>
                <L lang={lang} es="Constitución" en="Incorporation" />
              </th>
              <th style={thStyR}>
                <L
                  lang={lang}
                  es="Operación anual"
                  en="Annual operations"
                />
              </th>
              <th style={thStyR}>
                <L
                  lang={lang}
                  es="Infra técnica (24m)"
                  en="Tech infra (24m)"
                />
              </th>
              <th style={thStyR}>
                <L lang={lang} es="Total 24 meses" en="Total 24 months" />
              </th>
            </tr>
          </thead>
          <tbody>
            {TCO_ROWS.map((row, i) => (
              <Row key={i} cells={row.cells} highlight={row.highlight} lang={lang} />
            ))}
          </tbody>
        </table>
      </div>

      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>Lectura:</strong> en 24 meses, una sociedad-IA
              argentina sobre ar-agents self-hosted compite directamente con
              Wyoming en TCO. Si necesita hosting managed + auditoría
              regulator-ready (Cloud Studio), sube a USD 2.700, todavía por
              debajo de Delaware. MIDAO sale del menú por costo. Estonia es
              el competidor más cercano si los founders priorizan el sello
              EU.
            </>
          }
          en={
            <>
              <strong>Reading:</strong> over 24 months, an Argentine AI-corp
              on self-hosted ar-agents competes directly with Wyoming on
              TCO. If it needs managed hosting + regulator-ready audit
              (Cloud Studio), it rises to USD 2,700, still below Delaware.
              MIDAO falls off the menu on cost. Estonia is the closest
              competitor if founders prioritise the EU seal.
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>
                El cuadro de abajo es el que vale para el debate
                legislativo:
              </strong>{" "}
              el régimen AR no necesita "ganar por precio", necesita{" "}
              <em>no perder</em> contra las opciones comparables. A nivel
              TCO, ya está ahí. El diferencial se decide en otros ejes:
              seguridad jurídica, calidad de la infraestructura técnica, y
              reputación internacional. Los tres son construibles.
            </>
          }
          en={
            <>
              <strong>
                The frame that matters for the legislative debate:
              </strong>{" "}
              the AR regime does not need to "win on price", it needs to{" "}
              <em>not lose</em> against comparable options. On TCO, it is
              already there. The differential is decided on other axes:
              legal certainty, quality of technical infrastructure, and
              international reputation. The three are buildable.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="3 · Valor capturado por jurisdicción"
          en="3 · Value captured by jurisdiction"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es="Si una sociedad-IA factura USD 100.000/año, ¿quién captura qué? Aproximación al primer año de operación (números redondeados):"
          en="If an AI-corp invoices USD 100,000/year, who captures what? Approximation for the first year of operation (rounded numbers):"
        />
      </DocP>
      <div style={{ overflowX: "auto", margin: "16px 0" }}>
        <table style={tableSty}>
          <thead>
            <tr>
              <th style={thSty}>
                <L lang={lang} es="Jurisdicción" en="Jurisdiction" />
              </th>
              <th style={thStyR}>
                <L
                  lang={lang}
                  es="Impuesto a las ganancias"
                  en="Income tax"
                />
              </th>
              <th style={thStyR}>
                <L
                  lang={lang}
                  es="Impuesto al valor agregado"
                  en="Value-added tax"
                />
              </th>
              <th style={thStyR}>
                <L
                  lang={lang}
                  es="Fees regulatorias"
                  en="Regulatory fees"
                />
              </th>
              <th style={thStyR}>
                <L lang={lang} es="Captura local" en="Local capture" />
              </th>
            </tr>
          </thead>
          <tbody>
            {VALUE_ROWS.map((row, i) => (
              <Row key={i} cells={row.cells} highlight={row.highlight} lang={lang} />
            ))}
          </tbody>
        </table>
      </div>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>El argumento económico real:</strong> Argentina
              captura más valor fiscal por sociedad incorporada que Wyoming
              o Estonia. Si la ley se ejecuta bien y atrae aunque sea 5.000
              sociedades-IA argentinas operando con facturación media de
              USD 100K/año, el régimen aporta USD 150-175 millones anuales
              en captura fiscal directa, sin contar empleo formal generado
              por integradores + servicios + auditores. Esa es la
              oportunidad económica cuantitativa.
            </>
          }
          en={
            <>
              <strong>The real economic argument:</strong> Argentina
              captures more fiscal value per incorporated company than
              Wyoming or Estonia. If the law executes well and attracts
              even 5,000 Argentine AI-corps operating at an average USD
              100K/year in revenue, the regime delivers USD 150-175 million
              annually in direct fiscal capture, before counting formal
              employment generated by integrators + services + auditors.
              That is the quantitative economic opportunity.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="4 · Empleo formal estimado"
          en="4 · Estimated formal employment"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es="Cada sociedad-IA argentina, sin importar lo autónoma que sea técnicamente, va a requerir:"
          en="Every Argentine AI-corp, no matter how technically autonomous, will require:"
        />
      </DocP>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>1 contador matriculado</strong> (Ley General de
                Sociedades, cierre fiscal anual, balance).
              </>
            }
            en={
              <>
                <strong>1 licensed accountant</strong> (General Companies
                Law, annual fiscal closing, balance sheet).
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>1 abogado o consultor jurídico</strong>{" "}
                (constitución, modificación de estatutos, eventual
                litigio).
              </>
            }
            en={
              <>
                <strong>1 lawyer or legal consultant</strong>{" "}
                (incorporation, bylaw amendments, potential litigation).
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Servicios de auditoría</strong> (interna + eventual
                externa para sociedades de mayor envergadura).
              </>
            }
            en={
              <>
                <strong>Audit services</strong> (internal + eventually
                external for larger companies).
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Infraestructura técnica</strong> (developer ops si
                la sociedad self-hostea, o suscripción Cloud si terceriza).
              </>
            }
            en={
              <>
                <strong>Technical infrastructure</strong> (developer ops
                if the company self-hosts, or Cloud subscription if it
                outsources).
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
              Si el régimen atrae 5.000 sociedades-IA productivas en 24
              meses, el empleo formal indirecto generado se aproxima a
              <strong>
                {" "}
                2.000-3.000 puestos especializados
              </strong>{" "}
              (contadores + abogados + dev ops + auditores). No es la
              fábrica de empleos masiva, pero es empleo de alta
              calificación, en sectores que el país ya tiene capacidad
              instalada.
            </>
          }
          en={
            <>
              If the regime attracts 5,000 productive AI-corps in 24
              months, indirect formal employment generated approaches
              <strong>
                {" "}
                2,000-3,000 specialised positions
              </strong>{" "}
              (accountants + lawyers + dev ops + auditors). Not the mass
              employment factory, but high-skill employment in sectors
              where the country already has installed capacity.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L
          lang={lang}
          es="5 · Cuándo Argentina pierde el match"
          en="5 · When Argentina loses the match"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              El argumento <em>contra</em>:
            </>
          }
          en={
            <>
              The argument <em>against</em>:
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
                <strong>Reputación jurídica internacional.</strong>{" "}
                Delaware es el default por 100 años de jurisprudencia +
                Court of Chancery. AR no puede competir en ese eje. La
                compensación es en costo + velocidad + jurisdicción de
                proximidad para founders latinoamericanos.
              </>
            }
            en={
              <>
                <strong>International legal reputation.</strong>{" "}
                Delaware is the default thanks to 100 years of case law +
                Court of Chancery. AR cannot compete on that axis. The
                trade-off is cost + speed + proximity jurisdiction for
                Latin American founders.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Cepo cambiario + restricciones operativas.</strong>{" "}
                Si la sociedad-IA argentina factura en USD, retirar esos
                dólares al exterior tiene fricción regulatoria que no
                existe en Wyoming o Estonia. El régimen debería contemplar
                régimen especial de divisas o el incentivo se diluye para
                founders internacionales.
              </>
            }
            en={
              <>
                <strong>FX controls + operational restrictions.</strong>{" "}
                If the Argentine AI-corp invoices in USD, withdrawing
                those dollars abroad faces regulatory friction that does
                not exist in Wyoming or Estonia. The regime should provide
                a special FX framework or the incentive dilutes for
                international founders.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Volatilidad macro.</strong> Cambio de gobierno en
                octubre 2027 puede revertir el régimen. Estonia, Wyoming,
                Delaware tienen continuidad multi-administración. Esto es
                el factor más sensible para founders extranjeros.
              </>
            }
            en={
              <>
                <strong>Macro volatility.</strong> A change of government
                in October 2027 could reverse the regime. Estonia,
                Wyoming, Delaware have multi-administration continuity.
                This is the most sensitive factor for foreign founders.
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
                  Falta de capital de riesgo local especializado en AI
                  corps.
                </strong>{" "}
                Si una sociedad-IA argentina necesita levantar Serie A,
                sigue dependiendo de VCs USA/UK. Estonia mitiga esto con
                e-Residency program; AR aún no tiene equivalente.
              </>
            }
            en={
              <>
                <strong>
                  Lack of local VC specialised in AI corps.
                </strong>{" "}
                If an Argentine AI-corp needs to raise a Series A, it
                still depends on US/UK VCs. Estonia mitigates this through
                its e-Residency program; AR still has no equivalent.
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="6 · Para la cobertura periodística"
          en="6 · For press coverage"
        />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es="Los tres titulares que se pueden defender con estas cifras:"
          en="The three headlines defensible with these figures:"
        />
      </DocP>
      <ol style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>
                  "Argentina podría capturar USD 150-175M anuales en
                  captura fiscal si el régimen de sociedades-IA atrae 5.000
                  entidades en sus primeros 24 meses."
                </strong>{" "}
                Es número fundamentable.
              </>
            }
            en={
              <>
                <strong>
                  "Argentina could capture USD 150-175M annually in fiscal
                  revenue if the AI-corp regime attracts 5,000 entities in
                  its first 24 months."
                </strong>{" "}
                Defensible number.
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
                  "AR sociedad-IA cuesta menos operativamente que Delaware
                  o MIDAO; está al nivel de Wyoming y Estonia."
                </strong>{" "}
                Defendible vs benchmark internacional.
              </>
            }
            en={
              <>
                <strong>
                  "AR's AI-corp costs less to operate than Delaware or
                  MIDAO; it sits at Wyoming and Estonia levels."
                </strong>{" "}
                Defensible against the international benchmark.
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
                  "La capa técnica que el régimen necesita ya existe, es
                  open-source, y la construyó un dev argentino solo. La
                  alternativa era importarla."
                </strong>{" "}
                Es el ángulo soberanía tech.
              </>
            }
            en={
              <>
                <strong>
                  "The technical layer the regime needs already exists,
                  is open-source, and was built by a single Argentine dev.
                  The alternative was to import it."
                </strong>{" "}
                That is the tech-sovereignty angle.
              </>
            }
          />
        </li>
      </ol>

      <DocH2>
        <L lang={lang} es="7 · Fuentes" en="7 · Sources" />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es="Wyoming SOS DAO LLC fees:"
            en="Wyoming SOS DAO LLC fees:"
          />{" "}
          <a
            href="https://sos.wyo.gov/Business/StartABusiness.aspx"
            style={linkSty}
          >
            sos.wyo.gov/Business/StartABusiness.aspx
          </a>
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="Estonia e-Residency pricing:"
            en="Estonia e-Residency pricing:"
          />{" "}
          <a
            href="https://e-resident.gov.ee/start-a-company/"
            style={linkSty}
          >
            e-resident.gov.ee/start-a-company
          </a>
        </li>
        <li style={liSty}>
          <L lang={lang} es="MIDAO pricing:" en="MIDAO pricing:" />{" "}
          <a href="https://midao.org/pricing" style={linkSty}>
            midao.org/pricing
          </a>
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="Stripe Atlas (Delaware):"
            en="Stripe Atlas (Delaware):"
          />{" "}
          <a href="https://stripe.com/atlas" style={linkSty}>
            stripe.com/atlas
          </a>
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="Singapore ACRA VCC fees:"
            en="Singapore ACRA VCC fees:"
          />{" "}
          <a href="https://www.acra.gov.sg" style={linkSty}>
            acra.gov.sg
          </a>
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="AFIP/ARCA monotributo + ganancias:"
            en="AFIP/ARCA monotributo + income tax:"
          />{" "}
          <a href="https://www.afip.gob.ar" style={linkSty}>
            afip.gob.ar
          </a>
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="Estimación de captura fiscal: modelo simple con tasas oficiales + supuesto de facturación promedio USD 100K/año por sociedad. Ajustable según composición monotributo vs responsable inscripto."
            en="Fiscal-capture estimate: simple model with official rates + assumed average USD 100K/year invoicing per company. Adjustable by monotributo vs responsable inscripto mix."
          />
        </li>
      </ul>

      <DocH2>
        <L lang={lang} es="8 · Caveats" en="8 · Caveats" />
      </DocH2>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                Tasa AFIP/ARCA puede cambiar; tasa cambiaria también. Las
                cifras son al <DocCode>2026-05-13</DocCode>.
              </>
            }
            en={
              <>
                AFIP/ARCA rates can change; the FX rate too. Figures are
                as of <DocCode>2026-05-13</DocCode>.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="No incluye costos potenciales de litigio, AAIP sanctions, fines BCRA, ni infracciones IGJ."
            en="Does not include potential litigation costs, AAIP sanctions, BCRA fines, or IGJ infractions."
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es="La estimación de “5.000 sociedades en 24 meses” es un escenario de upside razonable, no proyección oficial. Para comparación: Wyoming acumuló ~4.000 DAO LLCs desde 2021. Estonia tiene ~139.000 e-residents totales acumulados en 12 años; las companies activas son una fracción."
            en="The “5,000 companies in 24 months” estimate is a reasonable upside scenario, not an official projection. For comparison: Wyoming has accumulated ~4,000 DAO LLCs since 2021. Estonia has ~139,000 cumulative e-residents over 12 years; active companies are a fraction of that."
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                El autor es desarrollador, no economista ni contador. Estos
                números requieren validación por un especialista antes de
                usarlos como base de policy. La invitación a cualquier
                economista que quiera revisarlos públicamente está abierta:{" "}
                <Link
                  href={lang === "es" ? "/co-firmar" : "/en/co-sign"}
                  style={linkSty}
                >
                  {lang === "es" ? "/co-firmar" : "/en/co-sign"}
                </Link>
                .
              </>
            }
            en={
              <>
                The author is a developer, not an economist or an
                accountant. These numbers require validation by a
                specialist before being used as policy basis. Open
                invitation to any economist who wants to review them
                publicly:{" "}
                <Link
                  href={lang === "es" ? "/co-firmar" : "/en/co-sign"}
                  style={linkSty}
                >
                  {lang === "es" ? "/co-firmar" : "/en/co-sign"}
                </Link>
                .
              </>
            }
          />
        </li>
      </ul>
    </DocShell>
  );
}

// --- Row data: cells are jurisdictional facts. Labels translate; numbers
//     stay the same. Time / "Tiempo" cells differ slightly ("días" ↔ "days").

const INCORP_ROWS: ReadonlyArray<{ cells: RowDef; highlight?: boolean }> = [
  {
    cells: [
      {
        es: "Argentina (SAS estándar hoy)",
        en: "Argentina (standard SAS today)",
      },
      { es: "ARS 60.000 (~USD 60)", en: "ARS 60,000 (~USD 60)" },
      { es: "USD 200-500", en: "USD 200-500" },
      { es: "5-20 días hábiles", en: "5-20 business days" },
      { es: "Sí · escribano + IGJ", en: "Yes · notary + IGJ" },
    ],
  },
  {
    cells: [
      {
        es: "Argentina (sociedad-IA propuesta)",
        en: "Argentina (proposed AI-corp)",
      },
      { es: "Por definir", en: "TBD" },
      { es: "Estimado USD 100-300", en: "Estimated USD 100-300" },
      { es: "Estimado 1-7 días", en: "Estimated 1-7 days" },
      { es: "Por definir", en: "TBD" },
    ],
    highlight: true,
  },
  {
    cells: [
      { es: "Wyoming DAO LLC", en: "Wyoming DAO LLC" },
      { es: "USD 100", en: "USD 100" },
      { es: "USD 250-450", en: "USD 250-450" },
      { es: "1-3 días", en: "1-3 days" },
      {
        es: "Registered agent (USD 100/y)",
        en: "Registered agent (USD 100/y)",
      },
    ],
  },
  {
    cells: [
      { es: "Marshall Islands MIDAO", en: "Marshall Islands MIDAO" },
      { es: "USD 6.000-9.500", en: "USD 6,000-9,500" },
      { es: "USD 8.000-12.000", en: "USD 8,000-12,000" },
      { es: "2-4 semanas", en: "2-4 weeks" },
      { es: "MIDAO obligatorio", en: "MIDAO mandatory" },
    ],
  },
  {
    cells: [
      { es: "Estonia OÜ + e-Residency", en: "Estonia OÜ + e-Residency" },
      { es: "EUR 25 (~USD 27)", en: "EUR 25 (~USD 27)" },
      { es: "USD 250-400", en: "USD 250-400" },
      { es: "1-3 días", en: "1-3 days" },
      {
        es: "e-Residency card (~EUR 100)",
        en: "e-Residency card (~EUR 100)",
      },
    ],
  },
  {
    cells: [
      {
        es: "Delaware C-Corp (Stripe Atlas)",
        en: "Delaware C-Corp (Stripe Atlas)",
      },
      { es: "USD 500", en: "USD 500" },
      { es: "USD 500-800", en: "USD 500-800" },
      { es: "2-7 días", en: "2-7 days" },
      {
        es: "Registered agent incluido",
        en: "Registered agent included",
      },
    ],
  },
  {
    cells: [
      { es: "Singapore VCC", en: "Singapore VCC" },
      { es: "SGD 300 (~USD 230)", en: "SGD 300 (~USD 230)" },
      { es: "USD 2.000-4.000", en: "USD 2,000-4,000" },
      { es: "1-2 semanas", en: "1-2 weeks" },
      {
        es: "Nominee director obligatorio",
        en: "Nominee director mandatory",
      },
    ],
  },
];

const TCO_ROWS: ReadonlyArray<{ cells: RowDef; highlight?: boolean }> = [
  {
    cells: [
      {
        es: "Argentina (sociedad-IA)",
        en: "Argentina (AI-corp)",
      },
      { es: "USD 300", en: "USD 300" },
      { es: "USD 600", en: "USD 600" },
      {
        es: "USD 0 (self-host ar-agents)",
        en: "USD 0 (self-host ar-agents)",
      },
      { es: "USD 1.500", en: "USD 1,500" },
    ],
    highlight: true,
  },
  {
    cells: [
      {
        es: "Argentina (sociedad-IA + Cloud Studio)",
        en: "Argentina (AI-corp + Cloud Studio)",
      },
      { es: "USD 300", en: "USD 300" },
      { es: "USD 600", en: "USD 600" },
      {
        es: "USD 1.200 (USD 50/mes)",
        en: "USD 1,200 (USD 50/mo)",
      },
      { es: "USD 2.700", en: "USD 2,700" },
    ],
  },
  {
    cells: [
      { es: "Wyoming DAO LLC", en: "Wyoming DAO LLC" },
      { es: "USD 400", en: "USD 400" },
      { es: "USD 250", en: "USD 250" },
      {
        es: "USD 600 (Stripe + Twilio basic)",
        en: "USD 600 (Stripe + Twilio basic)",
      },
      { es: "USD 1.500", en: "USD 1,500" },
    ],
  },
  {
    cells: [
      { es: "Estonia OÜ", en: "Estonia OÜ" },
      { es: "USD 350", en: "USD 350" },
      { es: "USD 400", en: "USD 400" },
      { es: "USD 600", en: "USD 600" },
      { es: "USD 1.750", en: "USD 1,750" },
    ],
  },
  {
    cells: [
      {
        es: "Delaware (Stripe Atlas)",
        en: "Delaware (Stripe Atlas)",
      },
      { es: "USD 800", en: "USD 800" },
      {
        es: "USD 600 (Atlas+RA+tax)",
        en: "USD 600 (Atlas+RA+tax)",
      },
      { es: "USD 600", en: "USD 600" },
      { es: "USD 2.600", en: "USD 2,600" },
    ],
  },
  {
    cells: [
      { es: "Marshall Islands MIDAO", en: "Marshall Islands MIDAO" },
      { es: "USD 10.000", en: "USD 10,000" },
      { es: "USD 3.500", en: "USD 3,500" },
      { es: "USD 600", en: "USD 600" },
      { es: "USD 17.600", en: "USD 17,600" },
    ],
  },
];

const VALUE_ROWS: ReadonlyArray<{ cells: RowDef; highlight?: boolean }> = [
  {
    cells: [
      {
        es: "Argentina (responsable inscripto)",
        en: "Argentina (responsable inscripto)",
      },
      { es: "30%", en: "30%" },
      {
        es: "21% (deducible si proveedor también RI)",
        en: "21% (deductible if supplier is also RI)",
      },
      { es: "USD 600/año", en: "USD 600/year" },
      { es: "USD 30.000-35.000", en: "USD 30,000-35,000" },
    ],
    highlight: true,
  },
  {
    cells: [
      {
        es: "Argentina (monotributo categoría máxima)",
        en: "Argentina (monotributo top category)",
      },
      {
        es: "Incluido en cuota fija",
        en: "Included in fixed quota",
      },
      { es: "Incluido", en: "Included" },
      { es: "ARS 1M/año aprox", en: "~ARS 1M/year" },
      { es: "USD 8.000-12.000", en: "USD 8,000-12,000" },
    ],
  },
  {
    cells: [
      {
        es: "Wyoming DAO LLC (pass-through)",
        en: "Wyoming DAO LLC (pass-through)",
      },
      {
        es: "0% federal (pass-through al miembro)",
        en: "0% federal (pass-through to member)",
      },
      {
        es: "Sales tax por estado",
        en: "Sales tax per state",
      },
      { es: "USD 250/año", en: "USD 250/year" },
      {
        es: "USD 0-3.000 (federal)",
        en: "USD 0-3,000 (federal)",
      },
    ],
  },
  {
    cells: [
      { es: "Delaware C-Corp", en: "Delaware C-Corp" },
      {
        es: "21% federal + 8.7% state",
        en: "21% federal + 8.7% state",
      },
      {
        es: "Sales tax variable",
        en: "Variable sales tax",
      },
      { es: "USD 800/año", en: "USD 800/year" },
      { es: "USD 25.000+", en: "USD 25,000+" },
    ],
  },
  {
    cells: [
      { es: "Estonia OÜ", en: "Estonia OÜ" },
      {
        es: "0% en utilidades retenidas + 20% al distribuir",
        en: "0% on retained earnings + 20% on distribution",
      },
      { es: "22% EU VAT", en: "22% EU VAT" },
      { es: "USD 400/año", en: "USD 400/year" },
      {
        es: "USD 0 (si reinvierte) o USD 22.000 (si distribuye)",
        en: "USD 0 (if reinvested) or USD 22,000 (if distributed)",
      },
    ],
  },
];

function Row({
  cells,
  highlight = false,
  lang,
}: {
  cells: RowDef;
  highlight?: boolean;
  lang: Lang;
}) {
  return (
    <tr
      style={{
        borderTop: "1px solid var(--border-color)",
        background: highlight
          ? "color-mix(in srgb, var(--accent) 8%, transparent)"
          : "transparent",
      }}
    >
      {cells.map((c, i) => (
        <td
          key={i}
          style={i === 0 ? tdLabelSty : i >= 1 && i <= 3 ? tdNumSty : tdSty}
        >
          {c[lang]}
        </td>
      ))}
    </tr>
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

const thStyR: React.CSSProperties = {
  ...thSty,
  textAlign: "right",
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
};

const tdNumSty: React.CSSProperties = {
  ...tdSty,
  textAlign: "right",
  fontFamily: FONT_MONO,
  whiteSpace: "nowrap",
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
