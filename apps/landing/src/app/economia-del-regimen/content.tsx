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
              <strong>Tesis central.</strong> Si el régimen se estructura
              correctamente, Argentina puede ser la opción más competitiva
              del mundo para incorporar una sociedad-IA. Con la estructura
              recomendada, una ventana de incubación de 24 meses construye
              la base de adopción que lleva la recaudación fiscal directa a
              un <strong>run-rate de USD 1.000 millones+ anuales</strong>. La
              página tiene tres partes: comparación contra las
              jurisdicciones competidoras, proyección de ingresos al Estado,
              y recomendación concreta de cómo ejecutar el régimen para
              llegar al número.
            </>
          }
          en={
            <>
              <strong>Central thesis.</strong> If the regime is structured
              correctly, Argentina can be the world's most competitive
              jurisdiction to incorporate an AI corporation. With the
              recommended structure, a 24-month incubation window builds the
              adoption base that takes direct fiscal revenue to a{" "}
              <strong>USD 1 billion+ annual run-rate</strong>. The page has
              three parts: comparison against competing jurisdictions,
              projection of revenue to the State, and a concrete
              recommendation for how to execute the regime to reach the
              number.
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
              <strong>Lectura:</strong> Argentina compite directo con
              Wyoming en TCO (USD 1.500), debajo de Delaware y muy por
              debajo de MIDAO. El régimen no necesita ganar por precio,
              necesita no perder, y ya no pierde. El diferencial se
              decide en otros ejes: seguridad jurídica, calidad de la
              infraestructura técnica, y reputación internacional. Los
              tres son construibles.
            </>
          }
          en={
            <>
              <strong>Reading:</strong> Argentina competes directly with
              Wyoming on TCO (USD 1,500), below Delaware and well below
              MIDAO. The regime does not need to win on price; it needs
              to not lose, and it no longer loses. The differential is
              decided on other axes: legal certainty, quality of
              technical infrastructure, and international reputation.
              The three are buildable.
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
              <strong>Lectura:</strong> Argentina captura más valor
              fiscal por sociedad incorporada (USD 30-35K/año en RI, USD
              8-12K en monotributo) que Wyoming, Estonia o cualquier
              jurisdicción pass-through. Por cada sociedad que se va a
              Wyoming en lugar de Argentina, el Estado argentino deja
              ~USD 30K/año sobre la mesa.
            </>
          }
          en={
            <>
              <strong>Reading:</strong> Argentina captures more fiscal
              value per incorporated company (USD 30-35K/year for RI,
              USD 8-12K for monotributo) than Wyoming, Estonia, or any
              pass-through jurisdiction. For every company that goes to
              Wyoming instead of Argentina, the State leaves ~USD 30K/year
              on the table.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L lang={lang} es="4 · La oportunidad" en="4 · The opportunity" />
      </DocH2>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              Asumiendo facturación media de USD 100K/año por sociedad
              (supuesto explícito y ajustable, ver Fuentes) y captura
              fiscal efectiva de USD 30-35K/año en régimen full (mix
              ponderado RI + monotributo, ver tabla anterior), una base de{" "}
              <strong>~17.000 sociedades-IA productivas</strong> construida
              durante la ventana de incubación de 24 meses deja un{" "}
              <strong>run-rate de ~USD 550M/año</strong> al pasar al régimen
              full, con trayectoria a{" "}
              <strong>USD 1.000 millones+ anuales</strong> a medida que la
              base compone más allá del mes 24. Esa es la oportunidad
              concreta.
            </>
          }
          en={
            <>
              Assuming an average USD 100K/year in revenue per company
              (an explicit, adjustable assumption, see Sources) and
              effective fiscal capture of USD 30-35K/year under the full
              regime (weighted RI + monotributo mix, see previous table), a
              base of{" "}
              <strong>~17,000 productive AI-corps</strong> built during the
              24-month incubation window leaves a{" "}
              <strong>~USD 550M/year run-rate</strong> once it moves to the
              full regime, on a trajectory to{" "}
              <strong>USD 1 billion+ annually</strong> as the base compounds
              beyond month 24. That is the concrete opportunity.
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              17.000 sociedades en 24 meses es agresivo pero defendible:
              Wyoming acumuló ~4.000 DAO LLCs en 4 años sin foco fiscal.
              Argentina necesitaría adopción 4x más rápida que Wyoming,
              lo cual es plausible si el régimen se estructura bien.
              Cómo estructurarlo bien, abajo.
            </>
          }
          en={
            <>
              17,000 AI-corps in 24 months is aggressive but defensible:
              Wyoming accumulated ~4,000 DAO LLCs in 4 years without a
              fiscal focus. Argentina would need adoption 4x faster than
              Wyoming, which is plausible if the regime is structured
              well. How to structure it well, below.
            </>
          }
        />
      </DocP>

      <DocP>
        <L
          lang={lang}
          es={
            <>
              El run-rate de USD 1.000M+ anuales es sólo la recaudación
              fiscal directa. El régimen además habilita un mercado de
              servicios profesionales especializados (contabilidad,
              cumplimiento, auditoría operacional, infraestructura técnica)
              que crece linealmente con cada sociedad incorporada.
            </>
          }
          en={
            <>
              The USD 1B+ annual run-rate is only direct fiscal revenue.
              The regime also enables a market of specialised professional
              services (accounting, compliance, operational auditing,
              technical infrastructure) that grows linearly with each
              incorporated company.
            </>
          }
        />
      </DocP>

      <DocH2>
        <L lang={lang} es="5 · Mi recomendación" en="5 · My recommendation" />
      </DocH2>

      <DocP>
        <L
          lang={lang}
          es={
            <>
              Sin reformas, el régimen probablemente estabiliza en un{" "}
              <strong>run-rate de USD 300-500M/año</strong> (rango típico
              de un régimen pass-through aplicado a Argentina). Con las{" "}
              <strong>8 medidas domésticas que recomiendo abajo</strong>{" "}
              (4 impositivas + 4 de transformación tecnológica del
              Estado), el techo se mueve a un{" "}
              <strong>run-rate de USD 1.000M+ anuales con alta
              probabilidad</strong>. Y si además se ejecutan las{" "}
              <strong>4 medidas para founders extranjeros</strong>{" "}
              (sección 5.b abajo), el techo se mueve a{" "}
              <strong>USD 3.000-5.000M+ anuales</strong>, y Argentina deja
              de competir contra Wyoming para pasar a competir contra
              Singapore y Dubai, a costo operativo de Wyoming. El
              mecanismo: durante la ventana de incubación de 24 meses la
              carga impositiva efectiva es deliberadamente baja para ganar
              la decisión de jurisdicción —el momento exacto en que se
              toma—; la recaudación se materializa cuando la base incubada
              pasa al régimen full.
            </>
          }
          en={
            <>
              Without reforms, the regime likely stabilizes at a{" "}
              <strong>USD 300-500M/year run-rate</strong> (typical range
              of a pass-through regime applied to Argentina). With the{" "}
              <strong>8 domestic measures recommended below</strong>{" "}
              (4 fiscal + 4 state-level tech transformation), the ceiling
              moves to a{" "}
              <strong>USD 1B+ annual run-rate with high probability</strong>.
              And if the <strong>4 foreign-founder measures</strong>{" "}
              (section 5.b below) are also executed, the ceiling moves to{" "}
              <strong>USD 3-5B+ annually</strong>, and Argentina stops
              competing against Wyoming and starts competing against
              Singapore and Dubai, at Wyoming's operating cost. The
              mechanism: during the 24-month incubation window the
              effective tax burden is deliberately low to win the
              jurisdictional decision (the exact moment it is made);
              revenue materializes when the incubated base moves to the
              full regime.
            </>
          }
        />
      </DocP>
      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>5.a · Estructura impositiva para founders
              argentinos.</strong> Para maximizar adopción del mercado
              doméstico (base):
            </>
          }
          en={
            <>
              <strong>5.a · Tax structure for Argentine founders.</strong>{" "}
              To maximise domestic-market adoption (base):
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
                <strong>Categoría especial de monotributo sociedad-IA</strong>
                {" "}con cuota fija escalonada por facturación. Quita
                fricción de entrada en el segmento de menor escala (founders
                indie, microestudios de IA aplicada), donde la diferencia
                entre "incorporar acá vs Wyoming" se decide por costo de
                onboarding, no por sofisticación fiscal.
              </>
            }
            en={
              <>
                <strong>Special AI-corp monotributo category</strong>{" "}
                with revenue-tiered fixed quotas. Removes entry friction
                in the smallest segment (indie founders, applied-AI
                microstudios), where the "incorporate here vs Wyoming"
                decision turns on onboarding cost, not fiscal
                sophistication.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Coordinación IIBB provincial</strong>: convenio
                multilateral simplificado para sociedades-IA digitales
                (sin establecimiento físico). Hoy IIBB es el costo
                regulatorio que más fricción genera al cross-province.
                Quitarlo del menú decisorio acelera el régimen.
              </>
            }
            en={
              <>
                <strong>Provincial IIBB coordination</strong>: simplified
                multilateral agreement for digital AI-corps (no physical
                establishment). Today IIBB is the regulatory cost that
                creates the most cross-province friction. Removing it
                from the decision menu accelerates the regime.
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
                  Extensión del régimen Economía del Conocimiento (Ley
                  27.506)
                </strong>{" "}
                a sociedades-IA: deducción adicional sobre IIGG por
                inversión en infraestructura técnica + auditoría +
                desarrollo agentic. Pago de aranceles AFIP cuasi-nulo en
                los primeros 24 meses de la sociedad. Maximiza el "primer
                tramo de adopción" (precisamente cuando la decisión
                jurisdiccional se toma).
              </>
            }
            en={
              <>
                <strong>
                  Extension of the Knowledge Economy regime (Law 27,506)
                </strong>{" "}
                to AI-corps: additional income-tax deduction for
                investment in technical infrastructure + auditing +
                agentic development. Near-zero AFIP fees in the company's
                first 24 months. Maximises the "first adoption tranche"
                (precisely when the jurisdictional decision is taken).
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Diferenciación de IVA AI-corp a AI-corp</strong>:
                operaciones B2B entre sociedades-IA pueden tener IVA
                diferido o nulo (similar al tratamiento exportación),
                gravándose en el punto de venta final al consumidor.
                Reduce el costo de cadena de valor entre agentes
                argentinos, incentivando que las redes se formen acá y no
                fuera.
              </>
            }
            en={
              <>
                <strong>AI-corp to AI-corp VAT differentiation</strong>:
                B2B operations between AI-corps with deferred or zero VAT
                (similar to export treatment), taxed at the final
                consumer point of sale. Lowers the value-chain cost
                between Argentine agents, incentivising networks to form
                here rather than abroad.
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
              <strong>Efecto conjunto 5.a</strong>: con estas 4 medidas,
              una sociedad-IA argentina paga efectivamente USD 8-15K/año
              en sus primeros 24 meses (vs USD 30-35K en régimen actual,
              vs USD 0-3K Wyoming, vs 0% Estonia con reinversión). El
              alivio es <em>temporal y per-sociedad</em>, dura el período
              de incubación; después vuelve al régimen full. Founders
              eligen AR porque la fricción inicial es la más baja;
              el Estado captura USD 1B+ porque las sociedades pasan al
              régimen full cuando ya están consolidadas y generando
              volumen.
            </>
          }
          en={
            <>
              <strong>Joint effect 5.a</strong>: with these 4 measures,
              an Argentine AI-corp effectively pays USD 8-15K/year in
              its first 24 months (vs USD 30-35K under the current
              regime, vs USD 0-3K Wyoming, vs 0% Estonia with
              reinvestment). The relief is <em>temporary and
              per-company</em>, only lasts the incubation period; then
              it returns to the full regime. Founders choose AR because
              initial friction is lowest; the State captures USD 1B+
              because companies move to the full regime once
              consolidated and generating volume.
            </>
          }
        />
      </DocP>

      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>5.b · Estructura impositiva para founders
              extranjeros</strong> (el motor de crecimiento exponencial).
              Hoy AR pierde por default contra Wyoming/Estonia/Singapore
              para founders no-argentinos. Cuatro medidas que la harían
              imbatible:
            </>
          }
          en={
            <>
              <strong>5.b · Tax structure for foreign founders</strong>{" "}
              (the exponential growth engine). Today AR loses by default
              to Wyoming/Estonia/Singapore for non-Argentine founders.
              Four measures that would make it unbeatable:
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
                <strong>Tax holiday sobre rentas extranjeras</strong>:
                0% IIGG sobre revenue no-argentino los primeros 5 años
                de la sociedad. Modelo combo Portugal NHR + Singapore
                foreign-source exemption. La sociedad sigue capturando
                IIBB + monotributo + IVA sobre lo que opera localmente;
                el founder extranjero no es penalizado por facturar
                afuera. Sin esto AR no compite contra Wyoming
                pass-through ni Singapore.
              </>
            }
            en={
              <>
                <strong>Foreign-revenue tax holiday</strong>: 0% income
                tax on non-Argentine revenue for the first 5 years of
                the company. Combo of Portugal NHR + Singapore
                foreign-source exemption. The company still captures
                IIBB + monotributo + VAT on local operations; the
                foreign founder is not penalised for invoicing abroad.
                Without this, AR cannot compete against Wyoming
                pass-through or Singapore.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Régimen de divisas sandbox específico para
                sociedades-IA</strong>: cuenta USD operativa + repatriación
                libre + sin cepo cambiario aplicable. Sandboxeado por
                diseño al perímetro de las sociedades-IA, sin contagio
                macro. Esto resuelve el riesgo #1 que tienen los foreign
                founders con Argentina hoy.
              </>
            }
            en={
              <>
                <strong>AI-corp FX sandbox regime</strong>: operative USD
                account + free repatriation + no FX controls applicable.
                Sandboxed by design to the AI-corp perimeter, with no
                macro contagion. This resolves the #1 risk foreign
                founders associate with Argentina today.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>e-Residencia argentina digital</strong>: founder
                extranjero sin presencia física constituye, firma y opera
                la sociedad-IA enteramente remoto. Modelo Estonia
                e-Residency. La infraestructura técnica ya existe en{" "}
                <DocCode>@ar-agents/mi-argentina</DocCode> +{" "}
                <DocCode>@ar-agents/identity</DocCode> +{" "}
                <DocCode>@ar-agents/firma-digital</DocCode>; el Estado
                sólo tiene que abrir el flow legal.
              </>
            }
            en={
              <>
                <strong>Digital Argentine e-Residency</strong>: a
                foreign founder without physical presence incorporates,
                signs, and operates the AI-corp entirely remote. Estonia
                e-Residency model. The technical infrastructure already
                exists in <DocCode>@ar-agents/mi-argentina</DocCode> +{" "}
                <DocCode>@ar-agents/identity</DocCode> +{" "}
                <DocCode>@ar-agents/firma-digital</DocCode>; the State
                only needs to open the legal flow.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Cláusula de estabilidad jurídica con rango
                legal</strong>: el régimen anclado por ley (no por norma
                infralegal), de modo que la inversión de founders
                extranjeros quede alcanzada por la red de tratados
                bilaterales de inversión que Argentina ya tiene vigentes
                —y su acceso a arbitraje internacional— sin necesidad de
                negociar un tratado nuevo. Blinda contra reversibilidad
                política, el riesgo más sensible para el inversor global,
                con instrumentos existentes.
              </>
            }
            en={
              <>
                <strong>Statutory legal-stability clause</strong>: the
                regime anchored by law (not sub-statutory regulation), so
                foreign founders' investment falls under Argentina's
                already-in-force bilateral investment treaty network (and
                its access to international arbitration) without
                negotiating a new treaty. Shields against political
                reversibility, the most sensitive risk for the global
                investor, using existing instruments.
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
              <strong>Efecto conjunto 5.b</strong>: las 4 medidas para
              extranjeros abren el régimen al mercado global y vuelven a
              AR <em>la opción más competitiva del mundo</em> para
              incorporar una sociedad-IA. Argentina pasa de capturar
              founders LATAM (base de ~17K en la ventana de incubación) a
              capturar founders de cualquier país (50.000-100.000
              sociedades). El run-rate de recaudación fiscal directa se
              mueve de USD 1B a{" "}
              <strong>USD 3-5B+ anuales</strong>, más el efecto
              multiplicador
              (servicios profesionales locales, talento contratado en
              AR, consumo, real estate de founders radicados) que para
              foreign founders es típicamente 5-10x el monto fiscal
              directo.
            </>
          }
          en={
            <>
              <strong>Joint effect 5.b</strong>: the 4 foreign-founder
              measures open the regime to the global market and turn AR
              into <em>the world's most competitive option</em> for
              incorporating an AI-corp. Argentina moves from capturing
              LATAM founders (a ~17K base over the incubation window) to
              capturing founders from any country (50,000-100,000
              companies). The direct fiscal revenue run-rate moves from
              USD 1B to <strong>USD 3-5B+ annually</strong>, plus a
              multiplier effect (local professional services,
              talent hired in AR, consumption, real estate from founders
              relocating) that for foreign founders is typically 5-10x
              direct fiscal capture.
            </>
          }
        />
      </DocP>

      <DocP>
        <L
          lang={lang}
          es={
            <>
              <strong>5.c · Transformación tecnológica del Estado</strong>.
              Cuatro piezas que dependen del Estado y que multiplican la
              velocidad de adopción de 5.a y 5.b:
            </>
          }
          en={
            <>
              <strong>5.c · State-level tech transformation</strong>.
              Four pieces that depend on the State and that multiply
              adoption velocity for 5.a and 5.b:
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
                <strong>API documentada de TAD/GDE</strong> para que la
                inscripción IGJ se pueda completar programáticamente. Es
                la única pieza operativa que un toolkit open-source no
                puede resolver del lado privado.
              </>
            }
            en={
              <>
                <strong>Documented TAD/GDE API</strong> so IGJ
                incorporation can be completed programmatically. The
                only operational piece that an open-source toolkit
                cannot solve from the private side.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Mi Argentina OIDC para personas jurídicas</strong>:
                hoy el flow de OIDC sólo aplica a personas físicas; una
                sociedad-IA debería poder identificarse vía OIDC al
                Estado como entidad, no via humano operador.
              </>
            }
            en={
              <>
                <strong>Mi Argentina OIDC for legal persons</strong>:
                today the OIDC flow only applies to natural persons; an
                AI-corp should be able to authenticate to the State as
                an entity, not via a human operator.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>ARCA padron API con bulk lookup</strong>: hoy el
                servicio responde una CUIT por request; con bulk lookup
                un agente auditor puede validar miles de contrapartes en
                un solo round-trip.
              </>
            }
            en={
              <>
                <strong>ARCA padron API with bulk lookup</strong>: today
                the service responds one CUIT per request; with bulk
                lookup an auditor agent can validate thousands of
                counterparts in a single round-trip.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Sandbox regulatorio formal sociedad-IA</strong>{" "}
                bajo el ala del Ministerio: testing controlado de
                operaciones de agente antes de salir a producción, con
                feedback loop al cuerpo normativo. Estonia + Singapore lo
                tienen; Argentina puede.
              </>
            }
            en={
              <>
                <strong>Formal AI-corp regulatory sandbox</strong> under
                the Ministry: controlled testing of agent operations
                before going to production, with feedback loop into the
                regulatory body. Estonia + Singapore have it; Argentina
                can.
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
              <strong>5.d · Riesgos a controlar.</strong> Lo que puede
              hacer que el régimen no escale:
            </>
          }
          en={
            <>
              <strong>5.d · Risks to manage.</strong> What can prevent
              the regime from scaling:
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
                <strong>Cepo cambiario</strong>: si la sociedad-IA
                factura USD, retirar esos dólares al exterior tiene
                fricción que no existe en Wyoming o Estonia. Se resuelve
                con la medida de divisas sandbox de la sección 5.b; sin
                ella, el incentivo se diluye para founders
                internacionales.
              </>
            }
            en={
              <>
                <strong>FX controls</strong>: if the AI-corp invoices
                USD, withdrawing those dollars abroad faces friction
                that does not exist in Wyoming or Estonia. Resolved by
                the FX sandbox in section 5.b; without it, the incentive
                dilutes for international founders.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Volatilidad macro</strong>: cambio de gobierno
                en octubre 2027 puede revertir el régimen. Estonia,
                Wyoming, Delaware tienen continuidad multi-administración.
                Es el factor más sensible para founders extranjeros. Se
                mitiga con la cláusula de estabilidad jurídica de la
                sección 5.b: anclar el régimen por ley y dejar la
                inversión extranjera alcanzada por la red de tratados
                vigente da acceso a arbitraje internacional si el régimen
                se revierte unilateralmente, blindando la decisión
                política.
              </>
            }
            en={
              <>
                <strong>Macro volatility</strong>: a change of government
                in October 2027 could reverse the regime. Estonia,
                Wyoming, Delaware have multi-administration continuity.
                Most sensitive factor for foreign founders. Mitigated by
                the statutory legal-stability clause in section 5.b:
                anchoring the regime by law and bringing foreign
                investment under the existing treaty network grants access
                to international arbitration if the regime is unilaterally
                reversed, shielding the political decision.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Reputación jurídica</strong>: Delaware es el
                default por 100 años de Court of Chancery. AR no puede
                competir en ese eje, compite en costo + velocidad +
                jurisdicción de proximidad para founders latinoamericanos.
              </>
            }
            en={
              <>
                <strong>Legal reputation</strong>: Delaware is the
                default thanks to 100 years of Court of Chancery. AR
                cannot compete on that axis; it competes on cost +
                speed + proximity jurisdiction for Latin American
                founders.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>Falta de VC local AI-specialized</strong>: si
                una sociedad-IA necesita Serie A, depende de VCs USA/UK.
                Estonia mitiga esto con e-Residency program; AR no tiene
                equivalente todavía.
              </>
            }
            en={
              <>
                <strong>No local AI-specialised VC</strong>: if an
                AI-corp needs a Series A, it depends on US/UK VCs.
                Estonia mitigates this through e-Residency; AR has no
                equivalent yet.
              </>
            }
          />
        </li>
      </ul>

      <DocH2>
        <L
          lang={lang}
          es="6 · Resumen y preguntas frecuentes"
          en="6 · Summary and frequently asked questions"
        />
      </DocH2>

      <DocP>
        <L
          lang={lang}
          es={<><strong>Cifras clave del análisis:</strong></>}
          en={<><strong>Key figures from the analysis:</strong></>}
        />
      </DocP>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <em>
                "Con las 8 medidas que recomiendo, el régimen de
                sociedades-IA lleva la recaudación fiscal directa a un
                run-rate de USD 1.000 millones+ anuales."
              </em>
            }
            en={
              <em>
                "With the 8 measures I recommend, the AI-corp regime
                takes direct fiscal revenue to a USD 1 billion+ annual
                run-rate."
              </em>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <em>
                "Por cada sociedad-IA que se incorpora en Wyoming en lugar
                de Argentina, el Estado argentino deja USD 30.000 al año
                sobre la mesa."
              </em>
            }
            en={
              <em>
                "For every AI-corp incorporated in Wyoming instead of
                Argentina, the Argentine state leaves USD 30,000/year on
                the table."
              </em>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <em>
                "Argentina captura más valor fiscal por sociedad que
                Wyoming, Estonia o Delaware. La diferencia, por entidad,
                es de USD 25.000-30.000 al año."
              </em>
            }
            en={
              <em>
                "Argentina captures more fiscal value per company than
                Wyoming, Estonia, or Delaware. The differential is
                USD 25,000-30,000/year per entity."
              </em>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <em>
                "La capa técnica de integración con el Estado (identidad,
                firma digital, facturación, pagos, padrón) ya existe como
                software abierto y auditable, lo que reduce el tiempo y el
                riesgo de implementación del régimen."
              </em>
            }
            en={
              <em>
                "The State-integration technical layer (identity, digital
                signature, invoicing, payments, taxpayer registry) already
                exists as open, auditable software, reducing the regime's
                implementation time and risk."
              </em>
            }
          />
        </li>
      </ul>

      <DocP>
        <L
          lang={lang}
          es={<><strong>Preguntas frecuentes:</strong></>}
          en={<><strong>Frequently asked questions:</strong></>}
        />
      </DocP>
      <ul style={ulSty}>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>¿Es realista atraer 17.000 sociedades en 24
                meses?</strong> Es agresivo pero defendible. Wyoming
                sumó 4.000 DAO LLCs en 4 años sin régimen fiscal
                favorable; Argentina necesitaría 4x más velocidad, lo
                cual es plausible con las 4 medidas impositivas + el
                costo operativo más bajo que Delaware/MIDAO + cercanía
                LATAM. El first-mover advantage acelera la adopción
                inicial.
              </>
            }
            en={
              <>
                <strong>Is attracting 17,000 AI-corps in 24 months
                realistic?</strong> Aggressive but defensible. Wyoming
                added 4,000 DAO LLCs in 4 years without a favorable
                fiscal regime; Argentina would need 4x the velocity,
                plausible with the 4 fiscal measures + lower operating
                cost than Delaware/MIDAO + LATAM proximity. The
                first-mover advantage accelerates initial adoption.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>¿Quién paga las 4 medidas impositivas?</strong>{" "}
                Las 4 son neutrales-positivas en recaudación neta. No
                son subsidios, son fricciones eliminadas. El upside es
                captar el volumen que hoy se va a Wyoming. Sin las
                medidas, el run-rate se estabiliza en USD 300-500M/año;
                con ellas, USD 1.000M+/año. Cuesta más no hacerlas que
                hacerlas.
              </>
            }
            en={
              <>
                <strong>Who pays for the 4 fiscal measures?</strong>{" "}
                All four are net-positive in fiscal terms. They are not
                subsidies, they are removed frictions. The upside is
                capturing the volume that today goes to Wyoming.
                Without them, the run-rate stabilizes at USD 300-500M/year;
                with them, USD 1B+/year. Not doing them costs more than
                doing them.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>¿Por qué Argentina y no Uruguay/Chile/Paraguay?</strong>{" "}
                Argentina es el único país hoy con un régimen
                explícitamente propuesto para sociedades-IA (anuncio
                Sturzenegger del 28-abr-2026). Uruguay tiene zona
                franca pero menor escala. Chile y Paraguay no
                propusieron nada equivalente. El primer país que
                ratifique el régimen ratifica el estándar internacional.
              </>
            }
            en={
              <>
                <strong>Why Argentina and not Uruguay/Chile/Paraguay?</strong>{" "}
                Argentina is the only country today with an explicitly
                proposed AI-corp regime (Sturzenegger announcement of
                April 28, 2026). Uruguay has free-trade-zone setups but
                smaller scale. Chile and Paraguay have proposed nothing
                equivalent. The first country to ratify the regime
                ratifies the international standard.
              </>
            }
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                <strong>¿Qué pasa si cambia el gobierno en 2027?</strong>{" "}
                Es el riesgo más sensible para founders extranjeros.
                Mitigación: anclar el régimen por ley (no por norma
                infralegal) y dejar la inversión extranjera alcanzada por
                la red de tratados bilaterales de inversión vigente, para
                que sobreviva un cambio político. Estonia, Wyoming y
                Delaware tienen continuidad multi-administración por esta
                razón.
              </>
            }
            en={
              <>
                <strong>What happens if the government changes in
                2027?</strong> The most sensitive risk for foreign
                founders. Mitigation: anchor the regime by law (not
                sub-statutory regulation) and bring foreign investment
                under the existing bilateral investment treaty network, so
                it survives political change. Estonia, Wyoming, and
                Delaware have multi-administration continuity for this
                reason.
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
              <strong>Sobre el autor.</strong> Nazareno Clemente.
              Ingeniero de software argentino. Autor de los 33 paquetes
              npm <DocCode>@ar-agents/*</DocCode> (MIT) y de los 6 RFCs
              académicos del régimen (CC-BY-4.0, DOIs en Zenodo).
              Contacto:{" "}
              <a href="mailto:naza@naza.ar" style={linkSty}>
                naza@naza.ar
              </a>
              . Press kit:{" "}
              <Link href="/press-kit" style={linkSty}>
                ar-agents.ar/press-kit
              </Link>
              . GitHub:{" "}
              <a
                href="https://github.com/ar-agents/ar-agents"
                style={linkSty}
              >
                github.com/ar-agents/ar-agents
              </a>
              .
            </>
          }
          en={
            <>
              <strong>About the author.</strong> Nazareno Clemente.
              Argentine software engineer. Author of the 33 npm packages{" "}
              <DocCode>@ar-agents/*</DocCode> (MIT) and the 5 academic
              RFCs of the regime (CC-BY-4.0, Zenodo DOIs).
              Contact:{" "}
              <a href="mailto:naza@naza.ar" style={linkSty}>
                naza@naza.ar
              </a>
              . Press kit:{" "}
              <Link href="/press-kit" style={linkSty}>
                ar-agents.ar/press-kit
              </Link>
              . GitHub:{" "}
              <a
                href="https://github.com/ar-agents/ar-agents"
                style={linkSty}
              >
                github.com/ar-agents/ar-agents
              </a>
              .
            </>
          }
        />
      </DocP>

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
            es="La estimación de ~17.000 sociedades-IA en 24 meses es un escenario de upside agresivo, no una proyección oficial. Wyoming acumuló ~4.000 DAO LLCs en 4 años sin foco fiscal; Argentina necesitaría adopción 4x más rápida para llegar al umbral. Plausible con el incentivo fiscal diferencial y el ecosistema AR existente. Un objetivo, no una garantía."
            en="The ~17,000 AI-corps in 24 months estimate is an aggressive upside scenario, not an official projection. Wyoming accumulated ~4,000 DAO LLCs in 4 years without a fiscal focus; Argentina would need adoption 4x faster to hit the threshold. Plausible given the differential fiscal incentive and the existing AR ecosystem. A target, not a guarantee."
          />
        </li>
        <li style={liSty}>
          <L
            lang={lang}
            es={
              <>
                Este análisis combina datos públicos de tasas oficiales
                (AFIP/ARCA, NIC.AR, e-Residency, Wyoming SOS, MIDAO) con
                una proyección agresiva calibrada contra benchmarks
                internacionales comparables. Un economista o contador
                específico debería revisar los números antes de usarlos
                como base de policy. Invitación abierta a co-firma
                pública:{" "}
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
                This analysis combines public data from official rates
                (AFIP/ARCA, NIC.AR, e-Residency, Wyoming SOS, MIDAO)
                with an aggressive projection calibrated against
                comparable international benchmarks. An economist or
                accountant should review the numbers before they are
                used as policy basis. Open invitation for public
                co-signature:{" "}
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
  borderCollapse: "collapse",
  fontSize: 12.5,
  background: "var(--bg-tint)",
  borderRadius: 8,
  overflow: "hidden",
  tableLayout: "fixed",
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
  padding: 10,
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--text-body)",
  verticalAlign: "top",
  wordBreak: "break-word",
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
  fontSize: 11.5,
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
