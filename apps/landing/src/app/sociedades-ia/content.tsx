import { DocBlock, DocCode, DocH2, DocP, DocShell } from "../doc-shell";
import { SociedadesIaJsonLd } from "../json-ld";

/**
 * Shared bilingual content for /sociedades-ia (ES default) and
 * /en/ai-corporations (EN). Server component. Receives `lang` prop and
 * renders strings from the matching column of T below.
 */

type Lang = "es" | "en";

const linkSty: React.CSSProperties = {
  color: "var(--accent)",
  textDecoration: "underline",
};

const T = {
  eyebrow: { es: "sociedades de IA", en: "AI corporations" },
  title: {
    es: "Implementación de referencia.",
    en: "Reference implementation.",
  },
  subtitle: {
    es: "El anteproyecto de Sturzenegger ya tiene texto: crea la Sociedad Automatizada (art. 14) y la DAO (art. 258). Así es como se integran con el Estado argentino. Y el código ya está publicado.",
    en: "Sturzenegger's draft bill now has text: it creates the Sociedad Automatizada (art. 14) and the DAO (art. 258). This is how they integrate with the Argentine state. And the code is already published.",
  },
  h2plan: {
    es: "El plan, en una línea",
    en: "The plan, in one line",
  },
  planP1: {
    es: (
      <>
        El Ministro de Desregulación Federico Sturzenegger anunció el 28
        de abril de 2026 (en{" "}
        <a
          href="https://www.iprofesional.com/economia/453561-sociedades-de-inteligencia-artificial-inedita-apuesta-de-federico-sturzenegger"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          Expo EFI
        </a>
        ) el régimen, y el 1 de junio de 2026 el Poder Ejecutivo envió al
        Senado el anteproyecto que reemplaza íntegramente la Ley 19.550.
        Crea la <DocCode>Sociedad Automatizada</DocCode> (art. 14): una
        empresa de cualquier tipo que desarrolla su objeto mediante agentes
        de IA, <strong>sin empleados en relación de dependencia</strong>, y
        responde con su patrimonio por los daños de sus sistemas. No es
        &ldquo;cero humanos&rdquo;: conserva un administrador (humano o
        persona jurídica, art. 88) que configura y supervisa la IA y
        responde por ello (art. 102). Y crea la <DocCode>DAO</DocCode>{" "}
        (art. 258), gobernada por smart contracts y tokens, con
        representante legal humano obligatorio (art. 260). Paga impuestos
        como cualquier sociedad.
      </>
    ),
    en: (
      <>
        Argentina's Minister of Deregulation Federico Sturzenegger
        announced on April 28, 2026 (at{" "}
        <a
          href="https://www.iprofesional.com/economia/453561-sociedades-de-inteligencia-artificial-inedita-apuesta-de-federico-sturzenegger"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          Expo EFI
        </a>
        ) the regime, and on June 1, 2026 the Executive sent the Senate the
        draft bill that fully replaces Law 19.550. It creates the{" "}
        <DocCode>Sociedad Automatizada</DocCode> (art. 14): a company of any
        type that pursues its purpose through AI agents,{" "}
        <strong>with no employees</strong>, and answers with its own assets
        for damages caused by its systems. It is not &ldquo;zero
        humans&rdquo;: it keeps an administrator (a human or legal person,
        art. 88) who configures and supervises the AI and is liable for it
        (art. 102). And it creates the <DocCode>DAO</DocCode> (art. 258),
        governed by smart contracts and tokens, with a mandatory human legal
        representative (art. 260). It pays taxes like any company.
      </>
    ),
  },
  planQuote: {
    es: (
      <>
        Sturzenegger lo pintó así:{" "}
        <em>
          &ldquo;Si en 10 años el 90% del PBI mundial lo producen agentes
          de IA, queremos que ese régimen jurídico esté en Argentina.
          Podríamos tener 50 millones de habitantes y 500 millones de
          agentes de IA incorporados acá, produciendo para el mundo y
          pagando impuestos en nuestro país&rdquo;
        </em>
        .
      </>
    ),
    en: (
      <>
        Sturzenegger framed it like this:{" "}
        <em>
          &ldquo;If in 10 years 90% of global GDP is produced by AI
          agents, we want that legal regime to be in Argentina. We could
          have 50 million inhabitants and 500 million AI agents
          incorporated here, producing for the world and paying taxes in
          our country.&rdquo;
        </em>
      </>
    ),
  },
  h2pieces: {
    es: "Lo que una sociedad IA va a necesitar (en código)",
    en: "What an AI corporation will need (in code)",
  },
  piecesIntro: {
    es: "Asumiendo que el proyecto avanza tal cual está planteado, una empresa-agente debería poder hacer todo el ciclo de incorporación + operación sin intervención humana. Mapeo lo que falta para cada paso, y la cobertura actual del toolkit ar-agents:",
    en: "Assuming the proposal moves forward as drafted, an agent-company should be able to complete the full incorporation + operation cycle without human intervention. Below is what each step requires and the current coverage of the ar-agents toolkit:",
  },
  piecesFooter: {
    es: (
      <>
        Estado al 2026-05-13 · 15 piezas listas, 2 parciales · Última
        revisión: este commit en{" "}
        <a
          href="https://github.com/ar-agents/ar-agents"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          github.com/ar-agents/ar-agents
        </a>
        .
      </>
    ),
    en: (
      <>
        Status as of 2026-05-13 · 15 pieces ready, 2 partial · Last
        revision: this commit in{" "}
        <a
          href="https://github.com/ar-agents/ar-agents"
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          github.com/ar-agents/ar-agents
        </a>
        .
      </>
    ),
  },
  h2why: {
    es: "Por qué importa que sea código abierto",
    en: "Why it matters that it's open source",
  },
  whyP1: {
    es: "Si la primera sociedad IA de Argentina necesita pagar a una consultora USD 200k para integrarse al Estado, el experimento muere. Si una ar-agents sociedad IA se monta en una semana con npm + Vercel + un cert ARCA, escala.",
    en: "If Argentina's first AI corporation needs to pay a consultancy USD 200k to integrate with the state, the experiment dies. If an ar-agents AI corporation can be deployed in a week with npm + Vercel + an ARCA cert, it scales.",
  },
  whyP2: {
    es: "El anteproyecto ya está en el Senado; entra en vigencia a los 180 días de publicarse en el Boletín Oficial (art. 271). El timeline de infraestructura shipeable es ya. La ventana para definir el estándar técnico (cómo se opera una Sociedad Automatizada de forma confiable) es ahora, mientras el texto se debate.",
    en: "The draft bill is already in the Senate; it takes effect 180 days after publication in the Official Gazette (art. 271). The infrastructure timeline is now. The window to define the technical standard (how a Sociedad Automatizada is operated reliably) is open today, while the text is debated.",
  },
  h2demo: {
    es: "Demo: una sociedad-IA en producción",
    en: "Demo: an AI corporation in production",
  },
  demoIntro: {
    es: (
      <>
        Transcripción de un agente Claude usando el toolkit{" "}
        <DocCode>ar-agents</DocCode> para incorporar y operar una
        sociedad-IA ficticia (&ldquo;ACME-AI SAS&rdquo;). Las llamadas
        son reales, los datos son mock para evitar pegarle a producción.
      </>
    ),
    en: (
      <>
        Transcript of a Claude agent using the{" "}
        <DocCode>ar-agents</DocCode> toolkit to incorporate and operate a
        fictional AI corporation (&ldquo;ACME-AI SAS&rdquo;). The tool
        calls are real, the data is mocked to avoid hitting production.
      </>
    ),
  },
  h2wizard: {
    es: "Wizard de incorporación + demo deployable",
    en: "Incorporation wizard + deployable demo",
  },
  wizardP: {
    es: (
      <>
        El wizard live en{" "}
        <a
          href="/incorporar"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          /incorporar
        </a>{" "}
        genera la configuración de un repo Next.js con las 16 piezas
        cableadas, corre el pre-flight de IGJ en vivo (mismas reglas que
        el tool <DocCode>validate_igj_inscription</DocCode>), y emite el
        bundle listo para deployar a Vercel. Para los devs que prefieren
        ir directo al template, el código vive en{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          apps/sociedad-ia-starter
        </a>
        . El wizard y los 33 paquetes son gratis; la capa de confianza hosted
        (el log de auditoría firmado que pide el art. 102) es{" "}
        <a href="/precios" style={{ color: "inherit", textDecoration: "underline" }}>
          El Auditor
        </a>
        .
      </>
    ),
    en: (
      <>
        The live wizard at{" "}
        <a
          href="/incorporar"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          /incorporar
        </a>{" "}
        generates a Next.js repo configuration with the 16 pieces wired
        up, runs IGJ pre-flight live (same rules as the{" "}
        <DocCode>validate_igj_inscription</DocCode> tool), and emits a
        bundle ready to deploy on Vercel. For devs who prefer to start
        from the template directly, the code lives in{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          apps/sociedad-ia-starter
        </a>
        . The wizard and the 33 packages are free; the hosted trust layer (the
        signed audit log art. 102 calls for) is{" "}
        <a href="/en/pricing" style={{ color: "inherit", textDecoration: "underline" }}>
          The Auditor
        </a>
        .
      </>
    ),
  },
  h2legis: {
    es: "Documentos técnicos para legisladores",
    en: "Technical documents for legislators",
  },
  legisIntro: {
    es: "Si estás escribiendo la ley, o asesorando a quien la escribe, los siguientes documentos están listos para citar por referencia en lugar de reescribir conceptos de cero:",
    en: "If you're drafting the bill, or advising someone who is, the following documents are ready to cite by reference instead of rewriting concepts from scratch:",
  },
  legisLi1: {
    es: "Síntesis de los 6 RFCs en una sola página, con texto sugerido para el articulado.",
    en: "Synthesis of the 6 RFCs on a single page, with suggested text for the articulado.",
  },
  legisLi2: {
    es: "Marco de responsabilidad civil de 3 capas (operador / sociedad-IA / proveedor de modelo).",
    en: "Three-layer civil liability framework (operator / AI corporation / model provider).",
  },
  legisLi3: {
    es: (
      <>
        Descubrimiento automático vía{" "}
        <DocCode>/.well-known/agents.json</DocCode>.
      </>
    ),
    en: (
      <>
        Automatic discovery via{" "}
        <DocCode>/.well-known/agents.json</DocCode>.
      </>
    ),
  },
  legisLi4: {
    es: (
      <>
        Envelope portable para reciprocidad cross-jurisdiccional (Wyoming
        DAO, MIDAO, Estonia OÜ). Tabla comparativa completa con
        jurisdicciones en{" "}
        <a href="/jurisdicciones" style={linkSty}>
          /jurisdicciones
        </a>
        .
      </>
    ),
    en: (
      <>
        Portable envelope for cross-jurisdictional reciprocity (Wyoming
        DAO, MIDAO, Estonia OÜ). Full comparison table with jurisdictions
        at{" "}
        <a href="/en/jurisdictions" style={linkSty}>
          /en/jurisdictions
        </a>
        .
      </>
    ),
  },
  legisLi5: {
    es: (
      <>
        Especificación normativa del log operativo.{" "}
        <strong>
          Este es el documento clave para enforcement.
        </strong>
      </>
    ),
    en: (
      <>
        Normative specification of the operational log.{" "}
        <strong>This is the key document for enforcement.</strong>
      </>
    ),
  },
  legisLi6: {
    es: "7 vectores de conformidad RFC-004 con valores hex deterministas. Cualquier biblioteca corre los vectores; pasa o no pasa.",
    en: "7 RFC-004 conformance vectors with deterministic hex values. Any library runs the vectors; pass or fail.",
  },
  legisLi7: {
    es: "Documento español de 1 página para regulador / periodista / inspector que llega cold al sitio.",
    en: "1-page document for a regulator / journalist / inspector arriving cold to the site.",
  },
  legisLi8: {
    es: "Registro público de implementaciones (1 reference impl + 4 demos hoy).",
    en: "Public registry of implementations (1 reference impl + 4 demos today).",
  },
  legisLi9: {
    es: "Pegá cualquier URL, obtené score 0-100 de conformidad RFC-002 + RFC-004 en segundos. Sin install.",
    en: "Paste any URL, get a 0-100 RFC-002 + RFC-004 conformance score in seconds. No install.",
  },
  legisLi10: {
    es: "Versión inglesa de la síntesis para prensa internacional + juristas comparados.",
    en: "English version of the synthesis for international press + comparative law scholars.",
  },
  legisOutro: {
    es: (
      <>
        Todo MIT (código) + CC-BY-4.0 (specs). Sin honorarios.
        Conversación pública en{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/discussions"
          style={linkSty}
        >
          github.com/ar-agents/ar-agents/discussions
        </a>
        .
      </>
    ),
    en: (
      <>
        Everything MIT (code) + CC-BY-4.0 (specs). No fees. Public
        conversation at{" "}
        <a
          href="https://github.com/ar-agents/ar-agents/discussions"
          style={linkSty}
        >
          github.com/ar-agents/ar-agents/discussions
        </a>
        .
      </>
    ),
  },
  h2limits: {
    es: "Limitaciones honestas",
    en: "Honest limitations",
  },
  limitsP1: {
    es: "El anteproyecto ya tiene articulado (arts. 14, 102, 258-265) y fue enviado al Senado el 1-jun-2026, pero todavía no es ley: puede cambiar en el Congreso, demorarse o no aprobarse. El toolkit ar-agents funciona y sirve igual: cubre la integración con el Estado argentino para empresas humanas hoy. Si el régimen de sociedades automatizadas se aprueba, ya está listo para ese caso también.",
    en: "The draft bill already has text (arts. 14, 102, 258-265) and was sent to the Senate on June 1, 2026, but it is not law yet: it could change in Congress, be delayed, or not pass. The ar-agents toolkit works either way: it covers Argentine state integration for human-run companies today. If the automated-company regime passes, it's also ready for that case.",
  },
  limitsP2: {
    es: "No hay relación entre ar-agents y los integrantes del gobierno. Esto es infraestructura civil, comercial, abierta, escrita por afuera y para que la use cualquiera.",
    en: "There is no relationship between ar-agents and members of the government. This is civil, commercial, open infrastructure, written from outside and for anyone to use.",
  },
} as const;

const AGENT_FLOW = `// Transcripción simulada: una sociedad-IA "ACME-AI SAS" se incorpora,
// cobra clientes, y opera en Argentina end-to-end.

▶ user: Necesito constituir una sociedad-IA, conseguir CUIT, abrir cuenta
        MP, emitir mi primera factura y mandar WhatsApp al cliente.

  → @ar-agents/igj
    igj_search_entities({ query: "ACME-AI", tipos: ["sas"] })
      ← results: []
      ← coverageNote: "Dataset es muestreo, no real-time..."
    Entidad disponible. Procedo con la constitución.

  → @ar-agents/firma-digital
    firma_inspect_cert({ cert_pem: "<oficial-digital>" })
      ← cuit: "XXXXXXXXXXX", isOntiIssued: true, commonName: "Nazareno Clemente"
    Oficial digital validado.

  → @ar-agents/identity
    validate_cuit({ cuit: "30-12345678-9" })
      ← valid: true, personType: "juridica"
    lookup_cuit_afip({ cuit: "30123456789" })
      ← name: "ACME-AI SAS", taxCondition: "monotributo_a"

  → @ar-agents/banking
    list_psps()
      ← Mercado Pago, Ualá, Naranja X...
    get_usd_oficial({ lookback_days: 7 })
      ← latest: { fecha: "2026-05-08", valor: 1250.50 }

  → @ar-agents/mercadopago
    create_customer({ email: "cliente@example.com" })
      ← id: "cust_abc123"
    create_subscription({ amount: 50000, frequency: "monthly", ... })
      ← id: "sub_xyz789"
      ← init_point: "https://mercadopago.com.ar/subscriptions/..."

  → @ar-agents/facturacion
    emitir_factura({ tipo: "C", monto: 50000, cuit_cliente: "20..." })
      ← cae: "67891234567890", numero: "0001-00000001"

  → @ar-agents/whatsapp
    send_template({ to: "+5491123456789", template: "factura_lista" })
      ← message_id: "wamid.xxx"

  → @ar-agents/boletin-oficial
    bo_subscribe({ owner_id: "acme-ai", cuit: "30123456789" })
      ← id: "sub_bo_1", match: { cuit: "30123456789" }
    Suscrito a notificaciones BO sobre el CUIT propio.

✓ assistant: Listo. Sociedad-IA operando: CUIT registrado, MP cobrando,
            factura electrónica emitida, cliente notificado por WhatsApp,
            BO monitoreado. Tu sociedad-IA está en producción.

  Tiempo total: ~12 segundos (12 llamadas a tools, 9 packages ar-agents de los 16 disponibles).`;

interface Pieza {
  n: number;
  pasoEs: string;
  pasoEn: string;
  requiereEs: string;
  requiereEn: string;
  cobertura: string;
  status: "ready" | "partial";
}

const PIEZAS: ReadonlyArray<Pieza> = [
  { n: 1, pasoEs: "Constitución (datos abiertos)", pasoEn: "Incorporation (open data)", requiereEs: "IGJ datos.jus.gob.ar", requiereEn: "IGJ datos.jus.gob.ar", cobertura: "@ar-agents/igj", status: "ready" },
  { n: 2, pasoEs: "Constitución (acta inscripta)", pasoEn: "Incorporation (filed deed)", requiereEs: "IGJ portal directo", requiereEn: "IGJ direct portal", cobertura: "parcial vía TAD / partial via TAD", status: "partial" },
  { n: 3, pasoEs: "Obtención de CUIT", pasoEn: "Get CUIT (tax ID)", requiereEs: "ARCA padrón", requiereEn: "ARCA registry", cobertura: "@ar-agents/identity", status: "ready" },
  { n: 4, pasoEs: "Validación CUIT vs gob", pasoEn: "CUIT validation vs gov", requiereEs: "AFIP WSCDC", requiereEn: "AFIP WSCDC", cobertura: "@ar-agents/identity", status: "ready" },
  { n: 5, pasoEs: "Apertura cuenta bancaria", pasoEn: "Open bank account", requiereEs: "CBU + Modo / MP", requiereEn: "CBU + Modo / MP", cobertura: "@ar-agents/banking + @ar-agents/mercadopago", status: "ready" },
  { n: 6, pasoEs: "Inscripción monotributo", pasoEn: "Monotributo registration", requiereEs: "AFIP WSFE setup", requiereEn: "AFIP WSFE setup", cobertura: "@ar-agents/facturacion", status: "ready" },
  { n: 7, pasoEs: "Identidad firmante", pasoEn: "Signer identity", requiereEs: "OIDC gov", requiereEn: "Gov OIDC", cobertura: "@ar-agents/mi-argentina", status: "ready" },
  { n: 8, pasoEs: "Firma de actas societarios", pasoEn: "Corporate act signing", requiereEs: "Cert ONTI / AC-Raíz", requiereEn: "ONTI / AC-Raíz cert", cobertura: "@ar-agents/firma-digital", status: "ready" },
  { n: 9, pasoEs: "Facturación electrónica", pasoEn: "Electronic invoicing", requiereEs: "AFIP WSFE", requiereEn: "AFIP WSFE", cobertura: "@ar-agents/facturacion", status: "ready" },
  { n: 10, pasoEs: "Cobro suscripciones", pasoEn: "Subscription billing", requiereEs: "MP Subscriptions", requiereEn: "MP Subscriptions", cobertura: "@ar-agents/mercadopago", status: "ready" },
  { n: 11, pasoEs: "Atención al cliente", pasoEn: "Customer service", requiereEs: "WhatsApp Business", requiereEn: "WhatsApp Business", cobertura: "@ar-agents/whatsapp", status: "ready" },
  { n: 12, pasoEs: "Verificación KYC contraparte", pasoEn: "Counterparty KYC", requiereEs: "RENAPER + bypass", requiereEn: "RENAPER + bypass", cobertura: "@ar-agents/identity-attest", status: "ready" },
  { n: 13, pasoEs: "Riesgo crediticio terceros", pasoEn: "Third-party credit risk", requiereEs: "BCRA Central de Deudores", requiereEn: "BCRA Central de Deudores", cobertura: "@ar-agents/banking", status: "ready" },
  { n: 14, pasoEs: "Logística", pasoEn: "Logistics", requiereEs: "Andreani / OCA / Correo", requiereEn: "Andreani / OCA / Correo", cobertura: "@ar-agents/shipping", status: "ready" },
  { n: 15, pasoEs: "Notificaciones legales", pasoEn: "Legal notifications", requiereEs: "Boletín Oficial monitoring", requiereEn: "Official Gazette monitoring", cobertura: "@ar-agents/boletin-oficial", status: "ready" },
  { n: 16, pasoEs: "Variables macro (USD/CER)", pasoEn: "Macro variables (USD/CER)", requiereEs: "BCRA Principales Variables", requiereEn: "BCRA Key Variables", cobertura: "@ar-agents/banking", status: "ready" },
  { n: 17, pasoEs: "Domicilio legal digital", pasoEn: "Digital legal address", requiereEs: "GDE / TAD", requiereEn: "GDE / TAD", cobertura: "lectura @ar-agents/gde-tad (DEC inbox + IGJ pre-flight; escritura tras RFC-001 § 3.4)", status: "partial" },
];

const FONT_MONO_VAR = "var(--font-geist-mono), ui-monospace, monospace";

export function SociedadesContent({ lang }: { lang: Lang }) {
  const t = (k: keyof typeof T) => T[k][lang];

  return (
    <DocShell
      eyebrow={t("eyebrow") as string}
      title={t("title") as string}
      subtitle={t("subtitle") as string}
    >
      <DocH2>{t("h2plan")}</DocH2>
      <DocP>{t("planP1")}</DocP>
      <DocP>{t("planQuote")}</DocP>

      <DocH2>{t("h2pieces")}</DocH2>
      <DocP>{t("piecesIntro")}</DocP>
      <PiezasTable lang={lang} />
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 24px" }}>
        {t("piecesFooter")}
      </p>

      <DocH2>{t("h2why")}</DocH2>
      <DocP>{t("whyP1")}</DocP>
      <DocP>{t("whyP2")}</DocP>

      <DocH2>{t("h2demo")}</DocH2>
      <DocP>{t("demoIntro")}</DocP>
      <DocBlock>{AGENT_FLOW}</DocBlock>
      <DocP>
        {lang === "es" ? (
          <>
            Y no es solo un demo simulado:{" "}
            <a href="/caso-ar-agents" style={linkSty}>
              nos constituimos a nosotros mismos
            </a>{" "}
            con este mismo flujo, y el audit log quedó firmado y verificable.
          </>
        ) : (
          <>
            And it&apos;s not just a simulated demo:{" "}
            <a href="/en/ar-agents-case" style={linkSty}>
              we incorporated ourselves
            </a>{" "}
            with this same flow, and the audit log is signed and verifiable.
          </>
        )}
      </DocP>

      <DocH2>{t("h2wizard")}</DocH2>
      <DocP>{t("wizardP")}</DocP>

      <DocH2>{t("h2legis")}</DocH2>
      <DocP>{t("legisIntro")}</DocP>
      <ul style={{ paddingLeft: 24, marginBottom: 16, fontSize: 14 }}>
        <li style={{ marginBottom: 6 }}>
          <a
            href={lang === "es" ? "/legislacion" : "/en/legislation"}
            style={linkSty}
          >
            {lang === "es" ? "/legislación" : "/en/legislation"}
          </a>:{" "}
        {t("legisLi1")}
        </li>
        <li style={{ marginBottom: 6 }}>
          <a href="/rfcs/001" style={linkSty}>
            RFC-001
          </a>:{" "}
        {t("legisLi2")}
        </li>
        <li style={{ marginBottom: 6 }}>
          <a href="/rfcs/002" style={linkSty}>
            RFC-002
          </a>:{" "}
        {t("legisLi3")}
        </li>
        <li style={{ marginBottom: 6 }}>
          <a href="/rfcs/003" style={linkSty}>
            RFC-003
          </a>:{" "}
        {t("legisLi4")}
        </li>
        <li style={{ marginBottom: 6 }}>
          <a href="/rfcs/004" style={linkSty}>
            RFC-004
          </a>:{" "}
        {t("legisLi5")}
        </li>
        <li style={{ marginBottom: 6 }}>
          <a href="/test-vectors" style={linkSty}>
            /test-vectors
          </a>:{" "}
        {t("legisLi6")}
        </li>
        <li style={{ marginBottom: 6 }}>
          <a
            href={lang === "es" ? "/auditor" : "/en/auditor"}
            style={linkSty}
          >
            /auditor
          </a>:{" "}
        {t("legisLi7")}
        </li>
        <li style={{ marginBottom: 6 }}>
          <a href="/registro" style={linkSty}>
            /registro
          </a>:{" "}
        {t("legisLi8")}
        </li>
        <li style={{ marginBottom: 6 }}>
          <a href="/certifier" style={linkSty}>
            /certifier
          </a>:{" "}
        {t("legisLi9")}
        </li>
        <li style={{ marginBottom: 6 }}>
          <a href="/en/legislation" style={linkSty}>
            /en/legislation
          </a>:{" "}
        {t("legisLi10")}
        </li>
      </ul>
      <DocP>{t("legisOutro")}</DocP>

      <DocH2>{t("h2limits")}</DocH2>
      <DocP>{t("limitsP1")}</DocP>
      <DocP>{t("limitsP2")}</DocP>
      <SociedadesIaJsonLd />
    </DocShell>
  );
}

function PiezasTable({ lang }: { lang: Lang }) {
  const headers =
    lang === "es"
      ? {
          n: "#",
          paso: "Paso",
          requiere: "Requiere",
          cobertura: "Cobertura ar-agents",
          estado: "Estado",
        }
      : {
          n: "#",
          paso: "Step",
          requiere: "Requires",
          cobertura: "ar-agents coverage",
          estado: "Status",
        };

  return (
    <div style={{ overflowX: "auto", margin: "16px 0" }}>
      <table
        style={{
          width: "100%",
          minWidth: 640,
          borderCollapse: "collapse",
          fontSize: 13,
          background: "var(--bg-tint)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <thead>
          <tr>
            <th style={piezaTh}>{headers.n}</th>
            <th style={piezaTh}>{headers.paso}</th>
            <th style={piezaTh}>{headers.requiere}</th>
            <th style={piezaTh}>{headers.cobertura}</th>
            <th style={piezaTh}>{headers.estado}</th>
          </tr>
        </thead>
        <tbody>
          {PIEZAS.map((p) => (
            <tr
              key={p.n}
              style={{ borderTop: "1px solid var(--border-color)" }}
            >
              <td
                style={{
                  ...piezaTd,
                  color: "var(--text-muted)",
                  fontFamily: FONT_MONO_VAR,
                }}
              >
                {p.n}
              </td>
              <td
                style={{
                  ...piezaTd,
                  color: "var(--text)",
                  fontWeight: 500,
                }}
              >
                {lang === "es" ? p.pasoEs : p.pasoEn}
              </td>
              <td style={{ ...piezaTd, fontSize: 12.5 }}>
                {lang === "es" ? p.requiereEs : p.requiereEn}
              </td>
              <td
                style={{
                  ...piezaTd,
                  fontFamily: FONT_MONO_VAR,
                  fontSize: 12,
                }}
              >
                {p.cobertura}
              </td>
              <td style={piezaTd}>
                <PiezaBadge status={p.status} lang={lang} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PiezaBadge({ status, lang }: { status: Pieza["status"]; lang: Lang }) {
  const isReady = status === "ready";
  const labels =
    lang === "es"
      ? { ready: "listo", partial: "parcial" }
      : { ready: "ready", partial: "partial" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 500,
        fontFamily: FONT_MONO_VAR,
        textTransform: "lowercase",
        background: isReady ? "var(--success-bg)" : "var(--warning-bg)",
        color: isReady ? "var(--success)" : "var(--warning)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: "currentColor",
        }}
      />
      {isReady ? labels.ready : labels.partial}
    </span>
  );
}

const piezaTh: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--border-color)",
};

const piezaTd: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--text-body)",
  verticalAlign: "top",
};
